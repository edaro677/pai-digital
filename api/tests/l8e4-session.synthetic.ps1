$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/prepare-l8e4-session.ps1')
$script:assertionCount=0
function Assert-LocalTest([bool]$condition){$script:assertionCount++;if(-not $condition){throw ('SYNTHETIC_SESSION_ASSERTION_FAILED_'+$script:assertionCount)}}
$script:fakeOid='33333333-3333-4333-8333-333333333333'
$script:fakeCalls=0
function Fake-L8E4Node {
  $script:fakeCalls++
  $global:LASTEXITCODE=0
  if($args[-1] -eq '--capture-private-pipe'){
    return @{enabled='L8E4_R01';tenantId='9c6cb0e9-1c0e-4137-ac54-6ba138984ef2';objectId=$script:fakeOid;validFrom='2000-01-01T00:00:00.000Z';validUntil='2000-01-01T00:30:00.000Z';mode='write'}|ConvertTo-Json -Compress
  }
  if($args[-1] -eq '--read-approved'){
    $readVersion=if($script:wrongReadVersion){'rv1:0000000000000002'}else{'rv1:0000000000000001'}
    return @{status='OK';httpStatus=200;reportId='synthetic-report';version=$readVersion}|ConvertTo-Json -Compress
  }
  if($args[-1] -eq '--preflight'){
    return @{status='OK';httpStatus=404;guardPositive=$true;identityMatch=$true;writes=0}|ConvertTo-Json -Compress
  }
  return @{status='OK';httpStatus=201;reportId='synthetic-report';version='rv1:0000000000000001'}|ConvertTo-Json -Compress
}
$script:L8E4Node='Fake-L8E4Node'
function Read-Host {param($Prompt,[switch]$AsSecureString);Assert-LocalTest ([bool]$AsSecureString);return (ConvertTo-SecureString 'synthetic-password' -AsPlainText -Force)}
function Get-L8E4IdentityConfiguration {return '{}'}
function Start-L8E4RestrictedProcess {
  param([pscredential]$Credential)
  $info=New-L8E4RestrictedStartInfo $Credential
  try {
    $script:capturedPrivate=ConvertFrom-L8E4PrivateJson $info.EnvironmentVariables['PAI_L8E4_TRIAL']
    Assert-LocalTest ($script:capturedPrivate.validFrom -ceq '2000-01-01T00:00:00.000Z' -and $script:capturedPrivate.validUntil -ceq '2000-01-01T00:30:00.000Z')
    Assert-LocalTest ($script:capturedPrivate.objectId -eq $script:fakeOid)
    Assert-LocalTest (-not $info.UseShellExecute -and $info.CreateNoWindow -and $info.LoadUserProfile -and $info.RedirectStandardOutput -and $info.RedirectStandardError)
    Assert-LocalTest ($info.EnvironmentVariables['PAI_API_IDENTITY_CONFIG'] -ceq '{}' -and $null -eq $info.EnvironmentVariables['USERPROFILE'] -and $null -eq $info.EnvironmentVariables['APPDATA'])
    Assert-LocalTest ($info.UserName -ceq 'PAIPOC_Test' -and $info.Password -is [securestring] -and $info.Arguments -notmatch $script:fakeOid -and $info.Arguments -notmatch 'synthetic-password')
  } finally {$info.Password=$null;$info.EnvironmentVariables.Clear()}
}

$initialized=Initialize-L8E4Trial|ConvertFrom-Json
Assert-LocalTest ($initialized.status -eq 'OK' -and $script:L8E4Trial.objectId -eq $script:fakeOid)
Assert-LocalTest (($initialized|ConvertTo-Json -Compress) -notmatch $script:fakeOid)
Assert-LocalTest ($script:L8E4Trial.validFrom -is [string] -and $script:L8E4Trial.validUntil -is [string])
$env:PAI_L8E4_TRIAL='before-trial';$env:PAI_API_IDENTITY_CONFIG='before-identity'
$modulesBefore=$env:PSModulePath
$started=Start-L8E4TrialHost|ConvertFrom-Json
if($started.status -ne 'START_REQUESTED'){throw ('SYNTHETIC_HOST_STAGE_'+$started.stage)}
Assert-LocalTest ($started.status -eq 'START_REQUESTED')
Assert-LocalTest ($env:PAI_L8E4_TRIAL -eq 'before-trial' -and $env:PAI_API_IDENTITY_CONFIG -eq 'before-identity')
Assert-LocalTest ($env:PSModulePath -ceq $modulesBefore)
foreach($step in @('Prepare','Verify','Cleanup','CleanupParents')){
  $blocked=$false
  try{Invoke-L8E4SqlDraft -Step $step}catch{$blocked=$_.Exception.Message -eq 'L8E4_EXECUTION_NOT_APPROVED'}
  Assert-LocalTest $blocked
}
$preflight=Invoke-L8E4HttpTrial -Preflight|ConvertFrom-Json
Assert-LocalTest ($preflight.status -eq 'OK' -and $script:L8E4GuardConfirmed)
Assert-LocalTest (-not $script:L8E4PostAttempted -and $null -eq $script:L8E4Receipt)
$result=Invoke-L8E4HttpTrial -ExecuteApproved|ConvertFrom-Json
Assert-LocalTest ($result.status -eq 'OK' -and $script:L8E4Receipt.reportId -eq 'synthetic-report')
Assert-LocalTest ($env:PAI_L8E4_TRIAL -eq 'before-trial')
$callsBefore=$script:fakeCalls;$blocked=$false
try{Invoke-L8E4HttpTrial -ExecuteApproved}catch{$blocked=$_.Exception.Message -eq 'L8E4_POST_ALREADY_ATTEMPTED'}
Assert-LocalTest ($blocked -and $script:fakeCalls -eq $callsBefore)
$readHost=Start-L8E4TrialHost -Read|ConvertFrom-Json
Assert-LocalTest ($readHost.status -eq 'START_REQUESTED' -and $script:capturedPrivate.mode -eq 'read' -and $script:capturedPrivate.reportId -eq 'synthetic-report')
$readResult=Invoke-L8E4HttpTrial -Read -ExecuteApproved|ConvertFrom-Json
Assert-LocalTest ($readResult.status -eq 'OK' -and $script:L8E4GetVerified)
$script:wrongReadVersion=$true
$wrongRead=Invoke-L8E4HttpTrial -Read -ExecuteApproved|ConvertFrom-Json
Assert-LocalTest ($wrongRead.status -eq 'FAILED' -and -not $script:L8E4GetVerified)
$script:L8E4Trial.validFrom=[DateTime]::Parse('2000-01-01T00:00:00.000Z').ToUniversalTime()
. (Join-Path $PSScriptRoot '../scripts/prepare-l8e4-session.ps1') -KeepSession
Assert-LocalTest ($script:L8E4PostAttempted -and $script:L8E4Trial.validFrom -is [string] -and $script:L8E4Trial.validFrom -ceq '2000-01-01T00:00:00.000Z')
$cleared=Clear-L8E4TrialSession|ConvertFrom-Json
Assert-LocalTest ($null -eq $script:L8E4Trial -and $null -eq $script:L8E4Receipt -and $null -eq $script:L8E4Verification)
[pscustomobject]@{status='OK';syntheticChecks=$script:assertionCount;realChildren=0;sqlConnections=0;httpRequests=0;writes=0}|ConvertTo-Json -Compress
