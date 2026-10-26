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
DECLARE @Up varchar(max)=TRY_CONVERT(varchar(max),SESSION_CONTEXT(N'pai.migration.upSha256')),
 @Verify varchar(max)=TRY_CONVERT(varchar(max),SESSION_CONTEXT(N'pai.migration.verifySha256')),
 @Down varchar(max)=TRY_CONVERT(varchar(max),SESSION_CONTEXT(N'pai.migration.downSha256'));
IF @Up IS NULL OR @Verify IS NULL OR @Down IS NULL OR DATALENGTH(@Up)<>64 OR DATALENGTH(@Verify)<>64 OR DATALENGTH(@Down)<>64
 OR @Up COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9a-f]%' OR @Verify COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9a-f]%' OR @Down COLLATE Latin1_General_100_BIN2 LIKE '%[^0-9a-f]%'
 THROW 51203, 'Falta manifiesto revisado; comprobar archivos externamente.', 1;
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
IF NOT EXISTS(SELECT 1 FROM pai_meta.SchemaMigrations WHERE MigrationId='0002_report_progress'
 AND UpSha256=@Up AND VerifySha256=@Verify AND DownSha256=@Down AND CatalogSha256=@CatalogHash)
 THROW 51206, 'Historial o huella 0002 incompatibles.', 1;
IF (SELECT COUNT_BIG(*) FROM pai_meta.SchemaMigrations)<>2
 OR NOT EXISTS(SELECT 1 FROM pai_meta.SchemaMigrations WHERE MigrationId='0001_initial')
 OR ISNULL(COL_LENGTH('pai.ReportEvidence','ReportVersion'),0)<>8 OR OBJECT_ID('pai.ActivityGoals','U') IS NULL
 OR COL_LENGTH('pai.ReportSubmissions','SnapshotJson') IS NULL OR COL_LENGTH('pai.EvidenceVerifications','VerificationJson') IS NULL
 OR COL_LENGTH('pai.AuditEvents','ProgressJson') IS NULL OR COL_LENGTH('pai.IdempotencyRecords','OutcomeProgressJson') IS NULL
 THROW 51207, 'Esquema incremental incompleto.', 1;
IF EXISTS(SELECT 1 FROM sys.foreign_keys WHERE parent_object_id IN (OBJECT_ID('pai.ActivityGoals'),OBJECT_ID('pai.ReportEvidence'),OBJECT_ID('pai.ReportSubmissions'),OBJECT_ID('pai.EvidenceVerifications')) AND (is_disabled=1 OR is_not_trusted=1))
 OR EXISTS(SELECT 1 FROM sys.check_constraints WHERE parent_object_id IN (OBJECT_ID('pai.ReportEvidence'),OBJECT_ID('pai.ReportSubmissions'),OBJECT_ID('pai.EvidenceVerifications'),OBJECT_ID('pai.AuditEvents'),OBJECT_ID('pai.IdempotencyRecords')) AND (is_disabled=1 OR is_not_trusted=1))
 THROW 51208, 'Restricciones sin validar.', 1;
SELECT '0002_report_progress' AS MigrationId, @CatalogHash AS CatalogSha256;
