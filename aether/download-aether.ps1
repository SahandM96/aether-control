# Download official Aether Windows binary from CluvexStudio/Aether releases.
# Upstream: https://github.com/CluvexStudio/Aether/releases
#
# Usage (recommended on Windows):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\download-aether.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .\download-aether.ps1 -Tag v1.2.0

param(
    [string]$Tag = "v1.2.0",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$asset = "aether-windows-x86_64.zip"
$base = "https://github.com/CluvexStudio/Aether/releases/download/$Tag"
$zip = Join-Path $PSScriptRoot $asset
$shaFile = Join-Path $PSScriptRoot "$asset.sha256"
$exe = Join-Path $PSScriptRoot "aether.exe"

Write-Host "Upstream: https://github.com/CluvexStudio/Aether"
Write-Host "Release : $Tag / $asset"

if ((Test-Path $exe) -and -not $Force) {
    $size = (Get-Item $exe).Length
    Write-Host "OK: aether.exe already present ($size bytes). Use -Force to re-download."
    exit 0
}

Write-Host "Downloading..."
try {
    Invoke-WebRequest -Uri "$base/$asset" -OutFile $zip -UseBasicParsing
    Invoke-WebRequest -Uri "$base/$asset.sha256" -OutFile $shaFile -UseBasicParsing
} catch {
    throw @"
Download failed. Check network access to GitHub releases.
URL: $base/$asset
Error: $($_.Exception.Message)
"@
}

$expected = ((Get-Content $shaFile -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
    throw "SHA256 mismatch. expected=$expected actual=$actual"
}

Expand-Archive -Path $zip -DestinationPath $PSScriptRoot -Force

# Some zips nest files; pull aether.exe up if needed
if (-not (Test-Path $exe)) {
    $found = Get-ChildItem -Path $PSScriptRoot -Recurse -Filter "aether.exe" -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($found) {
        Copy-Item $found.FullName $exe -Force
    }
}

if (-not (Test-Path $exe)) {
    throw "Extract finished but aether.exe was not found in $PSScriptRoot"
}

Write-Host "OK: aether.exe ready in $PSScriptRoot"
Write-Host "Docs: https://github.com/CluvexStudio/Aether/blob/main/Docs/GUIDE.en.md"
