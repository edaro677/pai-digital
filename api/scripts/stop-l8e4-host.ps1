# Stops only the verified local Core Tools process and its captured worker descendants.
# No SQL, credentials, ACLs, Vite or unrelated Node processes are touched.
$ErrorActionPreference='Stop'
try {
  if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ine ([Environment]::MachineName+'\PAIPOC_Test')){throw 'REJECTED'}
  $listeners=@(Get-NetTCPConnection -State Listen -LocalPort 7071 -ErrorAction SilentlyContinue)
  if($listeners.Count -eq 0){[pscustomobject]@{status='OK';hostAlreadyStopped=$true;writes=0}|ConvertTo-Json -Compress;return}
  if($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1'){throw 'REJECTED'}
  $hostProcess=Get-CimInstance Win32_Process -Filter ('ProcessId='+$listeners[0].OwningProcess)
  $expected='D:\PAI\tools\pai-local-24.22.0-4.16.0\node_modules\azure-functions-core-tools\bin\func.exe'
  if($hostProcess.ExecutablePath -ine $expected -or (Get-FileHash -LiteralPath $expected).Hash -cne 'D0DC30421F3E82AB91213E4D3340735A3DCF656A0A036EB39C6A3E608DF98CE3'){throw 'REJECTED'}
  $snapshot=@(Get-CimInstance Win32_Process)
  $ids=[Collections.Generic.List[int]]::new();$ids.Add([int]$hostProcess.ProcessId)
  for($depth=0;$depth -lt 8;$depth++){
    $children=@($snapshot|Where-Object {[int]$_.ParentProcessId -in $ids -and [int]$_.ProcessId -notin $ids})
    if($children.Count -eq 0){break}
    foreach($child in $children){$ids.Add([int]$child.ProcessId)}
  }
  for($index=$ids.Count-1;$index -ge 0;$index--){
    $current=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ids[$index])
    $original=if($index -eq 0){$hostProcess}else{$snapshot|Where-Object {$_.ProcessId -eq $ids[$index]}|Select-Object -First 1}
    if($current -and $current.CreationDate -eq $original.CreationDate){Stop-Process -Id $ids[$index] -Force -ErrorAction Stop}
  }
  [pscustomobject]@{status='OK';targetedHostStopped=$true;capturedProcesses=$ids.Count;writes=0}|ConvertTo-Json -Compress
}catch{[pscustomobject]@{status='FAILED';category='TARGETED_HOST_STOP_FAILED';writes=0}|ConvertTo-Json -Compress}
