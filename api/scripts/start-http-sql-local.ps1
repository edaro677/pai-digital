param([switch]$CheckOnly,[string]$ToolsDirectory,[switch]$RequireDurableTrial)
$ErrorActionPreference='Stop'
$stage='WINDOWS_IDENTITY'
$api=Split-Path -Parent $PSScriptRoot
$tools=$null
$savedEnvironment=@{}
foreach($key in @('PATH','USERPROFILE','APPDATA','LOCALAPPDATA','TEMP','TMP','PAI_HOST_INTERACTIVE')){$savedEnvironment[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try {
  $identity=[Security.Principal.WindowsIdentity]::GetCurrent()
  $principal=[Security.Principal.WindowsPrincipal]::new($identity)
  if($identity.Name -ine "$env:COMPUTERNAME\PAIPOC_Test" -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'REJECTED'}
  try{$Host.UI.RawUI.WindowTitle='PAI - HOST PAIPOC_Test (Core Tools)'}catch{}
  if($RequireDurableTrial){
    $stage='TEMPORARY_CONFIGURATION'
    $hasIdentity=-not [string]::IsNullOrWhiteSpace($env:PAI_API_IDENTITY_CONFIG)
    $hasTrial=-not [string]::IsNullOrWhiteSpace($env:PAI_L8E4_TRIAL)
    [pscustomobject]@{stage=$stage;identityConfigurationPresent=$hasIdentity;trialConfigurationPresent=$hasTrial;writes=0}|ConvertTo-Json -Compress
    if(-not $hasIdentity -or -not $hasTrial){throw 'REJECTED'}
  }
  $stage='RESTRICTED_PROFILE'
  $profileRecord=Get-ItemProperty -LiteralPath ('Registry::HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\'+$identity.User.Value)
  $ownProfile=[Environment]::ExpandEnvironmentVariables($profileRecord.ProfileImagePath)
  if(-not [IO.Directory]::Exists($ownProfile)){throw 'REJECTED'}
  # Use only this account's profile, never the launching user's inherited cache/TEMP.
  $env:USERPROFILE=$ownProfile
  $env:APPDATA=Join-Path $ownProfile 'AppData/Roaming'
  $env:LOCALAPPDATA=Join-Path $ownProfile 'AppData/Local'
  $env:TEMP=Join-Path $env:LOCALAPPDATA 'Temp';$env:TMP=$env:TEMP
  foreach($dir in @($env:APPDATA,$env:LOCALAPPDATA,$env:TEMP)){[IO.Directory]::CreateDirectory($dir)|Out-Null}
  if($ToolsDirectory){
    $stage='TOOL_SELECTION'
    $tools=(Resolve-Path -LiteralPath $ToolsDirectory -ErrorAction Stop).Path
    if(-not [IO.File]::Exists((Join-Path $tools 'node.exe')) -or -not [IO.File]::Exists((Join-Path $tools 'func.cmd'))){throw 'REJECTED'}
    $env:PATH=$tools+';'+$env:PATH
  }
  $stage='REPOSITORY_READ_ACCESS'
  foreach($relative in @('host.json','package.json','.local-build/functions/index.js','.local-build/composition/sql.js','scripts/start-local.mjs')){
    $handle=[IO.File]::OpenRead((Join-Path $api $relative));$handle.Dispose()
  }
  $stage='NODE_EXECUTE_ACCESS'
  $node=if($tools){Join-Path $tools 'node.exe'}else{(Get-Command node.exe -ErrorAction Stop).Source}
  $oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue'
  $versionOutput=& $node --version 2>&1
  $nodeExit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
  if($nodeExit -ne 0 -or ($versionOutput -join '') -notmatch '^v24\.'){throw 'REJECTED'}
  $stage='CORE_TOOLS_READ_ACCESS'
  $func=if($tools){Join-Path $tools 'func.cmd'}else{(Get-Command func.cmd -ErrorAction Stop).Source}
  $coreRoot=Split-Path -Parent $func
  $coreExe=Join-Path $coreRoot 'node_modules/azure-functions-core-tools/bin/func.exe'
  foreach($component in @($func,(Join-Path $coreRoot 'node_modules/azure-functions-core-tools/lib/main.js'),$coreExe)){
    $handle=[IO.File]::OpenRead($component);$handle.Dispose()
  }
  $stage='CORE_TOOLS_EXECUTE_ACCESS'
  $ErrorActionPreference='Continue'
  # The binary was verified above: the installed shim must not invoke first-time setup.
  $coreOutput=& $func --version 2>&1
  $coreExit=$LASTEXITCODE;$ErrorActionPreference='Stop'
  $coreVersion=[regex]::Match(($coreOutput -join "`n"),'(?m)^4\.\d+\.\d+\s*$').Value.Trim()
  if($coreExit -ne 0 -or -not $coreVersion){throw 'REJECTED'}
  $stage='SQL_IDENTITY_READ_ONLY'
  $ErrorActionPreference='Continue'
  $sqlOutput=& $node (Join-Path $PSScriptRoot 'check-http-sql-identity.mjs') --check 2>&1
  $sqlExit=$LASTEXITCODE;$ErrorActionPreference='Stop'
  $sql=($sqlOutput -join '')|ConvertFrom-Json
  if($sqlExit -ne 0 -or $sql.status -ne 'OK'){
    $safeStage=if($sql.stage -in @('CONNECT','QUERY','IDENTITY_AND_PRIVILEGES')){$sql.stage}else{$null}
    $safeCode=if($sql.technicalCode -in @('ETIMEOUT','ETIMEDOUT','ELOGIN','ESOCKET','EREQUEST','ECONNCLOSED','ENOTOPEN','HYT00','HYT01','08001','28000')){$sql.technicalCode}else{$null}
    $safeChecks=@($sql.failedChecks | Where-Object {$_ -in @('expectedIdentity','expectedDatabase','sharedMemory','sysadmin','dbOwner','controlServer','controlDatabase','transactions')})
    [pscustomobject]@{stage='SQL_PREFLIGHT_DETAIL';sqlStage=$safeStage;technicalCode=$safeCode;failedChecks=$safeChecks;closed=($sql.closed -eq $true);writes=0}|ConvertTo-Json -Compress
    throw 'REJECTED'
  }
  [pscustomobject]@{status='OK';stage='HOST_PREFLIGHT';expectedWindowsIdentity=$true;administrativeWindowsToken=$false;
    nodeExecutable=$true;coreToolsExecutable=$true;coreToolsVersion=$coreVersion;repositoryReadable=$true;
    expectedSqlIdentity=$true;administrativeSqlPrivileges=$false;transport='Shared memory';writes=0} | ConvertTo-Json -Compress
  if($CheckOnly){return}
  $stage='HOST_START'
  # Process-only selection, restored when this host terminates. No env/config files.
  $previousMode=$env:PAI_API_PERSISTENCE
  try{
    $env:PAI_API_PERSISTENCE='sql-local'
    $env:PAI_HOST_INTERACTIVE='1'
    & $node (Join-Path $PSScriptRoot 'start-local.mjs')
  }finally{
    if($null -eq $previousMode){Remove-Item Env:PAI_API_PERSISTENCE -ErrorAction SilentlyContinue}
    else{$env:PAI_API_PERSISTENCE=$previousMode}
  }
} catch {
  # Do not print original exceptions, tool output, paths or account names.
  $technicalCode=$null;$component=$null
  if($stage -eq 'CORE_TOOLS_EXECUTE_ACCESS'){
    $text=$coreOutput -join "`n"
    $match=[regex]::Match($text,'\b(EPERM|EACCES|ENOENT)\b')
    if($match.Success){$technicalCode=$match.Value}
    $location=[regex]::Match($text,"lstat '([^']+)'")
    if($location.Success){
      $leaf=Split-Path -Leaf $location.Groups[1].Value
      if($leaf -in @('AppData','Local','nvm','v24.22.0','node_modules','azure-functions-core-tools','lib','bin','main.js','func.exe','package.json')){$component=$leaf}
      else{$component='OTHER_COMPONENT'}
    }
  }
  [pscustomobject]@{status='FAILED';stage=$stage;category='HOST_ACCESS_OR_IDENTITY_NOT_VERIFIED';code=$technicalCode;component=$component;writes=0} | ConvertTo-Json -Compress
} finally {
  foreach($key in $savedEnvironment.Keys){[Environment]::SetEnvironmentVariable($key,$savedEnvironment[$key],'Process')}
  $coreOutput=$null;$sqlOutput=$null;$identity=$null
}
