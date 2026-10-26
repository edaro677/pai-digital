# No SQL here. Validate the real restricted token and open a same-user visible console.
$ErrorActionPreference='Stop'
try {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=[Security.Principal.WindowsPrincipal]::new($identity)
  if($identity.Name -ine ([Environment]::MachineName+'\PAIPOC_Test') -or
    $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'REJECTED'}
  $hasIdentity=-not [string]::IsNullOrWhiteSpace($env:PAI_API_IDENTITY_CONFIG)
  $hasTrial=-not [string]::IsNullOrWhiteSpace($env:PAI_L8E4_TRIAL)
  if(-not $hasIdentity -or -not $hasTrial){throw 'REJECTED'}
  $scriptPath=Join-Path $PSScriptRoot 'start-http-sql-local.ps1'
  # START opens a new console instead of retaining this bootstrap's redirected pipes.
  # All command arguments are fixed trusted paths/flags; private values stay in the environment.
  $start=[Diagnostics.ProcessStartInfo]::new()
  $start.FileName='C:/Windows/System32/cmd.exe';$start.UseShellExecute=$false;$start.CreateNoWindow=$true
  $start.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
  $start.WorkingDirectory='C:/Windows/System32'
  $start.Arguments='/d /s /c start "PAI - HOST PAIPOC_Test" /D "C:\Windows\System32" "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NoExit -ExecutionPolicy Bypass -File "'+$scriptPath+'" -ToolsDirectory "D:/PAI/tools/pai-local-24.22.0-4.16.0" -RequireDurableTrial'
  $launcher=[Diagnostics.Process]::Start($start)
  try{if(-not $launcher.WaitForExit(5000)){$launcher.Kill();throw 'REJECTED'};if($launcher.ExitCode -ne 0){throw 'REJECTED'}}finally{$launcher.Dispose()}
  [pscustomobject]@{status='START_REQUESTED';restrictedIdentity=$true;identityConfigurationPresent=$true;trialConfigurationPresent=$true}|ConvertTo-Json -Compress
}catch{
  [pscustomobject]@{status='FAILED';category='RESTRICTED_CHILD_START_FAILED'}|ConvertTo-Json -Compress
  exit 1
}
