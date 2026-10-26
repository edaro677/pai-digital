# Operator-only disposable SQL trial. Never loaded by HTTP or ordinary tests.
param([switch]$Run)
$ErrorActionPreference='Stop'
if(-not $Run){throw 'Explicit -Run required.'}
if($PSVersionTable.PSVersion.Major -lt 7){[pscustomobject]@{status='FAILED';category='POWERSHELL7_REQUIRED';sqlConnections=0}|ConvertTo-Json -Compress;exit 1}
. (Join-Path $PSScriptRoot '../helpers/migration-sqlclient.ps1')
$trialDatabase='pai_poc_migration_test'
$migrationRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../migrations'))
$evidenceDirectory=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../.test-tmp/paso279'))
[IO.Directory]::CreateDirectory($evidenceDirectory) | Out-Null
$trialEvidence=[ordered]@{status='RUNNING';stages=@();database=$trialDatabase;databaseRemoved=$false;productionDatabaseAccessed=$false}
$trialRunTag=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
$trialEvidence.startedAtUtc=[DateTime]::UtcNow.ToString('o')
$trialEvidence.client='SqlClient'
$trialEvidence.powerShellMajor=$PSVersionTable.PSVersion.Major
$currentStage='PREFLIGHT';$createdHere=$false;$masterConnection=$null;$trialConnection=$null;$ownership=$null

