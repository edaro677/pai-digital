-- PROPUESTA PASO 278. NO EJECUTADA. SQL Server 2022 local; no permisos concedidos.
SET NOCOUNT ON;
SET XACT_ABORT ON;
DECLARE @Target nvarchar(4000)=TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.database'));
IF @Target IS NULL OR DATALENGTH(@Target)<>DATALENGTH(DB_NAME())
 OR @Target COLLATE Latin1_General_100_BIN2<>DB_NAME() COLLATE Latin1_General_100_BIN2
 OR DB_NAME() COLLATE Latin1_General_100_BIN2 NOT IN (N'pai_poc_dev',N'pai_poc_migration_test')
 OR ISNULL(CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName')),N'') COLLATE Latin1_General_100_BIN2<>N'PAIPOC'
 OR ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0) NOT IN (2,3,4)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('ProductMajorVersion')),0)<16
 OR ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 THROW 51200, 'Destino local incompatible.', 1;
IF @@TRANCOUNT<>0 THROW 51201, 'Se requiere una conexion administrativa sin transaccion.', 1;
IF ISNULL(CONVERT(nvarchar(128),SESSION_CONTEXT(N'pai.migration.approval')),N'') COLLATE Latin1_General_100_BIN2<>N'LOCAL_PROGRESS_0002'
 OR ISNULL(IS_MEMBER(N'db_owner'),0)<>1
 THROW 51202, 'Falta aprobacion administrativa explicita.', 1;
DECLARE @Up varchar(max)=TRY_CONVERT(varchar(max),SESSION_CONTEXT(N'pai.migration.upSha256')),
 @Verify varchar(max)=TRY_CONVERT(varchar(max),SESSION_CONTEXT(N'pai.migration.verifySha256')),
 @Down varchar(max)=TRY_CONVERT(varchar(max),SESSION_CONTEXT(N'pai.migration.downSha256'));
IF @Up IS NULL OR @Verify IS NULL OR @Down IS NULL OR DATALENGTH(@Up)<>64 OR DATALENGTH(@Verify)<>64 OR DATALENGTH(@Down)<>64
 OR @Up COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9a-f]%' OR @Verify COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9a-f]%' OR @Down COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9a-f]%'
 THROW 51203, 'Falta manifiesto revisado; comprobar archivos externamente.', 1;
BEGIN TRY
 BEGIN TRANSACTION;
 IF (SELECT COUNT_BIG(*) FROM pai_meta.SchemaMigrations)<>1 OR NOT EXISTS(SELECT 1 FROM pai_meta.SchemaMigrations WHERE MigrationId='0001_initial')
  OR OBJECT_ID(N'pai.ReportEvidence') IS NOT NULL OR OBJECT_ID(N'pai.ReportSubmissions') IS NOT NULL
  OR OBJECT_ID(N'pai.ActivityGoals') IS NOT NULL OR OBJECT_ID(N'pai.EvidenceVerifications') IS NOT NULL
  THROW 51204, 'Se requiere exactamente 0001_initial y ningun artefacto parcial.', 1;
