# Install Aether Panel as a Windows Scheduled Task (runs at logon)
$ErrorActionPreference = "Stop"
$panelRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$taskName = "AetherPanel"
$node = (Get-Command node -ErrorAction Stop).Source
$server = Join-Path $panelRoot "server.js"

if (-not (Test-Path (Join-Path $panelRoot "node_modules\express"))) {
  Push-Location $panelRoot
  npm install --omit=dev
  Pop-Location
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$server`"" -WorkingDirectory $panelRoot
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host "Installed scheduled task '$taskName'."
Write-Host "Panel: http://127.0.0.1:3847"
Write-Host "Remove later with: scripts\uninstall-autostart.ps1"
