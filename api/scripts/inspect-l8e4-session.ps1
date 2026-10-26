# Read-only diagnostic. Closed projection; never prints captured values or tokens.
$ErrorActionPreference='Stop'
$testAccount=[Environment]::MachineName+'\PAIPOC_Test'
$restricted=[Security.Principal.WindowsIdentity]::GetCurrent().Name -ieq $testAccount
$stored=Get-Variable -Name L8E4Trial -Scope Global -ErrorAction SilentlyContinue
$trial=if($stored){$stored.Value}else{$null}
$open=$false
if($trial){
  try{$now=[DateTime]::UtcNow;$open=([DateTime]::Parse($trial.validFrom).ToUniversalTime() -lt $now -and $now -lt [DateTime]::Parse($trial.validUntil).ToUniversalTime())}catch{}
}
[pscustomobject]@{
  role=if($restricted){'restricted-host'}else{'observer'}
  functionsLoaded=[bool](Get-Command Initialize-L8E4Trial -ErrorAction SilentlyContinue)
  trialInMemory=($null -ne $trial)
  trialEnvironmentPresent=(-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('PAI_L8E4_TRIAL')))
  identityEnvironmentPresent=(-not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable('PAI_API_IDENTITY_CONFIG')))
  powerShellMajor=$PSVersionTable.PSVersion.Major
  fromIsString=($trial.validFrom -is [string])
  untilIsString=($trial.validUntil -is [string])
  windowOpen=$open
  writes=0
}|ConvertTo-Json -Compress
$stored=$null;$trial=$null
