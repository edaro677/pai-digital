param([Parameter(Mandatory=$true)][ValidateRange(1,2147483647)][int]$WriterPid)
$ErrorActionPreference='Stop'
try {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=[Security.Principal.WindowsPrincipal]::new($identity)
  if($identity.Name -ine ([Environment]::MachineName+'\PAIPOC_Test') -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'REJECTED'}
  $expected='D:\PAI\tools\pai-local-24.22.0-4.16.0\node_modules\azure-functions-core-tools\bin\func.exe'
  $expectedHash='D0DC30421F3E82AB91213E4D3340735A3DCF656A0A036EB39C6A3E608DF98CE3'
  $nodeExpected='D:\PAI\tools\pai-local-24.22.0-4.16.0\node.exe'
  $writer=Get-CimInstance Win32_Process -Filter ('ProcessId='+$WriterPid)
  if($writer.ExecutablePath -ine $nodeExpected -or (Get-FileHash -LiteralPath $nodeExpected -Algorithm SHA256).Hash -cne 'BA93F9A70BD86FCE3EBBB39EC758501458453467AA92A34A0A3602D1E3FC2B9C'){throw 'REJECTED'}
  $candidate=$WriterPid;$hostProcess=$null
  # Bounded ancestry inspection, not polling or retrying a connection.
  for($depth=0;$depth -lt 8;$depth++) {
    $record=Get-CimInstance Win32_Process -Filter ('ProcessId='+$candidate)
    if($null -eq $record){throw 'REJECTED'}
    if($record.ExecutablePath -ieq $expected){$hostProcess=$record;break}
    if($record.ParentProcessId -le 0 -or $record.ParentProcessId -eq $candidate){throw 'REJECTED'}
    $candidate=[int]$record.ParentProcessId
  }
  if($null -eq $hostProcess -or (Get-FileHash -LiteralPath $expected -Algorithm SHA256).Hash -cne $expectedHash){throw 'REJECTED'}
  $owner=Invoke-CimMethod -InputObject $hostProcess -MethodName GetOwnerSid
  if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $identity.User.Value){throw 'REJECTED'}
  $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 7071)
  if($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $listeners[0].OwningProcess -ne $hostProcess.ProcessId){throw 'REJECTED'}
  [pscustomobject]@{trusted=$true}|ConvertTo-Json -Compress
} catch {
  [pscustomobject]@{trusted=$false}|ConvertTo-Json -Compress
  exit 1
}
