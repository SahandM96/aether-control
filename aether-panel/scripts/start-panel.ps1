# Start Aether Control Panel (local admin UI + process manager)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

if (-not (Test-Path ".\node_modules\express")) {
  Write-Host "Installing dependencies..."
  npm install --omit=dev
}

$hostName = "127.0.0.1"
$port = 3847
$cfgPath = Join-Path $PSScriptRoot "..\data\config.json"
if (Test-Path $cfgPath) {
  try {
    $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json
    if ($cfg.panelHost) { $hostName = $cfg.panelHost }
    if ($cfg.panelPort) { $port = [int]$cfg.panelPort }
  } catch {}
}

Write-Host "Aether Panel -> http://${hostName}:${port}"
node .\server.js
