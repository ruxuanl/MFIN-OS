$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$runnerPath = Join-Path $repoPath 'scripts\windows\run-daily-discovery.ps1'
# Use a hidden process, start after missed schedules, do not overlap or auto-retry paid work.
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $runnerPath + '"') -WorkingDirectory $repoPath
$trigger = New-ScheduledTaskTrigger -Daily -At '09:00'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName 'MFIN-OS-Daily-Discovery' -Action $action -Trigger $trigger -Settings $settings -Description 'Daily internship recommendations at 09:00 Asia/Shanghai; requires local MFIN OS server.' -Force | Select-Object TaskName,State
