# One-shot setup: download upstream Aether + install panel deps.
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

Write-Host "==> Checking Node.js"
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    throw "Node.js 18+ is required. Install from https://nodejs.org/ then re-run setup.ps1"
}
$ver = (& node -v).TrimStart("v")
$major = [int]($ver.Split(".")[0])
if ($major -lt 18) {
    throw "Node.js $ver found; need 18+. Current: $(node -v)"
}
Write-Host "    $(node -v) / npm $(npm -v)"

Write-Host "==> Downloading Aether binary (CluvexStudio/Aether)"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root "aether\download-aether.ps1")

Write-Host "==> Installing panel dependencies"
Push-Location (Join-Path $root "aether-panel")
try {
    npm install --omit=dev
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "Setup complete."
Write-Host "Start panel:"
Write-Host "  cd aether-panel"
Write-Host "  npm start"
Write-Host "  or double-click aether-panel\start-panel.bat"
Write-Host "Then open http://127.0.0.1:3847"
Write-Host ""
Write-Host "Optional smoke test:"
Write-Host "  powershell -NoProfile -ExecutionPolicy Bypass -File .\verify-install.ps1"
