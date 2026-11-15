$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$nodePath = (Get-Command node).Source
$runnerPath = Join-Path $repoPath 'scripts\daily-discovery.mjs'
$process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $runnerPath + '"') -WorkingDirectory $repoPath -WindowStyle Hidden -Wait -PassThru
exit $process.ExitCode