DECLARE @Catalog nvarchar(max), @CatalogHash varchar(64);
SELECT @Catalog=(SELECT
 (SELECT s.name AS [schema],t.name AS [table],c.column_id,c.name,ty.name AS [type],c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.collation_name,c.is_computed
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,c.column_id FOR JSON PATH) AS [columns],
 (SELECT s.name AS [schema],t.name AS [table],cc.name,cc.definition,cc.is_disabled,cc.is_not_trusted
  FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id=cc.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,cc.name FOR JSON PATH) AS [checks],
 (SELECT s.name AS [schema],t.name AS [table],i.name,i.type,i.is_unique,i.is_primary_key,i.is_unique_constraint,i.is_disabled,i.has_filter,i.filter_definition,ic.key_ordinal,ic.index_column_id,ic.is_descending_key,ic.is_included_column,c.name AS [column]
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.indexes i ON i.object_id=t.object_id JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,i.name,ic.index_column_id FOR JSON PATH) AS [indexes],
 (SELECT s.name AS [schema],t.name AS [table],f.name,pc.name AS [column],rs.name AS [referenceSchema],rt.name AS [referenceTable],rc.name AS [referenceColumn],f.delete_referential_action,f.update_referential_action,f.is_disabled,f.is_not_trusted
  FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id JOIN sys.columns pc ON pc.object_id=t.object_id AND pc.column_id=fc.parent_column_id JOIN sys.tables rt ON rt.object_id=f.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fc.referenced_column_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,f.name,fc.constraint_column_id FOR JSON PATH) AS [foreignKeys],
 (SELECT p.class,p.major_id,p.minor_id,p.permission_name,p.state FROM sys.database_permissions p JOIN sys.database_principals r ON r.principal_id=p.grantee_principal_id
  WHERE r.name=N'pai_api_runtime' ORDER BY p.class,p.major_id,p.minor_id,p.permission_name FOR JSON PATH) AS [permissions],
 (SELECT r.name,r.type,r.is_fixed_role,USER_NAME(r.owning_principal_id) AS [owner] FROM sys.database_principals r WHERE r.name=N'pai_api_runtime' FOR JSON PATH) AS [role],
 (SELECT s.name,USER_NAME(s.principal_id) AS [owner] FROM sys.schemas s WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name FOR JSON PATH) AS [owners],
 (SELECT s.name AS [schema],t.name AS [table],tr.name,tr.is_disabled,OBJECT_DEFINITION(tr.object_id) AS [definition] FROM sys.triggers tr JOIN sys.tables t ON t.object_id=tr.parent_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,tr.name FOR JSON PATH) AS [triggers]
 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
SET @CatalogHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',@Catalog),2));
IF @CatalogHash<>(SELECT CatalogSha256 FROM pai_meta.SchemaMigrations WHERE MigrationId='0001_initial')
 THROW 51205, 'Catalogo base distinto: no continuar.', 1;
ALTER TABLE pai.Reports ADD CONSTRAINT UQ_Reports_IdActivity UNIQUE (Id,ActivityId);
CREATE TABLE pai.ActivityGoals (
 ActivityId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 GoalId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 RV rowversion NOT NULL,
 CONSTRAINT PK_ActivityGoals PRIMARY KEY (ActivityId,GoalId),
 CONSTRAINT CK_ActivityGoals_Id CHECK (DATALENGTH(GoalId) BETWEEN 1 AND 64 AND LEFT(GoalId,1) LIKE '[A-Za-z0-9]' AND GoalId NOT LIKE '%[^A-Za-z0-9._-]%'),
 CONSTRAINT FK_ActivityGoals_Activity FOREIGN KEY (ActivityId) REFERENCES pai.Activities(Id)
);
CREATE TABLE pai.ReportEvidence (
 Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 ReportId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 ActivityId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 TargetKind varchar(8) COLLATE Latin1_General_100_BIN2 NOT NULL,
 GoalId varchar(64) COLLATE Latin1_General_100_BIN2 NULL,
 StorageReference varchar(256) COLLATE Latin1_General_100_BIN2 NOT NULL,
 FileName nvarchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
 MediaType varchar(127) COLLATE Latin1_General_100_BIN2 NOT NULL,
 SizeBytes bigint NOT NULL,
 DeclaredBy varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 DeclaredAt datetime2(3) NOT NULL,
 ReportVersion binary(8) NOT NULL,
 RV rowversion NOT NULL,
 InsertionOrder bigint IDENTITY(1,1) NOT NULL,
 CONSTRAINT PK_ReportEvidence PRIMARY KEY (Id),
 CONSTRAINT UQ_ReportEvidence_ReportId UNIQUE (ReportId,Id),
 CONSTRAINT CK_ReportEvidence_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) LIKE '[A-Za-z0-9]' AND Id NOT LIKE '%[^A-Za-z0-9._-]%'),
 CONSTRAINT CK_ReportEvidence_Target CHECK ((TargetKind='activity' AND DATALENGTH(TargetKind)=8 AND GoalId IS NULL) OR (TargetKind='goal' AND DATALENGTH(TargetKind)=4 AND GoalId IS NOT NULL)),
 CONSTRAINT CK_ReportEvidence_Size CHECK (SizeBytes BETWEEN 0 AND 9007199254740991),
 CONSTRAINT CK_ReportEvidence_Reference CHECK (DATALENGTH(StorageReference) BETWEEN 1 AND 256 AND LEFT(StorageReference,1) LIKE '[A-Za-z0-9]' AND StorageReference NOT LIKE '%[^A-Za-z0-9._:-]%'),
 CONSTRAINT CK_ReportEvidence_Metadata CHECK (DATALENGTH(FileName) BETWEEN 2 AND 256 AND DATALENGTH(MediaType) BETWEEN 3 AND 127),
 CONSTRAINT FK_ReportEvidence_Report FOREIGN KEY (ReportId,ActivityId) REFERENCES pai.Reports(Id,ActivityId),
 CONSTRAINT FK_ReportEvidence_Goal FOREIGN KEY (ActivityId,GoalId) REFERENCES pai.ActivityGoals(ActivityId,GoalId),
 CONSTRAINT FK_ReportEvidence_Actor FOREIGN KEY (DeclaredBy) REFERENCES pai.InstitutionalUsers(Id)
);
CREATE INDEX IX_ReportEvidence_ReportOrder ON pai.ReportEvidence(ReportId,InsertionOrder);
CREATE TABLE pai.ReportSubmissions (
 ReportId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 FromState nvarchar(16) COLLATE Latin1_General_100_BIN2 NOT NULL,
 InstitutionalState nvarchar(16) COLLATE Latin1_General_100_BIN2 NOT NULL,
 SubmittedBy varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 SubmittedAt datetime2(3) NOT NULL,
 PolicyVersion varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
 ReportVersion binary(8) NOT NULL,
 SnapshotJson nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
 RV rowversion NOT NULL,
 CONSTRAINT PK_ReportSubmissions PRIMARY KEY (ReportId),
 CONSTRAINT FK_ReportSubmissions_Report FOREIGN KEY (ReportId) REFERENCES pai.Reports(Id),
 CONSTRAINT FK_ReportSubmissions_Actor FOREIGN KEY (SubmittedBy) REFERENCES pai.InstitutionalUsers(Id),
 CONSTRAINT CK_ReportSubmissions_State CHECK (FromState=N'Abierto' AND DATALENGTH(FromState)=14 AND InstitutionalState=N'Enviado' AND DATALENGTH(InstitutionalState)=14),
 CONSTRAINT CK_ReportSubmissions_Policy CHECK (DATALENGTH(PolicyVersion) BETWEEN 1 AND 128 AND LEFT(PolicyVersion,1) LIKE '[A-Za-z0-9]' AND PolicyVersion NOT LIKE '%[^A-Za-z0-9._:-]%'),
 CONSTRAINT CK_ReportSubmissions_Json CHECK (ISJSON(SnapshotJson,OBJECT)=1)
);
CREATE TABLE pai.EvidenceVerifications (
 ReportId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 EvidenceId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 VerifiedAt datetime2(3) NOT NULL,
 AuthorizedForUserId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
 VerificationJson nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
 RV rowversion NOT NULL,
 CONSTRAINT PK_EvidenceVerifications PRIMARY KEY (ReportId,EvidenceId),
 CONSTRAINT FK_EvidenceVerifications_Submission FOREIGN KEY (ReportId) REFERENCES pai.ReportSubmissions(ReportId),
 CONSTRAINT FK_EvidenceVerifications_Declaration FOREIGN KEY (ReportId,EvidenceId) REFERENCES pai.ReportEvidence(ReportId,Id),
 CONSTRAINT FK_EvidenceVerifications_Actor FOREIGN KEY (AuthorizedForUserId) REFERENCES pai.InstitutionalUsers(Id),
 CONSTRAINT CK_EvidenceVerifications_Json CHECK (ISJSON(VerificationJson,OBJECT)=1)
);
ALTER TABLE pai.AuditEvents DROP CONSTRAINT CK_AuditEvents_Action;
ALTER TABLE pai.AuditEvents ADD CONSTRAINT CK_AuditEvents_Action CHECK (Action IN ('poc:report-created','poc:report-updated','poc:user-enabled-changed','poc:assignment-enabled-changed','poc:evidence-declared','poc:report-submitted') AND DATALENGTH(Action)=DATALENGTH(RTRIM(Action)));
ALTER TABLE pai.AuditEvents ADD ProgressJson nvarchar(max) COLLATE Latin1_General_100_BIN2 NULL, CONSTRAINT CK_AuditEvents_Progress CHECK (
 (Action IN ('poc:evidence-declared','poc:report-submitted') AND ProgressJson IS NOT NULL AND ISJSON(ProgressJson,OBJECT)=1)
 OR (Action NOT IN ('poc:evidence-declared','poc:report-submitted') AND ProgressJson IS NULL));
