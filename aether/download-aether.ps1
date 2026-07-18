# Download official Aether Windows binary from CluvexStudio/Aether releases.
# Upstream: https://github.com/CluvexStudio/Aether/releases
#
# Usage:
#   .\download-aether.ps1
#   .\download-aether.ps1 -Tag v1.2.0

param(
    [string]$Tag = "v1.2.0"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$asset = "aether-windows-x86_64.zip"
$base = "https://github.com/CluvexStudio/Aether/releases/download/$Tag"
$zip = Join-Path $PSScriptRoot $asset
$shaFile = Join-Path $PSScriptRoot "$asset.sha256"

Write-Host "Upstream: https://github.com/CluvexStudio/Aether"
Write-Host "Downloading $Tag / $asset ..."

Invoke-WebRequest -Uri "$base/$asset" -OutFile $zip -UseBasicParsing
Invoke-WebRequest -Uri "$base/$asset.sha256" -OutFile $shaFile -UseBasicParsing

$expected = ((Get-Content $shaFile -Raw).Trim() -split "\s+")[0].ToLowerInvariant()
$actual = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actual -ne $expected) {
    throw "SHA256 mismatch. expected=$expected actual=$actual"
}

Expand-Archive -Path $zip -DestinationPath $PSScriptRoot -Force
Write-Host "OK: aether.exe ready in $PSScriptRoot"
Write-Host "Docs: https://github.com/CluvexStudio/Aether/blob/main/Docs/GUIDE.en.md"
