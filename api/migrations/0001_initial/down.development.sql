-- NO EJECUTADO EN L7-B4. Requiere autorizacion posterior y la preparacion de README.
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 51000, 'La migracion requiere una conexion sin transaccion previa.', 1;
DECLARE @Target nvarchar(4000)=TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.database'));
IF @Target IS NULL OR DATALENGTH(@Target)<>DATALENGTH(DB_NAME()) OR @Target COLLATE Latin1_General_100_BIN2<>DB_NAME() COLLATE Latin1_General_100_BIN2
 OR DB_NAME() COLLATE Latin1_General_100_BIN2 NOT LIKE N'pai[_]poc[_]%'
 OR DB_NAME() IN (N'master',N'model',N'msdb',N'tempdb')
 THROW 51001, 'Destino local sintetico no confirmado.', 1;
IF ISNULL(TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.approval')),N'') COLLATE Latin1_General_100_BIN2<>N'LOCAL_SYNTHETIC_ONLY'
 OR ISNULL(DATALENGTH(TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.approval'))),0)<>40
 THROW 51002, 'Falta confirmacion de uso exclusivamente local.', 1;
IF ISNULL(CONVERT(int,SERVERPROPERTY('EngineEdition')),0) NOT IN (2,3,4)
 OR ISNULL(CONVERT(int,SERVERPROPERTY('ProductMajorVersion')),0)<16
 THROW 51003, 'Este procedimiento local requiere SQL Server 2022 o posterior; Azure no habilitado.', 1;
IF ISNULL(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 AND ISNULL(CONVERT(nvarchar(48),CONNECTIONPROPERTY('client_net_address')),N'') NOT IN (N'127.0.0.1',N'::1')
 THROW 51004, 'La conexion no acredita origen loopback local.', 1;
DECLARE @Up nvarchar(4000)=TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.upSha256'));
DECLARE @Verify nvarchar(4000)=TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.verifySha256'));
DECLARE @Down nvarchar(4000)=TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.downSha256'));
IF @Up IS NULL OR @Verify IS NULL OR @Down IS NULL
 OR DATALENGTH(@Up)<>128 OR DATALENGTH(@Verify)<>128 OR DATALENGTH(@Down)<>128
 OR @Up COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
 OR @Verify COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
 OR @Down COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
 THROW 51005, 'Faltan los SHA-256 canonicos del manifiesto revisado.', 1;

IF ISNULL(TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.rollback')),N'') COLLATE Latin1_General_100_BIN2<>N'DROP_EMPTY_0001_INITIAL'
 OR ISNULL(DATALENGTH(TRY_CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.migration.rollback'))),0)<>46
 THROW 51020, 'Reversion deshabilitada sin confirmacion adicional.', 1;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRY
 BEGIN TRANSACTION;
DECLARE @ExpectedColumns TABLE (SchemaName sysname,TableName sysname,ColumnName sysname,TypeName sysname,MaxLength smallint,Nullable bit,IsIdentity bit,CollationName sysname NULL,Scale tinyint);
INSERT @ExpectedColumns VALUES
(N'pai',N'InstitutionalUsers',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'InstitutionalUsers',N'TenantId',N'uniqueidentifier',16,0,0,NULL,0),
(N'pai',N'InstitutionalUsers',N'DirectoryObjectId',N'uniqueidentifier',16,0,0,NULL,0),
(N'pai',N'InstitutionalUsers',N'Alias',N'nvarchar',-1,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'InstitutionalUsers',N'Enabled',N'bit',1,0,0,NULL,0),
(N'pai',N'InstitutionalUsers',N'RV',N'timestamp',8,0,0,NULL,0),
(N'pai',N'Dependencies',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Dependencies',N'Label',N'nvarchar',-1,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Dependencies',N'RV',N'timestamp',8,0,0,NULL,0),
(N'pai',N'Fichas',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Fichas',N'DependencyId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Fichas',N'CycleLabel',N'nvarchar',-1,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Fichas',N'RV',N'timestamp',8,0,0,NULL,0),
(N'pai',N'AccessAssignments',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AccessAssignments',N'UserId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AccessAssignments',N'FichaId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AccessAssignments',N'Capability',N'varchar',40,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AccessAssignments',N'Enabled',N'bit',1,0,0,NULL,0),
(N'pai',N'AccessAssignments',N'ValidFrom',N'datetime2',-2,0,0,NULL,3),
(N'pai',N'AccessAssignments',N'ValidUntil',N'datetime2',-2,1,0,NULL,3),
(N'pai',N'AccessAssignments',N'RV',N'timestamp',8,0,0,NULL,0),
(N'pai',N'AccessAssignments',N'InsertionOrder',N'bigint',8,0,1,NULL,0),
(N'pai',N'Activities',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Activities',N'FichaId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Activities',N'Description',N'nvarchar',-1,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Activities',N'RV',N'timestamp',8,0,0,NULL,0),
(N'pai',N'Activities',N'InsertionOrder',N'bigint',8,0,1,NULL,0),
(N'pai',N'Reports',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'ActivityId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'PeriodKey',N'nvarchar',256,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'QuantityText',N'varchar',-1,1,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'Narrative',N'nvarchar',-1,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'State',N'varchar',40,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'CreatedBy',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'CreatedAt',N'datetime2',-2,0,0,NULL,3),
(N'pai',N'Reports',N'UpdatedBy',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'Reports',N'UpdatedAt',N'datetime2',-2,0,0,NULL,3),
(N'pai',N'Reports',N'RV',N'timestamp',8,0,0,NULL,0),
(N'pai',N'AuditEvents',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AuditEvents',N'ActorId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AuditEvents',N'OccurredAt',N'datetime2',-2,0,0,NULL,3),
(N'pai',N'AuditEvents',N'CorrelationId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AuditEvents',N'Action',N'varchar',40,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AuditEvents',N'BeforeJson',N'nvarchar',-1,1,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'AuditEvents',N'AfterJson',N'nvarchar',-1,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'Id',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'ActorId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'Operation',N'varchar',40,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'IdempotencyKey',N'varchar',128,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'RequestFingerprint',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'State',N'varchar',40,0,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'CreatedAt',N'datetime2',-2,0,0,NULL,3),
(N'pai',N'IdempotencyRecords',N'CompletedAt',N'datetime2',-2,1,0,NULL,3),
(N'pai',N'IdempotencyRecords',N'OutcomeReportId',N'varchar',64,1,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'OutcomeAuditEventId',N'varchar',64,1,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'OutcomeReportJson',N'nvarchar',-1,1,0,N'Latin1_General_100_BIN2',0),
(N'pai',N'IdempotencyRecords',N'RV',N'timestamp',8,0,0,NULL,0),
(N'pai_meta',N'SchemaMigrations',N'MigrationId',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai_meta',N'SchemaMigrations',N'UpSha256',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai_meta',N'SchemaMigrations',N'VerifySha256',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai_meta',N'SchemaMigrations',N'DownSha256',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai_meta',N'SchemaMigrations',N'CatalogSha256',N'varchar',64,0,0,N'Latin1_General_100_BIN2',0),
(N'pai_meta',N'SchemaMigrations',N'AppliedAtUtc',N'datetime2',-2,0,0,NULL,3);
IF EXISTS (
 SELECT SchemaName,TableName,ColumnName,TypeName,MaxLength,Nullable,IsIdentity,CollationName,Scale FROM @ExpectedColumns
 EXCEPT
 SELECT s.name,t.name,c.name,ty.name,CASE WHEN ty.name=N'datetime2' THEN -2 ELSE c.max_length END,c.is_nullable,c.is_identity,c.collation_name,c.scale
 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name IN (N'pai',N'pai_meta')
) OR EXISTS (
 SELECT s.name,t.name,c.name,ty.name,CASE WHEN ty.name=N'datetime2' THEN -2 ELSE c.max_length END,c.is_nullable,c.is_identity,c.collation_name,c.scale
 FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE s.name IN (N'pai',N'pai_meta')
 EXCEPT SELECT SchemaName,TableName,ColumnName,TypeName,MaxLength,Nullable,IsIdentity,CollationName,Scale FROM @ExpectedColumns
) THROW 51010, 'Diferencia en columnas, tipos, nulabilidad, identidad o colaciones.', 1;
IF (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pai'))<>8 OR (SELECT COUNT(*) FROM sys.tables WHERE schema_id=SCHEMA_ID(N'pai_meta'))<>1
 THROW 51011, 'Numero de tablas inesperado.', 1;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE schema_id IN (SCHEMA_ID(N'pai'),SCHEMA_ID(N'pai_meta')) AND (is_disabled=1 OR is_not_trusted=1))
 OR EXISTS (SELECT 1 FROM sys.foreign_keys WHERE schema_id IN (SCHEMA_ID(N'pai'),SCHEMA_ID(N'pai_meta')) AND (is_disabled=1 OR is_not_trusted=1 OR delete_referential_action<>0 OR update_referential_action<>0))
 THROW 51012, 'Restricciones deshabilitadas, no confiables o con cascada.', 1;
IF EXISTS (SELECT 1 FROM sys.database_role_members WHERE member_principal_id=DATABASE_PRINCIPAL_ID(N'pai_api_runtime'))
 THROW 51013, 'El rol API no puede heredar otro rol.', 1;
IF EXISTS (SELECT 1 FROM sys.objects WHERE schema_id IN (SCHEMA_ID(N'pai'),SCHEMA_ID(N'pai_meta')) AND type NOT IN ('U','PK','UQ','C','F'))
 THROW 51017, 'Objetos adicionales o defaults inesperados en los esquemas.', 1;
IF EXISTS (SELECT 1 FROM sys.identity_columns WHERE object_id IN (OBJECT_ID(N'pai.Activities'),OBJECT_ID(N'pai.AccessAssignments')) AND (CONVERT(bigint,seed_value)<>1 OR CONVERT(bigint,increment_value)<>1))
 THROW 51018, 'Semilla o incremento de InsertionOrder inesperados.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name=N'pai_api_runtime' AND type='R' AND is_fixed_role=0 AND owning_principal_id=DATABASE_PRINCIPAL_ID(N'dbo'))
 THROW 51019, 'Rol API ausente o propietario inesperado.', 1;
DECLARE @ExpectedConstraints TABLE (SchemaName sysname,TableName sysname,ConstraintName sysname,Kind char(2));
INSERT @ExpectedConstraints VALUES
(N'pai',N'InstitutionalUsers',N'PK_InstitutionalUsers','PK'),
(N'pai',N'InstitutionalUsers',N'CK_InstitutionalUsers_Id','C'),
(N'pai',N'InstitutionalUsers',N'UQ_InstitutionalUsers_Identity','UQ'),
(N'pai',N'InstitutionalUsers',N'CK_InstitutionalUsers_Tenant','C'),
(N'pai',N'InstitutionalUsers',N'CK_InstitutionalUsers_Object','C'),
(N'pai',N'Dependencies',N'PK_Dependencies','PK'),
(N'pai',N'Dependencies',N'CK_Dependencies_Id','C'),
(N'pai',N'Fichas',N'PK_Fichas','PK'),
(N'pai',N'Fichas',N'CK_Fichas_Id','C'),
(N'pai',N'Fichas',N'FK_Fichas_Dependency','F'),
(N'pai',N'AccessAssignments',N'PK_AccessAssignments','PK'),
(N'pai',N'AccessAssignments',N'CK_AccessAssignments_Id','C'),
(N'pai',N'AccessAssignments',N'FK_AccessAssignments_User','F'),
(N'pai',N'AccessAssignments',N'FK_AccessAssignments_Ficha','F'),
(N'pai',N'AccessAssignments',N'CK_AccessAssignments_Capability','C'),
(N'pai',N'Activities',N'PK_Activities','PK'),
(N'pai',N'Activities',N'CK_Activities_Id','C'),
(N'pai',N'Activities',N'FK_Activities_Ficha','F'),
(N'pai',N'Reports',N'PK_Reports','PK'),
(N'pai',N'Reports',N'CK_Reports_Id','C'),
(N'pai',N'Reports',N'FK_Reports_Activity','F'),
(N'pai',N'Reports',N'FK_Reports_CreatedBy','F'),
(N'pai',N'Reports',N'FK_Reports_UpdatedBy','F'),
(N'pai',N'Reports',N'UQ_Reports_ActivityPeriod','UQ'),
(N'pai',N'Reports',N'CK_Reports_Period','C'),
(N'pai',N'Reports',N'CK_Reports_State','C'),
(N'pai',N'AuditEvents',N'PK_AuditEvents','PK'),
(N'pai',N'AuditEvents',N'CK_AuditEvents_Id','C'),
(N'pai',N'AuditEvents',N'FK_AuditEvents_Actor','F'),
(N'pai',N'AuditEvents',N'CK_AuditEvents_Correlation','C'),
(N'pai',N'AuditEvents',N'CK_AuditEvents_Action','C'),
(N'pai',N'AuditEvents',N'CK_AuditEvents_AfterJson','C'),
(N'pai',N'AuditEvents',N'CK_AuditEvents_BeforeJson','C'),
(N'pai',N'IdempotencyRecords',N'PK_IdempotencyRecords','PK'),
(N'pai',N'IdempotencyRecords',N'CK_IdempotencyRecords_Id','C'),
(N'pai',N'IdempotencyRecords',N'FK_IdempotencyRecords_Actor','F'),
(N'pai',N'IdempotencyRecords',N'FK_IdempotencyRecords_Report','F'),
(N'pai',N'IdempotencyRecords',N'FK_IdempotencyRecords_Audit','F'),
(N'pai',N'IdempotencyRecords',N'UQ_IdempotencyRecords_Scope','UQ'),
(N'pai',N'IdempotencyRecords',N'CK_IdempotencyRecords_Key','C'),
(N'pai',N'IdempotencyRecords',N'CK_IdempotencyRecords_Fingerprint','C'),
(N'pai',N'IdempotencyRecords',N'CK_IdempotencyRecords_Operation','C'),
(N'pai',N'IdempotencyRecords',N'CK_IdempotencyRecords_State','C'),
(N'pai',N'IdempotencyRecords',N'CK_IdempotencyRecords_Outcome','C'),
(N'pai_meta',N'SchemaMigrations',N'PK_SchemaMigrations','PK'),
(N'pai_meta',N'SchemaMigrations',N'CK_SchemaMigrations_Hashes','C');
IF EXISTS (SELECT SchemaName,TableName,ConstraintName,Kind FROM @ExpectedConstraints EXCEPT SELECT s.name,t.name,o.name,o.type FROM sys.objects o JOIN sys.tables t ON t.object_id=o.parent_object_id JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE s.name IN (N'pai',N'pai_meta') AND o.type IN ('PK','F','UQ','C'))
 THROW 51014, 'Faltan restricciones esperadas.', 1;
DECLARE @ExpectedIndexes TABLE (TableName sysname,IndexName sysname);
INSERT @ExpectedIndexes VALUES (N'Fichas',N'IX_Fichas_Dependency'),(N'AccessAssignments',N'IX_AccessAssignments_UserFichaOrder'),(N'AccessAssignments',N'IX_AccessAssignments_Ficha'),(N'Activities',N'IX_Activities_FichaOrder'),(N'Reports',N'IX_Reports_CreatedBy'),(N'Reports',N'IX_Reports_UpdatedBy'),(N'AuditEvents',N'IX_AuditEvents_Correlation'),(N'AuditEvents',N'IX_AuditEvents_Actor'),(N'IdempotencyRecords',N'IX_IdempotencyRecords_Report'),(N'IdempotencyRecords',N'IX_IdempotencyRecords_Audit');
IF EXISTS (SELECT TableName,IndexName FROM @ExpectedIndexes EXCEPT SELECT t.name,i.name FROM sys.indexes i JOIN sys.tables t ON t.object_id=i.object_id WHERE t.schema_id=SCHEMA_ID(N'pai') AND i.is_disabled=0)
 THROW 51015, 'Faltan indices de consulta habilitados.', 1;
-- Firma del catalogo real; sin datos funcionales ni credenciales.
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
IF (SELECT COUNT(*) FROM pai_meta.SchemaMigrations)<>1 OR NOT EXISTS
 (SELECT 1 FROM pai_meta.SchemaMigrations WHERE MigrationId='0001_initial' AND DATALENGTH(MigrationId)=12 AND UpSha256=@Up AND VerifySha256=@Verify AND DownSha256=@Down AND CatalogSha256=@CatalogHash)
 THROW 51016, 'Historial, checksums o catalogo diferentes del artefacto aprobado.', 1;
IF EXISTS (SELECT 1 FROM sys.database_role_members WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'pai_api_runtime'))
 THROW 51021, 'Retirar explicitamente miembros del rol antes de revertir.', 1;
IF EXISTS (SELECT 1 FROM pai.InstitutionalUsers WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
IF EXISTS (SELECT 1 FROM pai.Dependencies WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
IF EXISTS (SELECT 1 FROM pai.Fichas WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
IF EXISTS (SELECT 1 FROM pai.AccessAssignments WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
IF EXISTS (SELECT 1 FROM pai.Activities WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
IF EXISTS (SELECT 1 FROM pai.Reports WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
IF EXISTS (SELECT 1 FROM pai.AuditEvents WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
IF EXISTS (SELECT 1 FROM pai.IdempotencyRecords WITH (TABLOCKX,HOLDLOCK)) THROW 51022, 'Reversion rechazada: existen datos funcionales.', 1;
DROP TABLE pai.IdempotencyRecords;
DROP TABLE pai.AuditEvents;
DROP TABLE pai.Reports;
DROP TABLE pai.Activities;
DROP TABLE pai.AccessAssignments;
DROP TABLE pai.Fichas;
DROP TABLE pai.Dependencies;
DROP TABLE pai.InstitutionalUsers;
DROP ROLE pai_api_runtime;
DROP TABLE pai_meta.SchemaMigrations;
DROP SCHEMA pai;
DROP SCHEMA pai_meta;
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
