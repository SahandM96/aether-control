# End-to-end smoke test against a running (or freshly started) panel.
# Prerequisites: setup.ps1 already run (aether.exe + npm install).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-install.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-install.ps1 -SkipStart

param(
    [string]$PanelUrl = "http://127.0.0.1:3847",
    [switch]$SkipStart,
    [switch]$KeepConnected
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$panelDir = Join-Path $root "aether-panel"
$exe = Join-Path $root "aether\aether.exe"
$startedByUs = $false
$panelProc = $null

function Fail([string]$msg) {
    Write-Host "FAIL: $msg" -ForegroundColor Red
    if ($startedByUs -and $panelProc -and -not $panelProc.HasExited) {
        Stop-Process -Id $panelProc.Id -Force -ErrorAction SilentlyContinue
    }
    exit 1
}

function Ok([string]$msg) {
    Write-Host "OK  : $msg" -ForegroundColor Green
}

function Invoke-Json {
    param(
        [string]$Method = "GET",
        [Parameter(Mandatory = $true)][string]$Url,
        [string]$Body = $null
    )
    $args = @{
        Method      = $Method
        Uri         = $Url
        TimeoutSec  = 60
        ErrorAction = "Stop"
    }
    if ($Body -ne $null) {
        $args.ContentType = "application/json"
        $args.Body = $Body
    }
    return Invoke-RestMethod @args
}

Write-Host "=== Aether Control verify-install ==="
Write-Host "Root: $root"

if (-not (Test-Path $exe)) {
    Fail "Missing $exe — run setup.ps1 or aether\download-aether.ps1 first"
}
Ok "aether.exe present"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { Fail "Node.js not found" }
Ok "Node $(node -v)"

if (-not (Test-Path (Join-Path $panelDir "node_modules\express"))) {
    Fail "Panel deps missing — run: cd aether-panel; npm install"
}
Ok "panel node_modules present"

# Health / start panel if needed
$healthy = $false
try {
    $h = Invoke-Json -Url "$PanelUrl/api/health"
    if ($h.ok) { $healthy = $true }
} catch { $healthy = $false }

if (-not $healthy) {
    if ($SkipStart) { Fail "Panel not reachable at $PanelUrl" }
    Write-Host "Starting panel..."
    $panelProc = Start-Process -FilePath "node" -ArgumentList "server.js" `
        -WorkingDirectory $panelDir -WindowStyle Hidden -PassThru
    $startedByUs = $true
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            $h = Invoke-Json -Url "$PanelUrl/api/health"
            if ($h.ok) { $healthy = $true; break }
        } catch {}
    }
    if (-not $healthy) { Fail "Panel did not become healthy at $PanelUrl" }
}
Ok "panel health $PanelUrl"

# Ensure disconnected before connect (clean slate)
try { Invoke-Json -Method POST -Url "$PanelUrl/api/disconnect" -Body "{}" | Out-Null } catch {}
Start-Sleep -Seconds 1

$status = Invoke-Json -Url "$PanelUrl/api/status"
$exePath = $status.status.paths.exe
if (-not $exePath -or -not (Test-Path $exePath)) {
    Fail "Panel resolved missing binary: $exePath"
}
Ok "panel binary path: $exePath"

Write-Host "Connecting (may take up to ~2 minutes for scan)..."
$null = Invoke-Json -Method POST -Url "$PanelUrl/api/connect" -Body "{}"

$connected = $false
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    $status = Invoke-Json -Url "$PanelUrl/api/status"
    $phase = $status.status.phase
    Write-Host ("  [{0}] phase={1} connected={2}" -f $i, $phase, $status.status.connected)
    if ($status.status.connected) { $connected = $true; break }
    if ($phase -eq "disconnected" -and $i -gt 8) {
        if ($status.status.lastError) {
            Fail "Disconnected during connect: $($status.status.lastError)"
        }
    }
}
if (-not $connected) { Fail "Timed out waiting for SOCKS5 / connected phase" }
Ok "connected (SOCKS up)"

# Traffic test
$trace = & curl.exe -x socks5h://127.0.0.1:1819 --max-time 30 -sS https://www.cloudflare.com/cdn-cgi/trace
if ($LASTEXITCODE -ne 0) { Fail "curl through SOCKS failed (exit $LASTEXITCODE)" }
if ($trace -notmatch "warp=on") {
    Write-Host $trace
    Fail "curl trace missing warp=on"
}
Ok "curl SOCKS trace has warp=on"

# Latency + QR/LAN
$lat = Invoke-Json -Method POST -Url "$PanelUrl/api/latency/refresh" -Body "{}"
if ($null -eq $lat.latency.ms) { Fail "latency probe failed: $($lat.latency.error)" }
Ok "latency $($lat.latency.ms) ms"

$lan = Invoke-Json -Method POST -Url "$PanelUrl/api/share/lan" -Body '{"enabled":true}'
if (-not $lan.status.share.shareUrl) { Fail "LAN shareUrl missing" }
if (-not $lan.qrDataUrl) { Fail "QR data URL missing" }
Ok "LAN share $($lan.status.share.shareUrl) + QR"

if (-not $KeepConnected) {
    $null = Invoke-Json -Method POST -Url "$PanelUrl/api/disconnect" -Body "{}"
    Start-Sleep -Seconds 1
    $status = Invoke-Json -Url "$PanelUrl/api/status"
    if ($status.status.connected) { Fail "Still connected after disconnect" }
    Ok "disconnected"
}

Write-Host ""
Write-Host "ALL CHECKS PASSED" -ForegroundColor Green
Write-Host "Verified against CluvexStudio/Aether (see README)."

if ($startedByUs -and $panelProc -and -not $panelProc.HasExited -and -not $KeepConnected) {
    # leave panel running for user convenience after verify
    Write-Host "Panel left running at $PanelUrl"
}