function New-TrialConnection([string]$Database) {
 if($Database -cne 'master' -and $Database -cne $trialDatabase){throw 'Forbidden target.'}
 $value=New-Object System.Data.SqlClient.SqlConnection ("Data Source=lpc:.\PAIPOC;Initial Catalog="+$Database+';Integrated Security=True;Encrypt=True;TrustServerCertificate=True;Connect Timeout=5;Application Name=PAI-P279-SqlClient;Pooling=False')
 $value.Open();return $value
}
function Read-TrialSql($Connection,[string]$Sql,$Transaction=$null,[hashtable]$Parameters=@{}) {
 $command=$Connection.CreateCommand();$command.CommandTimeout=10;$command.CommandText=$Sql
 if($null -ne $Transaction){$command.Transaction=$Transaction}
 foreach($name in $Parameters.Keys){$command.Parameters.Add((New-TrialSqlParameter $name $Parameters[$name])) | Out-Null}
 $reader=$null;$records=New-Object 'System.Collections.Generic.List[object]'
 try {
  $reader=$command.ExecuteReader()
  do {while($reader.Read()){
   $record=[ordered]@{}
   for($i=0;$i -lt $reader.FieldCount;$i++){if($reader.IsDBNull($i)){$record[$reader.GetName($i)]=$null}else{$record[$reader.GetName($i)]=$reader.GetValue($i)}}
   $records.Add([pscustomobject]$record)
  }}while($reader.NextResult())
 }finally{if($null -ne $reader){$reader.Dispose()};$command.Dispose()}
 return $records.ToArray()
}
function Assert-Trial($Condition,[string]$Code){if(-not $Condition){throw $Code}}
function Set-TrialStage([string]$Name){$script:currentStage=$Name}
function Pass-TrialStage([string]$Name){$script:trialEvidence.stages+=@{stage=$Name;status='OK'}}
function Get-TrialException($Failure){
 $value=$Failure.Exception;$sqlFailure=$null
 while($null -ne $value){if($value -is [Data.SqlClient.SqlException]){$sqlFailure=$value};$last=$value;$value=$value.InnerException}
 if($null -ne $sqlFailure){return $sqlFailure};return $last
}
function Get-TrialManifest {
 $manifest=Get-Content (Join-Path $migrationRoot 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 foreach($property in $manifest.files.PSObject.Properties){Assert-Trial ((Get-TrialSha256 (Join-Path $migrationRoot $property.Value.path)) -ceq $property.Value.sha256) 'ORIGINAL_HASH_MISMATCH'}
 $incremental=Get-Content (Join-Path $migrationRoot '0002_report_progress/sha256.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 foreach($name in @('up.sql','verify.sql','down.sql')){Assert-Trial ((Get-TrialSha256 (Join-Path $migrationRoot ('0002_report_progress/'+$name))) -ceq $incremental.$name) 'INCREMENTAL_HASH_MISMATCH'}
 $r1=Get-Content (Join-Path $migrationRoot 'verifiers/0001_initial/r1/manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
 Assert-Trial ((Get-TrialSha256 (Join-Path $migrationRoot 'verifiers/0001_initial/r1/verify.sql')) -ceq $r1.files.'verify.sql'.sha256) 'VERIFIER_HASH_MISMATCH'
 Assert-Trial ((Get-TrialSha256 (Join-Path $migrationRoot 'verifiers/0001_initial/r1/down.development.sql')) -ceq $r1.files.'down.development.sql'.sha256) 'VERIFIER_DOWN_HASH_MISMATCH'
 return @{original=$manifest;incremental=$incremental;revision=$r1}
}
function Invoke-TrialMigration([string]$Path,[bool]$Initial){
 $hashes=Get-TrialManifest
 if($Initial){$approval='LOCAL_SYNTHETIC_ONLY';$up=$hashes.original.files.'up.sql'.sha256;$verify=$hashes.original.files.'verify.sql'.sha256;$down=$hashes.original.files.'down.development.sql'.sha256}
 else{$approval='LOCAL_PROGRESS_0002';$up=$hashes.incremental.'up.sql';$verify=$hashes.incremental.'verify.sql';$down=$hashes.incremental.'down.sql'}
 Read-TrialSql $trialConnection "EXEC sys.sp_set_session_context @key=N'pai.migration.database',@value=@database; EXEC sys.sp_set_session_context @key=N'pai.migration.approval',@value=@approval; EXEC sys.sp_set_session_context @key=N'pai.migration.upSha256',@value=@up; EXEC sys.sp_set_session_context @key=N'pai.migration.verifySha256',@value=@verify; EXEC sys.sp_set_session_context @key=N'pai.migration.downSha256',@value=@down;" $null @{database=$trialDatabase;approval=$approval;up=$up;verify=$verify;down=$down} | Out-Null
 if($Path -like 'verifiers/0001_initial/r1/*'){
  Read-TrialSql $trialConnection "EXEC sys.sp_set_session_context @key=N'pai.verifier.revision',@value=N'r1'; EXEC sys.sp_set_session_context @key=N'pai.verifier.verifySha256',@value=@verify; EXEC sys.sp_set_session_context @key=N'pai.verifier.downSha256',@value=@down;" $null @{verify=$hashes.revision.files.'verify.sql'.sha256;down=$hashes.revision.files.'down.development.sql'.sha256} | Out-Null
 }
 Read-TrialSql $trialConnection (Get-Content (Join-Path $migrationRoot $Path) -Raw -Encoding UTF8) | Out-Null
}
function Get-TrialCounts($Connection){
 $result=[ordered]@{}
 foreach($table in @('InstitutionalUsers','Dependencies','Fichas','AccessAssignments','Activities','Reports','AuditEvents','IdempotencyRecords','ActivityGoals','ReportEvidence','ReportSubmissions','EvidenceVerifications')){
  $row=Read-TrialSql $Connection ('SELECT COUNT_BIG(*) AS total FROM pai.'+$table+';');$result[$table]=[long]$row.total
 }
 return $result
}
function Get-TrialReport($Transaction=$null){
 $row=Read-TrialSql $trialConnection "SELECT Id,ActivityId,PeriodKey,QuantityText,Narrative,State,CreatedBy,CreatedAt,UpdatedBy,UpdatedAt,RV FROM pai.Reports WHERE Id='p279-report';" $Transaction
 Assert-Trial ($null -ne $row.Id) 'REPORT_MISSING'
 return [ordered]@{id=$row.Id;activityId=$row.ActivityId;period=$row.PeriodKey;quantity=$row.QuantityText;narrative=$row.Narrative;state=$row.State;createdBy=$row.CreatedBy;createdAt=$row.CreatedAt.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'");updatedBy=$row.UpdatedBy;updatedAt=$row.UpdatedAt.ToString("yyyy-MM-ddTHH:mm:ss.fff'Z'");version='rv1:'+([BitConverter]::ToString($row.RV).Replace('-','').ToLowerInvariant())}
}
function Complete-TrialOperation($Transaction,[string]$Operation,[string]$Action,$Before,$After,$Progress,[string]$Suffix){
 $beforeJson=$Before | ConvertTo-Json -Depth 20 -Compress;$afterJson=$After | ConvertTo-Json -Depth 20 -Compress;$progressJson=$Progress | ConvertTo-Json -Depth 25 -Compress
 Read-TrialSql $trialConnection "INSERT pai.AuditEvents(Id,ActorId,OccurredAt,CorrelationId,Action,BeforeJson,AfterJson,ProgressJson) VALUES(@audit,N'p279-user','2026-10-26T12:00:00.000',N'p279:trial',@action,@before,@after,@progress);" $Transaction @{audit='p279-audit-'+$Suffix;action=$Action;before=$beforeJson;after=$afterJson;progress=$progressJson} | Out-Null
 $reserved=Read-TrialSql $trialConnection "INSERT pai.IdempotencyRecords(Id,ActorId,Operation,IdempotencyKey,RequestFingerprint,State,CreatedAt) OUTPUT INSERTED.RV VALUES(@id,'p279-user',@operation,@key,REPLICATE('a',64),'poc:reserved','2026-10-26T12:00:00.000');" $Transaction @{id='p279-idem-'+$Suffix;operation=$Operation;key='p279:'+$Suffix}
 $completed=Read-TrialSql $trialConnection "UPDATE pai.IdempotencyRecords SET State='poc:completed',CompletedAt='2026-10-26T12:00:00.000',OutcomeReportId='p279-report',OutcomeAuditEventId=@audit,OutcomeReportJson=@report,OutcomeProgressJson=@progress OUTPUT INSERTED.Id WHERE Id=@id AND RV=@expected AND State='poc:reserved';" $Transaction @{id='p279-idem-'+$Suffix;audit='p279-audit-'+$Suffix;report=$afterJson;progress=$progressJson;expected=[byte[]]$reserved.RV}
 Assert-Trial ($completed.Id -ceq ('p279-idem-'+$Suffix)) 'IDEMPOTENCY_VERSION_FAILED'
}
try {
 Get-TrialManifest | Out-Null
 $masterConnection=New-TrialConnection 'master'
 $checks=Read-TrialSql $masterConnection "SELECT DB_ID(N'pai_poc_migration_test') AS existing,IS_SRVROLEMEMBER('sysadmin') AS admin,CONVERT(int,SERVERPROPERTY('ProductMajorVersion')) AS major,CASE WHEN CONVERT(nvarchar(128),SERVERPROPERTY('Edition')) LIKE N'%Developer%' THEN 1 ELSE 0 END AS developer,CASE WHEN CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName'))=N'PAIPOC' AND CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport'))=N'Shared memory' THEN 1 ELSE 0 END AS expectedLocal;"
 Assert-Trial ($null -eq $checks.existing -and $checks.admin -eq 1 -and $checks.major -eq 16 -and $checks.developer -eq 1 -and $checks.expectedLocal -eq 1) 'PREFLIGHT_FAILED_OR_TARGET_EXISTS'
 Set-TrialStage 'MEMORY_PREFLIGHT'
 $memory=Read-TrialSql $masterConnection 'SELECT process_physical_memory_low,process_virtual_memory_low FROM sys.dm_os_process_memory;'
 $memoryFailure=Get-TrialMemoryFailure $memory.process_physical_memory_low $memory.process_virtual_memory_low
 if($null -ne $memoryFailure){$trialEvidence.blockingCategory=$memoryFailure;throw $memoryFailure}
 Pass-TrialStage 'MEMORY_PREFLIGHT'
 Pass-TrialStage 'PREFLIGHT'
 Set-TrialStage 'CREATE_DATABASE'
 Read-TrialSql $masterConnection 'CREATE DATABASE [pai_poc_migration_test];' | Out-Null
 $createdHere=$true
 $ownership=Read-TrialSql $masterConnection "SELECT database_id,create_date FROM sys.databases WHERE name=N'pai_poc_migration_test';"
 Assert-Trial ($null -ne $ownership.database_id) 'OWNERSHIP_NOT_CAPTURED'
 @{database=$trialDatabase;id=$ownership.database_id;created=$ownership.create_date.ToString('yyyy-MM-ddTHH:mm:ss.fff')}|ConvertTo-Json -Compress|Set-Content -Encoding utf8 (Join-Path $evidenceDirectory 'sqlclient-owned-database.json')
 $trialConnection=New-TrialConnection $trialDatabase
 Pass-TrialStage 'CREATE_DATABASE'
 foreach($entry in @(@('UP_0001','0001_initial/up.sql',$true),@('VERIFY_0001','verifiers/0001_initial/r1/verify.sql',$true),@('UP_0002','0002_report_progress/up.sql',$false),@('VERIFY_0002','0002_report_progress/verify.sql',$false))){Set-TrialStage $entry[0];Invoke-TrialMigration $entry[1] $entry[2];Pass-TrialStage $entry[0]}
 $counts=Get-TrialCounts $trialConnection;Assert-Trial (@($counts.Values | Where-Object {$_ -ne 0}).Count -eq 0) 'INITIAL_COUNTS_NONZERO'
 Set-TrialStage 'SYNTHETIC_PARENTS'
 Read-TrialSql $trialConnection @"
SET XACT_ABORT ON; BEGIN TRY BEGIN TRANSACTION;
INSERT pai.InstitutionalUsers(Id,TenantId,DirectoryObjectId,Alias,Enabled) VALUES('p279-user','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',N'Sintético',1);
INSERT pai.Dependencies(Id,Label) VALUES('p279-dep',N'Sintética');
INSERT pai.Fichas(Id,DependencyId,CycleLabel) VALUES('p279-ficha','p279-dep',N'2026');
INSERT pai.Activities(Id,FichaId,Description) VALUES('p279-activity','p279-ficha',N'Actividad sintética');
INSERT pai.ActivityGoals(ActivityId,GoalId) VALUES('p279-activity','p279-goal');
INSERT pai.Reports(Id,ActivityId,PeriodKey,QuantityText,Narrative,State,CreatedBy,CreatedAt,UpdatedBy,UpdatedAt) VALUES('p279-report','p279-activity',N'2026-Q4','9007199254740993.000100',N'Avance á 😀 漢字','poc-draft','p279-user','2026-10-26T12:00:00.000','p279-user','2026-10-26T12:00:00.000');
COMMIT; END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK; THROW; END CATCH;
"@ | Out-Null
 Pass-TrialStage 'SYNTHETIC_PARENTS'
 Set-TrialStage 'ASSOCIATE_EVIDENCE'
 $before=Get-TrialReport
 $transaction=$trialConnection.BeginTransaction([Data.IsolationLevel]::Serializable)
 try {
  Read-TrialSql $trialConnection "UPDATE pai.Reports SET UpdatedAt='2026-10-26T12:00:00.000' WHERE Id='p279-report';" $transaction | Out-Null
  $after=Get-TrialReport $transaction
  Read-TrialSql $trialConnection "INSERT pai.ReportEvidence(Id,ReportId,ActivityId,TargetKind,GoalId,StorageReference,FileName,MediaType,SizeBytes,DeclaredBy,DeclaredAt,ReportVersion) SELECT 'p279-evidence',Id,ActivityId,'goal','p279-goal','p279-opaque',N'Evidencia á 😀.pdf','application/pdf',123,'p279-user','2026-10-26T12:00:00.000',RV FROM pai.Reports WHERE Id='p279-report';" $transaction | Out-Null
  $declaration=[ordered]@{id='p279-evidence';target=@{kind='goal';activityId='p279-activity';goalId='p279-goal'};storageReference='p279-opaque';name='Evidencia á 😀.pdf';mediaType='application/pdf';sizeBytes=123;reportId='p279-report';status='declared';declaredBy='p279-user';declaredAt='2026-10-26T12:00:00.000Z';version=$after.version}
  Complete-TrialOperation $transaction 'poc:associate-evidence' 'poc:evidence-declared' $before $after @{kind='evidence';evidence=$declaration} 'declare'
  $transaction.Commit()
 }catch{$transaction.Rollback();throw}finally{$transaction.Dispose()}
 Pass-TrialStage 'ASSOCIATE_EVIDENCE'
 Set-TrialStage 'OPTIMISTIC_CONCURRENCY'
 $stale=[byte[]](@(for($hexIndex=4;$hexIndex -lt $before.version.Length;$hexIndex+=2){[Convert]::ToByte($before.version.Substring($hexIndex,2),16)}))
 $row=Read-TrialSql $trialConnection "UPDATE pai.Reports SET Narrative=N'not permitted' OUTPUT INSERTED.Id WHERE Id='p279-report' AND RV=@stale;" $null @{stale=$stale}
 Assert-Trial ($null -eq $row.Id) 'STALE_VERSION_ACCEPTED';Pass-TrialStage 'OPTIMISTIC_CONCURRENCY'
 Set-TrialStage 'SUBMIT'
 $before=Get-TrialReport
 $transaction=$trialConnection.BeginTransaction([Data.IsolationLevel]::Serializable)
 try {
  Read-TrialSql $trialConnection "UPDATE pai.Reports SET UpdatedAt='2026-10-26T12:00:00.000' WHERE Id='p279-report';" $transaction | Out-Null
  $after=Get-TrialReport $transaction
  $proof=@{status='verified';storageReference='p279-opaque';storageVersion='synthetic-v1';sha256=('a'*64);mediaType='application/pdf';sizeBytes=123;verifiedAt='2026-10-26T12:00:00.000Z';authorizedForReportId='p279-report';authorizedForUserId='p279-user'}
  $submission=@{from='Abierto';state='Enviado';report=$after;submittedBy='p279-user';submittedAt='2026-10-26T12:00:00.000Z';policyVersion='synthetic-policy-279';evidence=@(@{status='valid-for-submission';declaration=$declaration;file=$proof})}
  $submissionJson=$submission | ConvertTo-Json -Depth 25 -Compress
  Read-TrialSql $trialConnection "INSERT pai.ReportSubmissions(ReportId,FromState,InstitutionalState,SubmittedBy,SubmittedAt,PolicyVersion,ReportVersion,SnapshotJson) SELECT Id,N'Abierto',N'Enviado','p279-user','2026-10-26T12:00:00.000','synthetic-policy-279',RV,@snapshot FROM pai.Reports WHERE Id='p279-report';" $transaction @{snapshot=$submissionJson} | Out-Null
  Read-TrialSql $trialConnection "INSERT pai.EvidenceVerifications(ReportId,EvidenceId,VerifiedAt,AuthorizedForUserId,VerificationJson) VALUES('p279-report','p279-evidence','2026-10-26T12:00:00.000','p279-user',@proof);" $transaction @{proof=($proof|ConvertTo-Json -Compress)} | Out-Null
  Complete-TrialOperation $transaction 'poc:submit-report' 'poc:report-submitted' $before $after @{kind='submission';submission=$submission} 'send'
  $transaction.Commit()
 }catch{$transaction.Rollback();throw}finally{$transaction.Dispose()}
 Pass-TrialStage 'SUBMIT'
 Set-TrialStage 'INDEPENDENT_PERSISTENCE'
 $observer=New-TrialConnection $trialDatabase
 try {
  $row=Read-TrialSql $observer "SELECT SnapshotJson FROM pai.ReportSubmissions WHERE ReportId='p279-report';"
  Assert-Trial ($row.SnapshotJson -ceq $submissionJson) 'SNAPSHOT_MISMATCH'
  $counts=Get-TrialCounts $observer
  foreach($table in $counts.Keys){$expected=if($table -eq 'AccessAssignments'){0}elseif($table -in @('AuditEvents','IdempotencyRecords')){2}else{1};Assert-Trial ($counts[$table] -eq $expected) ('COUNT_'+$table)}
  $trialEvidence.syntheticCounts=$counts
  $row=Read-TrialSql $observer "SELECT OutcomeProgressJson FROM pai.IdempotencyRecords WHERE ActorId='p279-user' AND Operation='poc:submit-report' AND IdempotencyKey='p279:send';"
  Assert-Trial (($row.OutcomeProgressJson|ConvertFrom-Json).submission.report.quantity -ceq '9007199254740993.000100') 'IDEMPOTENCY_HISTORY_FAILED'
 }finally{$observer.Dispose()}
 Pass-TrialStage 'INDEPENDENT_PERSISTENCE'
 Set-TrialStage 'FK_ROLLBACK'
 $transaction=$trialConnection.BeginTransaction([Data.IsolationLevel]::Serializable)
 try {
  Read-TrialSql $trialConnection "UPDATE pai.Reports SET Narrative=N'rolled back' WHERE Id='p279-report'; INSERT pai.ActivityGoals(ActivityId,GoalId) VALUES('p279-nonexistent','p279-invalid-goal');" $transaction | Out-Null
  throw 'FOREIGN_KEY_WAS_NOT_ENFORCED'
 }catch{$exception=Get-TrialException $_;Assert-Trial ($exception -is [Data.SqlClient.SqlException] -and $exception.Number -eq 547) 'EXPECTED_FK_547';$transaction.Rollback()}finally{$transaction.Dispose()}
 Assert-Trial ((Get-TrialReport).narrative -ceq 'Avance á 😀 漢字') 'ROLLBACK_FAILED';Pass-TrialStage 'FK_ROLLBACK'
 $observer=New-TrialConnection $trialDatabase
 try {
  $observed=Read-TrialSql $observer "SELECT Narrative,(SELECT COUNT(*) FROM pai.ActivityGoals WHERE GoalId='p279-invalid-goal') AS rolledBackGoals FROM pai.Reports WHERE Id='p279-report';"
  Assert-Trial ($observed.Narrative -ceq 'Avance á 😀 漢字' -and $observed.rolledBackGoals -eq 0) 'INDEPENDENT_ROLLBACK_FAILED'
 }finally{$observer.Dispose()}
 Pass-TrialStage 'INDEPENDENT_ROLLBACK'
 Set-TrialStage 'IDEMPOTENCY_UNIQUE'
 $transaction=$trialConnection.BeginTransaction([Data.IsolationLevel]::Serializable)
 try {
  Read-TrialSql $trialConnection "INSERT pai.IdempotencyRecords(Id,ActorId,Operation,IdempotencyKey,RequestFingerprint,State,CreatedAt) VALUES('p279-duplicate','p279-user','poc:submit-report','p279:send',REPLICATE('a',64),'poc:reserved',SYSUTCDATETIME());" $transaction | Out-Null
  throw 'UNIQUENESS_WAS_NOT_ENFORCED'
 }catch{$exception=Get-TrialException $_;Assert-Trial ($exception -is [Data.SqlClient.SqlException] -and $exception.Number -in @(2601,2627)) 'EXPECTED_DUPLICATE';$transaction.Rollback()}finally{$transaction.Dispose()}
 Pass-TrialStage 'IDEMPOTENCY_UNIQUE'
 Set-TrialStage 'DOWN_REJECTS_DATA'
 try {Invoke-TrialMigration '0002_report_progress/down.sql' $false;throw 'DOWN_ACCEPTED_DATA'}catch{$exception=Get-TrialException $_;Assert-Trial ($exception -is [Data.SqlClient.SqlException] -and $exception.Number -eq 51211) 'EXPECTED_DOWN_DATA_REJECTION'}
 Pass-TrialStage 'DOWN_REJECTS_DATA'
 Set-TrialStage 'SELECTIVE_CLEANUP'
 $counts=Get-TrialCounts $trialConnection
 foreach($table in $counts.Keys){Assert-Trial ($counts[$table] -eq $trialEvidence.syntheticCounts[$table]) 'INVENTORY_CHANGED'}
 Read-TrialSql $trialConnection @"
SET XACT_ABORT ON;BEGIN TRY BEGIN TRANSACTION;
DELETE pai.EvidenceVerifications WHERE ReportId='p279-report' AND EvidenceId='p279-evidence';
DELETE pai.ReportSubmissions WHERE ReportId='p279-report';DELETE pai.ReportEvidence WHERE Id='p279-evidence';
DELETE pai.IdempotencyRecords WHERE Id IN ('p279-idem-declare','p279-idem-send');DELETE pai.AuditEvents WHERE Id IN ('p279-audit-declare','p279-audit-send');
DELETE pai.Reports WHERE Id='p279-report';DELETE pai.ActivityGoals WHERE ActivityId='p279-activity' AND GoalId='p279-goal';
DELETE pai.Activities WHERE Id='p279-activity';DELETE pai.Fichas WHERE Id='p279-ficha';DELETE pai.Dependencies WHERE Id='p279-dep';DELETE pai.InstitutionalUsers WHERE Id='p279-user';
COMMIT;END TRY BEGIN CATCH IF XACT_STATE()<>0 ROLLBACK;THROW;END CATCH;
"@ | Out-Null
 $counts=Get-TrialCounts $trialConnection;Assert-Trial (@($counts.Values|Where-Object {$_ -ne 0}).Count -eq 0) 'CLEANUP_COUNTS_NONZERO'
 Pass-TrialStage 'SELECTIVE_CLEANUP'
 Set-TrialStage 'DOWN_0002';Invoke-TrialMigration '0002_report_progress/down.sql' $false;Pass-TrialStage 'DOWN_0002'
 Set-TrialStage 'VERIFY_0001_RESTORED';Invoke-TrialMigration 'verifiers/0001_initial/r1/verify.sql' $true;Pass-TrialStage 'VERIFY_0001_RESTORED'
 $trialEvidence.status='OK'
} catch {
 $exception=Get-TrialException $_
 $trialEvidence.status='FAILED';$trialEvidence.failure=@{stage=$currentStage;errorClass=$exception.GetType().Name;scriptLine=$_.InvocationInfo.ScriptLineNumber;number=if($exception -is [Data.SqlClient.SqlException]){$exception.Number}else{$null};line=if($exception -is [Data.SqlClient.SqlException]){$exception.LineNumber}else{$null}}
} finally {
 if($null -ne $trialConnection){$trialConnection.Dispose()}
 if($createdHere -and $null -ne $ownership -and $null -ne $masterConnection){
  try {
   $row=Read-TrialSql $masterConnection "SELECT database_id,create_date FROM sys.databases WHERE name=N'pai_poc_migration_test';"
   Assert-Trial ($row.database_id -eq $ownership.database_id -and $row.create_date -eq $ownership.create_date) 'DROP_IDENTITY_MISMATCH'
   Read-TrialSql $masterConnection 'DROP DATABASE [pai_poc_migration_test];' | Out-Null
   $row=Read-TrialSql $masterConnection "SELECT DB_ID(N'pai_poc_migration_test') AS remaining;"
   Assert-Trial ($null -eq $row.remaining) 'DROP_NOT_CONFIRMED';$trialEvidence.databaseRemoved=$true
  }catch{$exception=Get-TrialException $_;$trialEvidence.cleanupFailure=@{errorClass=$exception.GetType().Name;number=if($exception -is [Data.SqlClient.SqlException]){$exception.Number}else{$null}}}
 }
 if($null -ne $masterConnection){$masterConnection.Dispose()}
 $trialEvidence|ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 (Join-Path $evidenceDirectory 'sqlclient-evidence.json')
 $trialEvidence|ConvertTo-Json -Depth 12 | Set-Content -Encoding utf8 (Join-Path $evidenceDirectory ('sqlclient-evidence.'+$trialRunTag+'.json'))
 $trialEvidence|ConvertTo-Json -Depth 12 -Compress
}
if($trialEvidence.status -ne 'OK' -or -not $trialEvidence.databaseRemoved){exit 1}
