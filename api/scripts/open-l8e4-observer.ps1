# Interactive entry point. No SQL or durable write is performed here.
$ErrorActionPreference='Stop'
try {
  if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ieq ([Environment]::MachineName+'\PAIPOC_Test')){throw 'REJECTED'}
  $Host.UI.RawUI.WindowTitle='PAI L8-E4 - OBSERVADOR (mantener abierto)'
  . (Join-Path $PSScriptRoot 'prepare-l8e4-session.ps1')
  Write-Host 'OBSERVADOR separado. Abre http://localhost:5174/ y autentica solo en Microsoft.'
  Initialize-L8E4Trial
  if($null -ne $script:L8E4Trial){Start-L8E4TrialHost}
}catch{[pscustomobject]@{status='FAILED';stage='OBSERVER_CONSOLE_START';writes=0}|ConvertTo-Json -Compress}
