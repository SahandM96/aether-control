$ErrorActionPreference = "Stop"
$taskName = "AetherPanel"
Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | ForEach-Object {
  if ($_.CommandLine -and $_.CommandLine -match 'aether-panel\\server\.js') {
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }
}
Write-Host "Removed scheduled task '$taskName' (if present) and stopped panel process."
