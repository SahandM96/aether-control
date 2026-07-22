# End-to-end smoke test against a running (or freshly started) panel.
# Prerequisites: setup.ps1 already run (aether.exe + npm install).
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-install.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-install.ps1 -SkipStart

param(
    [string]$PanelHost = "127.0.0.1",
    [int]$PanelPort = 3847,
    [switch]$SkipStart,
    [switch]$KeepConnected
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$panelDir = Join-Path $root "aether-panel"
$exe = Join-Path $root "aether\aether.exe"
$PanelUrl = "http://${PanelHost}:${PanelPort}"
$startedByUs = $false

function Fail([string]$msg) {
    Write-Host "FAIL: $msg"
    exit 1
}

function Ok([string]$msg) {
    Write-Host "OK  : $msg"
}

function Curl-Json {
    param(
        [ValidateSet("GET", "POST", "PUT")][string]$Method = "GET",
        [Parameter(Mandatory = $true)][string]$Url,
        [string]$Body = $null,
        [int]$MaxTime = 60
    )
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        if ($null -ne $Body) {
            $bodyFile = [System.IO.Path]::GetTempFileName()
            Set-Content -Path $bodyFile -Value $Body -Encoding UTF8
            & curl.exe -sS --max-time $MaxTime -X $Method -H "Content-Type: application/json" --data-binary "@$bodyFile" $Url -o $tmp
            Remove-Item $bodyFile -Force -ErrorAction SilentlyContinue
        } else {
            & curl.exe -sS --max-time $MaxTime -X $Method $Url -o $tmp
        }
        if ($LASTEXITCODE -ne 0) {
            throw "curl exit $LASTEXITCODE for $Method $Url"
        }
        $raw = Get-Content -Path $tmp -Raw -Encoding utf8
        return $raw | ConvertFrom-Json
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

function Test-Health {
    try {
        $h = Curl-Json -Url "$PanelUrl/api/health" -MaxTime 5
        return [bool]$h.ok
    } catch {
        return $false
    }
}

Write-Host "=== Aether Control verify-install ==="
Write-Host "Root: $root"

if (-not (Get-Command curl.exe -ErrorAction SilentlyContinue)) {
    Fail "curl.exe not found (required on Windows for this script)"
}
Ok "curl.exe present"

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

$healthy = Test-Health
if (-not $healthy) {
    if ($SkipStart) { Fail "Panel not reachable at $PanelUrl" }
    Write-Host "Starting panel..."
    $dataDir = Join-Path $panelDir "data"
    if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
    $logOut = Join-Path $dataDir "panel-stdout.log"
    $logErr = Join-Path $dataDir "panel-stderr.log"
    $nodePath = (Get-Command node).Source

    # Detached start via cmd so the process survives the verifier
    $cmd = " `"$nodePath`" server.js >> `"$logOut`" 2>> `"$logErr`" "
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c", $cmd -WorkingDirectory $panelDir -WindowStyle Hidden | Out-Null
    $startedByUs = $true

    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Health) { $healthy = $true; break }
    }
    if (-not $healthy) {
        $tail = ""
        if (Test-Path $logErr) { $tail += "`nSTDERR:`n" + (Get-Content $logErr -Raw) }
        if (Test-Path $logOut) { $tail += "`nSTDOUT:`n" + (Get-Content $logOut -Raw) }
        Fail "Panel did not become healthy at $PanelUrl.$tail"
    }
}
Ok "panel health $PanelUrl"

# Clean slate
try { Curl-Json -Method POST -Url "$PanelUrl/api/disconnect" -Body "{}" | Out-Null } catch {}
Start-Sleep -Seconds 1

$status = Curl-Json -Url "$PanelUrl/api/status"
$exePath = $status.status.paths.exe
if (-not $exePath -or -not (Test-Path $exePath)) {
    Fail "Panel resolved missing binary: $exePath"
}
Ok "panel binary path: $exePath"

Write-Host "Connecting (may take up to ~2 minutes for scan)..."
$null = Curl-Json -Method POST -Url "$PanelUrl/api/connect" -Body "{}"

$connected = $false
for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Seconds 2
    $status = Curl-Json -Url "$PanelUrl/api/status"
    $phase = $status.status.phase
    Write-Host ("  [{0}] phase={1} connected={2}" -f $i, $phase, $status.status.connected)
    if ($status.status.connected) { $connected = $true; break }
    if ($phase -eq "disconnected" -and $i -gt 8 -and $status.status.lastError) {
        Fail "Disconnected during connect: $($status.status.lastError)"
    }
}
if (-not $connected) { Fail "Timed out waiting for SOCKS5 / connected phase" }
Ok "connected (SOCKS up)"

$traceFile = [System.IO.Path]::GetTempFileName()
& curl.exe -x socks5h://127.0.0.1:1819 --max-time 30 -sS https://www.cloudflare.com/cdn-cgi/trace -o $traceFile
if ($LASTEXITCODE -ne 0) { Fail "curl through SOCKS failed (exit $LASTEXITCODE)" }
$trace = Get-Content $traceFile -Raw
Remove-Item $traceFile -Force -ErrorAction SilentlyContinue
if ($trace -notmatch "warp=on") {
    Write-Host $trace
    Fail "curl trace missing warp=on"
}
Ok "curl SOCKS trace has warp=on"

$lat = Curl-Json -Method POST -Url "$PanelUrl/api/latency/refresh" -Body "{}"
if ($null -eq $lat.latency.ms) { Fail "latency probe failed: $($lat.latency.error)" }
Ok "latency $($lat.latency.ms) ms"

$lan = Curl-Json -Method POST -Url "$PanelUrl/api/share/lan" -Body '{"enabled":true}'
if (-not $lan.status.share.shareUrl) { Fail "LAN shareUrl missing" }
if (-not $lan.qrDataUrl) { Fail "QR data URL missing" }
Ok "LAN share $($lan.status.share.shareUrl) + QR"

if (-not $KeepConnected) {
    $null = Curl-Json -Method POST -Url "$PanelUrl/api/disconnect" -Body "{}"
    Start-Sleep -Seconds 1
    $status = Curl-Json -Url "$PanelUrl/api/status"
    if ($status.status.connected) { Fail "Still connected after disconnect" }
    Ok "disconnected"
}

Write-Host ""
Write-Host "ALL CHECKS PASSED"
Write-Host "Verified against CluvexStudio/Aether (see README)."
if ($startedByUs) {
    Write-Host "Panel left running at $PanelUrl"
}
