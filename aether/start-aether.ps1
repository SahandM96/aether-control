# Aether launcher — Iran-friendly defaults (MASQUE + firewall)
# Docs: https://github.com/CluvexStudio/Aether
#
# SOCKS5 after connect: 127.0.0.1:1819
# Test: curl -x socks5h://127.0.0.1:1819 https://www.cloudflare.com/cdn-cgi/trace
#
# If it fails to connect (UDP/QUIC blocked), re-run with: .\start-aether.ps1 -Http2
# If still blocked on TLS handshake: .\start-aether.ps1 -Http2 -Fragment

param(
    [switch]$Http2,
    [switch]$Fragment,
    [ValidateSet("turbo", "balanced", "thorough", "stealth")]
    [string]$Scan = "balanced",
    [ValidateSet("firewall", "gfw", "off")]
    [string]$Noize = "firewall",
    [string]$Bind = "127.0.0.1:1819"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$exe = Join-Path $PSScriptRoot "aether.exe"
if (-not (Test-Path $exe)) {
    throw "aether.exe not found in $PSScriptRoot"
}

$args = @(
    "--masque",
    "-4",
    "--scan", $Scan,
    "--noize", $Noize,
    "--bind", $Bind,
    "--quick-reconnect"
)

if ($Http2) {
    $args += "--h2"
}
if ($Fragment) {
    if (-not $Http2) {
        Write-Warning "Fragment only applies to HTTP/2; enabling --h2"
        $args += "--h2"
    }
    $args += "--fragment"
}

Write-Host "Starting Aether..."
Write-Host "  protocol : MASQUE$(if ($Http2 -or $Fragment) { ' (HTTP/2)' } else { ' (HTTP/3)' })"
Write-Host "  scan     : $Scan"
Write-Host "  noize    : $Noize"
Write-Host "  socks5   : $Bind"
Write-Host ""

& $exe @args
