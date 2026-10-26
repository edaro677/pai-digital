param([switch]$KeepSession)
# Dot-source only defines functions. No login, host, SQL or HTTP operation occurs on import.
# Private identity values remain in this PowerShell process and child environment, never files/output.
$script:L8E4Root=Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$script:L8E4Node='D:/PAI/tools/pai-local-24.22.0-4.16.0/node.exe'
if(-not $KeepSession){
$script:L8E4Trial=$null
$script:L8E4Receipt=$null
$script:L8E4Verification=$null
$script:L8E4PostAttempted=$false
$script:L8E4GetVerified=$false
$script:L8E4GuardConfirmed=$false
}
function ConvertFrom-L8E4PrivateJson([string]$Json) {
  # PowerShell 7.5+ otherwise converts ISO strings to DateTime and drops .000 on serialization.
  if($PSVersionTable.PSVersion -ge [version]'7.5'){
    return ConvertFrom-Json -InputObject $Json -DateKind String
  }
  return ConvertFrom-Json -InputObject $Json
}
if($KeepSession -and $null -ne $script:L8E4Trial){
  # Repair only already-captured UTC, millisecond-exact DateTime values, without changing the instant/window.
  foreach($field in @('validFrom','validUntil')){
    $stamp=$script:L8E4Trial.$field
    if($stamp -is [datetime]){
      if($stamp.Kind -ne [DateTimeKind]::Utc -or $stamp.Ticks % [TimeSpan]::TicksPerMillisecond -ne 0){throw 'L8E4_PRIVATE_DATE_INVALID'}
      $script:L8E4Trial.$field=$stamp.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'",[Globalization.CultureInfo]::InvariantCulture)
    }
  }
  $stamp=$null
}
function Initialize-L8E4Trial {
  $priorPreference=$ErrorActionPreference
  try {
    Write-Host 'Abre http://localhost:5174/ e inicia sesion solo en Microsoft. Cancela un consentimiento nuevo.'
    $ErrorActionPreference='Continue'
    $privateOutput=& $script:L8E4Node (Join-Path $PSScriptRoot 'l8e4-http-trial.mjs') --capture-private-pipe
    $code=$LASTEXITCODE;$ErrorActionPreference='Stop'
    if($code -ne 0){throw 'REJECTED'}
    $value=ConvertFrom-L8E4PrivateJson ($privateOutput -join '')
    if($value.enabled -ne 'L8E4_R01' -or $value.mode -ne 'write' -or $value.tenantId -ne '9c6cb0e9-1c0e-4137-ac54-6ba138984ef2' -or $value.objectId -notmatch '^[0-9a-f-]{36}$'){throw 'REJECTED'}
    $script:L8E4Trial=$value;$script:L8E4Receipt=$null;$script:L8E4Verification=$null;$script:L8E4PostAttempted=$false;$script:L8E4GetVerified=$false;$script:L8E4GuardConfirmed=$false
    [pscustomobject]@{status='OK';validatedIdentityInMemory=$true;tokensStored=$false;writes=0}|ConvertTo-Json -Compress
  } catch { $script:L8E4Trial=$null;[pscustomobject]@{status='FAILED';category='L8E4_IDENTITY_CAPTURE_FAILED';writes=0}|ConvertTo-Json -Compress }
  finally {$privateOutput=$null;$value=$null;$ErrorActionPreference=$priorPreference}
}
function Get-L8E4IdentityConfiguration {
  $line=@(Get-Content -LiteralPath (Join-Path $script:L8E4Root '.env.local') | Where-Object {$_ -match '^VITE_ENTRA_CLIENT_ID='})
  if($line.Count -ne 1){throw 'REJECTED'}
  $spa=($line[0] -split '=',2)[1].Trim().Trim('"',"'")
  if($spa -notmatch '^[0-9a-fA-F-]{36}$'){throw 'REJECTED'}
  $tenant='9c6cb0e9-1c0e-4137-ac54-6ba138984ef2'
  return @{tenantId=$tenant;audience='aca30f77-872a-4cc5-a540-0a7547d95f53';requiredScope='access_as_user';metadataUrl="https://login.microsoftonline.com/$tenant/v2.0/.well-known/openid-configuration";jwksUrl="https://login.microsoftonline.com/$tenant/discovery/v2.0/keys";tokenVersion='2.0';clockToleranceSeconds=30;allowedClientIds=@($spa.ToLowerInvariant())}|ConvertTo-Json -Compress
}
function New-L8E4RestrictedStartInfo([pscredential]$Credential) {
  $info=[Diagnostics.ProcessStartInfo]::new()
  $info.FileName='C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe'
  $child=Join-Path $PSScriptRoot 'start-l8e4-restricted-child.ps1'
  $info.Arguments='-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "'+$child+'"'
  $info.WorkingDirectory='C:/Windows/System32'
  $info.UseShellExecute=$false;$info.CreateNoWindow=$true;$info.LoadUserProfile=$true
  $info.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
  $info.UserName='PAIPOC_Test';$info.Domain=[Environment]::MachineName;$info.Password=$Credential.Password
  $info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  # Explicit Unicode environment block. Never inherit the observer's profile/caches.
  $info.EnvironmentVariables.Clear()
  $values=@{SystemRoot='C:\Windows';WINDIR='C:\Windows';COMSPEC='C:\Windows\System32\cmd.exe';
    PATH='C:\Windows\System32;C:\Windows\System32\Wbem;C:\Windows\System32\WindowsPowerShell\v1.0';
    PSModulePath='C:\Windows\System32\WindowsPowerShell\v1.0\Modules';
    COMPUTERNAME=[Environment]::MachineName;USERNAME='PAIPOC_Test';USERDOMAIN=[Environment]::MachineName;
    PAI_API_IDENTITY_CONFIG=$env:PAI_API_IDENTITY_CONFIG;PAI_L8E4_TRIAL=$env:PAI_L8E4_TRIAL}
  foreach($key in $values.Keys){$info.EnvironmentVariables[$key]=[string]$values[$key]}
  $values=$null
  return $info
}
function Start-L8E4RestrictedProcess([pscredential]$Credential) {
  $info=$null;$process=$null
  try {
    $info=New-L8E4RestrictedStartInfo $Credential
    $process=[Diagnostics.Process]::Start($info)
    $outTask=$process.StandardOutput.ReadToEndAsync();$errTask=$process.StandardError.ReadToEndAsync()
    if(-not $process.WaitForExit(10000)){$process.Kill();throw 'REJECTED'}
    if(-not ([Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($outTask,$errTask),3000))){throw 'REJECTED'}
    $output=$outTask.GetAwaiter().GetResult();$errors=$errTask.GetAwaiter().GetResult()
    if($process.ExitCode -ne 0 -or $output.Length -gt 2048 -or $errors.Length -ne 0){throw 'REJECTED'}
    $result=$output|ConvertFrom-Json
    if($result.status -ne 'START_REQUESTED' -or $result.restrictedIdentity -ne $true -or
      $result.identityConfigurationPresent -ne $true -or $result.trialConfigurationPresent -ne $true){throw 'REJECTED'}
  } finally {
    if($process){$process.Dispose()}
    if($info){$info.Password=$null;$info.EnvironmentVariables.Clear()}
    $output=$null;$errors=$null;$result=$null;$info=$null
  }
}
function Start-L8E4TrialHost {
  param([switch]$Read)
  $savedTrial=$env:PAI_L8E4_TRIAL;$savedIdentity=$env:PAI_API_IDENTITY_CONFIG;$savedModules=$env:PSModulePath;$cred=$null;$securePassword=$null
  $hostStage='PRIVATE_CONFIGURATION'
  try {
    if($null -eq $script:L8E4Trial){throw 'REJECTED'}
    $private=ConvertFrom-L8E4PrivateJson ($script:L8E4Trial|ConvertTo-Json -Compress)
    if($Read){
      if($null -eq $script:L8E4Receipt -or $script:L8E4Receipt.httpStatus -ne 201){throw 'REJECTED'}
      $private.mode='read';$private|Add-Member -NotePropertyName reportId -NotePropertyValue $script:L8E4Receipt.reportId
    }
    $env:PAI_L8E4_TRIAL=$private|ConvertTo-Json -Compress
    $env:PAI_API_IDENTITY_CONFIG=Get-L8E4IdentityConfiguration
    $hostStage='CREDENTIAL_PROMPT'
    $securePassword=Read-Host 'PAIPOC_Test: introduzca la contrasena aqui (entrada oculta)' -AsSecureString
    $cred=[pscredential]::new(([Environment]::MachineName+'\PAIPOC_Test'),$securePassword)
    $hostStage='RESTRICTED_PROCESS_START'
    # The child is Windows PowerShell 5.1; do not inherit incompatible PowerShell 7 modules.
    $env:PSModulePath='C:\Windows\System32\WindowsPowerShell\v1.0\Modules'
    # Bootstrap under the fixed writer identity with an explicit memory-only environment;
    # that process opens the visible host without another credential/context switch.
    Start-L8E4RestrictedProcess $cred
    [pscustomobject]@{status='START_REQUESTED';readMode=[bool]$Read;identityNotDisplayed=$true}|ConvertTo-Json -Compress
  } catch {[pscustomobject]@{status='FAILED';category='L8E4_HOST_START_FAILED';stage=$hostStage}|ConvertTo-Json -Compress}
  finally {[Environment]::SetEnvironmentVariable('PAI_L8E4_TRIAL',$savedTrial,'Process');[Environment]::SetEnvironmentVariable('PAI_API_IDENTITY_CONFIG',$savedIdentity,'Process');[Environment]::SetEnvironmentVariable('PSModulePath',$savedModules,'Process');$cred=$null;if($securePassword){$securePassword.Dispose()};$securePassword=$null;$private=$null}
}
function Invoke-L8E4HttpTrial {
  param([switch]$Read,[switch]$Preflight,[switch]$ExecuteApproved)
  if(($Read -and $Preflight) -or (-not $Preflight -and -not $ExecuteApproved) -or $null -eq $script:L8E4Trial){throw 'L8E4_EXECUTION_NOT_APPROVED'}
  if($Read){$script:L8E4GetVerified=$false}
  if(-not $Read -and -not $Preflight){if($script:L8E4PostAttempted){throw 'L8E4_POST_ALREADY_ATTEMPTED'};$script:L8E4PostAttempted=$true}
  $saved=$env:PAI_L8E4_TRIAL;$oldPreference=$ErrorActionPreference
  try {
    $private=ConvertFrom-L8E4PrivateJson ($script:L8E4Trial|ConvertTo-Json -Compress)
    $mode='--post-approved'
    if($Preflight){$mode='--preflight';$script:L8E4GuardConfirmed=$false}
    if($Read){
      if($null -eq $script:L8E4Receipt -or $script:L8E4Receipt.httpStatus -ne 201){throw 'REJECTED'}
      $private.mode='read';$private|Add-Member -NotePropertyName reportId -NotePropertyValue $script:L8E4Receipt.reportId
      $mode='--read-approved'
    }
    $env:PAI_L8E4_TRIAL=$private|ConvertTo-Json -Compress
    Write-Host 'Host previamente listo. Abre http://localhost:5174/; un unico intento, sin repetir ante fallo.'
    $ErrorActionPreference='Continue'
    $resultOutput=& $script:L8E4Node (Join-Path $PSScriptRoot 'l8e4-http-trial.mjs') $mode
    $code=$LASTEXITCODE;$ErrorActionPreference='Stop'
    $result=($resultOutput -join '')|ConvertFrom-Json
    if($code -ne 0 -or $result.status -ne 'OK'){throw 'REJECTED'}
    if($Preflight){if(-not $result.guardPositive -or -not $result.identityMatch){throw 'REJECTED'};$script:L8E4GuardConfirmed=$true}
    elseif(-not $Read){$script:L8E4Receipt=$result}
    else {if($result.version -cne $script:L8E4Receipt.version){throw 'REJECTED'};$script:L8E4GetVerified=$true}
    # Only projected synthetic receipt, never identity or token.
    $result|ConvertTo-Json -Compress
  } catch {[pscustomobject]@{status='FAILED';category='L8E4_HTTP_TRIAL_FAILED';doNotRepeat=$true}|ConvertTo-Json -Compress}
  finally {[Environment]::SetEnvironmentVariable('PAI_L8E4_TRIAL',$saved,'Process');$private=$null;$resultOutput=$null;$ErrorActionPreference=$oldPreference}
}
function Invoke-L8E4SqlDraft {
  param([Parameter(Mandatory=$true)][ValidateSet('Prepare','Verify','Cleanup','CleanupParents')][string]$Step,[switch]$ExecuteApproved)
  if(-not $ExecuteApproved -or $null -eq $script:L8E4Trial){throw 'L8E4_EXECUTION_NOT_APPROVED'}
  $connection=$null;$reader=$null;$command=$null
  $sqlStage='PRECONDITIONS'
  try {
    if([Security.Principal.WindowsIdentity]::GetCurrent().Name -ieq ([Environment]::MachineName+'\PAIPOC_Test')){throw 'REJECTED'}
    if($Step -eq 'Prepare' -and -not $script:L8E4GuardConfirmed){throw 'REJECTED'}
    if($Step -eq 'Verify'){$script:L8E4Verification=$null}
    if($Step -in @('Cleanup','CleanupParents')){
      if(@([Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners()|Where-Object {$_.Port -eq 7071}).Count -ne 0){throw 'REJECTED'}
    }
    $map=@{Prepare=@('01_prepare.parents.sql','PREPARE_SYNTHETIC_PARENTS_ONLY');Verify=@('02_verify.result.sql','READ_DURABLE_RESULT_ONLY');Cleanup=@('03_cleanup.admin.sql','CLEAN_SYNTHETIC_L8E4_R01_ONLY');CleanupParents=@('04_cleanup.parents-only.admin.sql','CLEAN_SYNTHETIC_PARENTS_ONLY')}
    $directory=Join-Path $PSScriptRoot 'sql/l8e4-durable'
    $file=Join-Path $directory $map[$Step][0]
    $sqlStage='SCRIPT_HASH'
    $manifest=Get-Content -LiteralPath (Join-Path $directory 'sha256.json') -Raw|ConvertFrom-Json
    if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $manifest.($map[$Step][0])){throw 'REJECTED'}
    $values=@{'pai.l8e4.approval'=$map[$Step][1];'pai.l8e4.actor_object_id'=$script:L8E4Trial.objectId}
    if($Step -eq 'Prepare'){$values['pai.l8e4.positive_policy_approved']='1';$values['pai.l8e4.valid_from_utc']=$script:L8E4Trial.validFrom;$values['pai.l8e4.valid_until_utc']=$script:L8E4Trial.validUntil}
    if($Step -in @('Verify','Cleanup')){
      if($null -eq $script:L8E4Receipt -or $script:L8E4Receipt.httpStatus -ne 201){throw 'REJECTED'}
      $values['pai.l8e4.report_id']=$script:L8E4Receipt.reportId
    }
    if($Step -eq 'Cleanup'){
      if(-not $script:L8E4GetVerified -or $null -eq $script:L8E4Verification -or $script:L8E4Verification.Id -ne $script:L8E4Receipt.reportId){throw 'REJECTED'}
      $values['pai.l8e4.synthetic_audit_deletion_approved']='1'
      $values['pai.l8e4.audit_snapshot_sha256']=$script:L8E4Verification.AuditSnapshotSha256
      $values['pai.l8e4.outcome_snapshot_sha256']=$script:L8E4Verification.OutcomeSnapshotSha256
    }
    $connection=[System.Data.Odbc.OdbcConnection]::new('Driver={ODBC Driver 17 for SQL Server};Server=lpc:.\PAIPOC;Database=pai_poc_dev;Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;Connection Timeout=10;APP=PAI-L8E4-Admin;')
    $sqlStage='CONNECT';$connection.Open()
    $sqlStage='SESSION_CONTEXT'
    foreach($key in $values.Keys){
      $context=$connection.CreateCommand();$context.CommandTimeout=10
      try{
        $context.CommandText='EXEC sys.sp_set_session_context @key=?, @value=?, @read_only=1;'
        [void]$context.Parameters.Add('context_key',[System.Data.Odbc.OdbcType]::NVarChar,128);$context.Parameters[0].Value=$key
        [void]$context.Parameters.Add('context_value',[System.Data.Odbc.OdbcType]::NVarChar,2048);$context.Parameters[1].Value=[string]$values[$key]
        [void]$context.ExecuteNonQuery()
      }finally{$context.Dispose()}
    }
    $command=$connection.CreateCommand();$command.CommandTimeout=10
    $command.CommandText=[IO.File]::ReadAllText($file)
    $sqlStage='EXECUTE_APPROVED_SCRIPT'
    $reader=$command.ExecuteReader();$rowCount=0;$verifiedRow=$null
    do{while($reader.Read()){
      $rowCount++
      if($Step -eq 'Verify'){
        $verifiedRow=[ordered]@{}
        foreach($field in @('Id','ActivityId','PeriodKey','QuantityText','Narrative','State','CreatedAtUtc','UpdatedAtUtc','Version','AuditEventId','IdempotencyRecordId','AuditSnapshotSha256','OutcomeSnapshotSha256')){$verifiedRow[$field]=[string]$reader[$field]}
      }
    }}while($reader.NextResult())
    $sqlStage='RESULT_VALIDATION'
    if($rowCount -ne 1){throw 'REJECTED'}
    if($Step -eq 'Verify'){
      if($verifiedRow.Id -ne $script:L8E4Receipt.reportId -or $verifiedRow.Version -cne $script:L8E4Receipt.version){throw 'REJECTED'}
      # Contains only the synthetic result, opaque version and snapshot hashes. No tenant/oid or token.
      $evidenceDirectory=Join-Path $script:L8E4Root 'api/.test-tmp/l8e4-durable'
      $sqlStage='EVIDENCE_WRITE'
      [IO.Directory]::CreateDirectory($evidenceDirectory)|Out-Null
      [IO.File]::WriteAllText((Join-Path $evidenceDirectory 'verified-synthetic-result.json'),($verifiedRow|ConvertTo-Json -Compress),[Text.UTF8Encoding]::new($false))
      $script:L8E4Verification=$verifiedRow
    }
    [pscustomobject]@{status='OK';step=$Step;validatedResultRows=$rowCount}|ConvertTo-Json -Compress
  }catch{
    $states=@();$numbers=@();$native=$_.Exception
    for($depth=0;$depth -lt 8 -and $null -ne $native;$depth++){
      if($native.GetType().Name -eq 'OdbcException'){
        foreach($item in $native.Errors){
          if($item.SQLState -in @('HYT00','HYT01','42000','23000','08001','08003','28000')){$states+=$item.SQLState}
          if($item.NativeError -is [int] -and $item.NativeError -ge 0){$numbers+=$item.NativeError}
        }
      }
      $native=$native.InnerException
    }
    [pscustomobject]@{status='FAILED';step=$Step;stage=$sqlStage;category='L8E4_SQL_DRAFT_FAILED';sqlStates=@($states|Sort-Object -Unique);sqlNumbers=@($numbers|Sort-Object -Unique);doNotRepeat=$true}|ConvertTo-Json -Compress
    $native=$null
  }
  finally{try{if($reader){$reader.Dispose()};if($command){$command.Dispose()};if($connection){$connection.Close();$connection.Dispose()}}catch{[pscustomobject]@{status='FAILED';category='L8E4_SQL_CLOSE_FAILED'}|ConvertTo-Json -Compress};$values=$null;$verifiedRow=$null}
}
function Clear-L8E4TrialSession {
  $script:L8E4Trial=$null;$script:L8E4Receipt=$null;$script:L8E4Verification=$null;$script:L8E4PostAttempted=$false;$script:L8E4GetVerified=$false;$script:L8E4GuardConfirmed=$false
  [pscustomobject]@{status='CLEARED';controlledIdentityReferencesDiscarded=$true}|ConvertTo-Json -Compress
}