ALTER TABLE pai.IdempotencyRecords DROP CONSTRAINT CK_IdempotencyRecords_Operation;
ALTER TABLE pai.IdempotencyRecords ADD CONSTRAINT CK_IdempotencyRecords_Operation CHECK (Operation IN ('poc:create-report','poc:update-report','poc:associate-evidence','poc:submit-report') AND DATALENGTH(Operation)=DATALENGTH(RTRIM(Operation)));
ALTER TABLE pai.IdempotencyRecords ADD OutcomeProgressJson nvarchar(max) COLLATE Latin1_General_100_BIN2 NULL, CONSTRAINT CK_IdempotencyRecords_Progress CHECK (
 (State='poc:completed' AND Operation IN ('poc:associate-evidence','poc:submit-report') AND OutcomeProgressJson IS NOT NULL AND ISJSON(OutcomeProgressJson,OBJECT)=1)
 OR ((State='poc:reserved' OR Operation IN ('poc:create-report','poc:update-report')) AND OutcomeProgressJson IS NULL));

SELECT @Catalog=(SELECT
 (SELECT s.name AS [schema],t.name AS [table],c.column_id,c.name,ty.name AS [type],c.max_length,c.precision,c.scale,c.is_nullable,c.is_identity,c.collation_name,c.is_computed
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,c.column_id FOR JSON PATH) AS [columns],
 (SELECT s.name AS [schema],t.name AS [table],cc.name,cc.definition,cc.is_disabled,cc.is_not_trusted
  FROM sys.check_constraints cc JOIN sys.tables t ON t.object_id=cc.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,cc.name FOR JSON PATH) AS [checks],
 (SELECT s.name AS [schema],t.name AS [table],i.name,i.type,i.is_unique,i.is_primary_key,i.is_unique_constraint,i.is_disabled,i.has_filter,i.filter_definition,ic.key_ordinal,ic.index_column_id,ic.is_descending_key,ic.is_included_column,c.name AS [column]
  FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.indexes i ON i.object_id=t.object_id JOIN sys.index_columns ic ON ic.object_id=i.object_id AND ic.index_id=i.index_id JOIN sys.columns c ON c.object_id=ic.object_id AND c.column_id=ic.column_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,i.name,ic.index_column_id FOR JSON PATH) AS [indexes],
 (SELECT s.name AS [schema],t.name AS [table],f.name,pc.name AS [column],rs.name AS [referenceSchema],rt.name AS [referenceTable],rc.name AS [referenceColumn],f.delete_referential_action,f.update_referential_action,f.is_disabled,f.is_not_trusted
  FROM sys.foreign_keys f JOIN sys.tables t ON t.object_id=f.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.foreign_key_columns fc ON fc.constraint_object_id=f.object_id JOIN sys.columns pc ON pc.object_id=t.object_id AND pc.column_id=fc.parent_column_id JOIN sys.tables rt ON rt.object_id=f.referenced_object_id JOIN sys.schemas rs ON rs.schema_id=rt.schema_id JOIN sys.columns rc ON rc.object_id=rt.object_id AND rc.column_id=fc.referenced_column_id
  WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,f.name,fc.constraint_column_id FOR JSON PATH) AS [foreignKeys],
 (SELECT p.class,p.major_id,p.minor_id,p.permission_name,p.state FROM sys.database_permissions p JOIN sys.database_principals r ON r.principal_id=p.grantee_principal_id
  WHERE r.name=N'pai_api_runtime' ORDER BY p.class,p.major_id,p.minor_id,p.permission_name FOR JSON PATH) AS [permissions],
 (SELECT r.name,r.type,r.is_fixed_role,USER_NAME(r.owning_principal_id) AS [owner] FROM sys.database_principals r WHERE r.name=N'pai_api_runtime' FOR JSON PATH) AS [role],
 (SELECT s.name,USER_NAME(s.principal_id) AS [owner] FROM sys.schemas s WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name FOR JSON PATH) AS [owners],
 (SELECT s.name AS [schema],t.name AS [table],tr.name,tr.is_disabled,OBJECT_DEFINITION(tr.object_id) AS [definition] FROM sys.triggers tr JOIN sys.tables t ON t.object_id=tr.parent_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name IN (N'pai',N'pai_meta') ORDER BY s.name,t.name,tr.name FOR JSON PATH) AS [triggers]
 FOR JSON PATH, WITHOUT_ARRAY_WRAPPER);
SET @CatalogHash=LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',@Catalog),2));
INSERT pai_meta.SchemaMigrations(MigrationId,UpSha256,VerifySha256,DownSha256,CatalogSha256,AppliedAtUtc)
 VALUES('0002_report_progress',@Up,@Verify,@Down,@CatalogHash,CONVERT(datetime2(3),SYSUTCDATETIME()));
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
