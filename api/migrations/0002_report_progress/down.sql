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
BEGIN TRY
 BEGIN TRANSACTION;
 IF (SELECT COUNT_BIG(*) FROM pai_meta.SchemaMigrations)<>2 OR NOT EXISTS(SELECT 1 FROM pai_meta.SchemaMigrations WHERE MigrationId='0002_report_progress')
 THROW 51209, 'Historial incompatible con reversion.', 1;
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
IF @CatalogHash<>(SELECT CatalogSha256 FROM pai_meta.SchemaMigrations WHERE MigrationId='0002_report_progress') THROW 51210, 'Catalogo distinto al aplicado.', 1;
IF EXISTS(SELECT 1 FROM pai.EvidenceVerifications) OR EXISTS(SELECT 1 FROM pai.ReportSubmissions)
 OR EXISTS(SELECT 1 FROM pai.ReportEvidence) OR EXISTS(SELECT 1 FROM pai.ActivityGoals)
 OR EXISTS(SELECT 1 FROM pai.AuditEvents WHERE ProgressJson IS NOT NULL)
 OR EXISTS(SELECT 1 FROM pai.IdempotencyRecords WHERE Operation IN ('poc:associate-evidence','poc:submit-report') OR OutcomeProgressJson IS NOT NULL)
 THROW 51211, 'Reversion bloqueada: existen datos o historia de avances.', 1;
ALTER TABLE pai.IdempotencyRecords DROP CONSTRAINT CK_IdempotencyRecords_Progress, CK_IdempotencyRecords_Operation;
ALTER TABLE pai.IdempotencyRecords DROP COLUMN OutcomeProgressJson;
ALTER TABLE pai.IdempotencyRecords ADD CONSTRAINT CK_IdempotencyRecords_Operation CHECK (Operation IN ('poc:create-report','poc:update-report') AND DATALENGTH(Operation)=DATALENGTH(RTRIM(Operation)));
ALTER TABLE pai.AuditEvents DROP CONSTRAINT CK_AuditEvents_Progress, CK_AuditEvents_Action;
ALTER TABLE pai.AuditEvents DROP COLUMN ProgressJson;
ALTER TABLE pai.AuditEvents ADD CONSTRAINT CK_AuditEvents_Action CHECK (Action IN ('poc:report-created','poc:report-updated','poc:user-enabled-changed','poc:assignment-enabled-changed') AND DATALENGTH(Action)=DATALENGTH(RTRIM(Action)));
DROP TABLE pai.EvidenceVerifications;
DROP TABLE pai.ReportSubmissions;
DROP TABLE pai.ReportEvidence;
DROP TABLE pai.ActivityGoals;
ALTER TABLE pai.Reports DROP CONSTRAINT UQ_Reports_IdActivity;

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
IF @CatalogHash<>(SELECT CatalogSha256 FROM pai_meta.SchemaMigrations WHERE MigrationId='0001_initial') THROW 51212, 'Reversion no recupero el catalogo original.', 1;
DELETE FROM pai_meta.SchemaMigrations WHERE MigrationId='0002_report_progress';
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
