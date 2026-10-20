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

BEGIN TRY
 BEGIN TRANSACTION;
 IF SCHEMA_ID(N'pai') IS NOT NULL OR SCHEMA_ID(N'pai_meta') IS NOT NULL OR DATABASE_PRINCIPAL_ID(N'pai_api_runtime') IS NOT NULL
  THROW 51006, 'Destino no vacio, ejecucion duplicada o esquema parcial: verificar, no sobrescribir.', 1;
 EXEC(N'CREATE SCHEMA pai AUTHORIZATION dbo;');
 EXEC(N'CREATE SCHEMA pai_meta AUTHORIZATION dbo;');
 CREATE ROLE pai_api_runtime AUTHORIZATION dbo;
CREATE TABLE pai.InstitutionalUsers (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    TenantId uniqueidentifier NOT NULL,
    DirectoryObjectId uniqueidentifier NOT NULL,
    Alias nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Enabled bit NOT NULL,
    RV rowversion NOT NULL,
    CONSTRAINT PK_InstitutionalUsers PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_InstitutionalUsers_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%'),
    CONSTRAINT UQ_InstitutionalUsers_Identity UNIQUE (TenantId, DirectoryObjectId),
    CONSTRAINT CK_InstitutionalUsers_Tenant CHECK (TenantId <> '00000000-0000-0000-0000-000000000000'),
    CONSTRAINT CK_InstitutionalUsers_Object CHECK (DirectoryObjectId <> '00000000-0000-0000-0000-000000000000')
);

CREATE TABLE pai.Dependencies (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Label nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    RV rowversion NOT NULL,
    CONSTRAINT PK_Dependencies PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_Dependencies_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%')
);

CREATE TABLE pai.Fichas (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    DependencyId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CycleLabel nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    RV rowversion NOT NULL,
    CONSTRAINT PK_Fichas PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_Fichas_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%'),
    CONSTRAINT FK_Fichas_Dependency FOREIGN KEY (DependencyId) REFERENCES pai.Dependencies (Id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE pai.AccessAssignments (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    UserId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    FichaId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Capability varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Enabled bit NOT NULL,
    ValidFrom datetime2(3) NOT NULL,
    ValidUntil datetime2(3) NULL,
    RV rowversion NOT NULL,
    InsertionOrder bigint IDENTITY(1,1) NOT NULL,
    CONSTRAINT PK_AccessAssignments PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_AccessAssignments_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%'),
    CONSTRAINT FK_AccessAssignments_User FOREIGN KEY (UserId) REFERENCES pai.InstitutionalUsers (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT FK_AccessAssignments_Ficha FOREIGN KEY (FichaId) REFERENCES pai.Fichas (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT CK_AccessAssignments_Capability CHECK (Capability IN ('poc:read','poc:edit-report') AND DATALENGTH(Capability)=DATALENGTH(RTRIM(Capability)))
);

CREATE TABLE pai.Activities (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    FichaId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Description nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    RV rowversion NOT NULL,
    InsertionOrder bigint IDENTITY(1,1) NOT NULL,
    CONSTRAINT PK_Activities PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_Activities_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%'),
    CONSTRAINT FK_Activities_Ficha FOREIGN KEY (FichaId) REFERENCES pai.Fichas (Id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE pai.Reports (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    ActivityId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    PeriodKey nvarchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    QuantityText varchar(max) COLLATE Latin1_General_100_BIN2 NULL,
    Narrative nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    State varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CreatedBy varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CreatedAt datetime2(3) NOT NULL,
    UpdatedBy varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    UpdatedAt datetime2(3) NOT NULL,
    RV rowversion NOT NULL,
    CONSTRAINT PK_Reports PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_Reports_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%'),
    CONSTRAINT FK_Reports_Activity FOREIGN KEY (ActivityId) REFERENCES pai.Activities (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT FK_Reports_CreatedBy FOREIGN KEY (CreatedBy) REFERENCES pai.InstitutionalUsers (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT FK_Reports_UpdatedBy FOREIGN KEY (UpdatedBy) REFERENCES pai.InstitutionalUsers (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT UQ_Reports_ActivityPeriod UNIQUE (ActivityId, PeriodKey),
    CONSTRAINT CK_Reports_Period CHECK (DATALENGTH(PeriodKey) BETWEEN 2 AND 256 AND DATALENGTH(PeriodKey)=DATALENGTH(RTRIM(PeriodKey)) AND UNICODE(LEFT(PeriodKey,1))<>32),
    CONSTRAINT CK_Reports_State CHECK (State IN ('poc-draft','poc-blocked') AND DATALENGTH(State)=DATALENGTH(RTRIM(State)))
);

CREATE TABLE pai.AuditEvents (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    ActorId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    OccurredAt datetime2(3) NOT NULL,
    CorrelationId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Action varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    BeforeJson nvarchar(max) COLLATE Latin1_General_100_BIN2 NULL,
    AfterJson nvarchar(max) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CONSTRAINT PK_AuditEvents PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_AuditEvents_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%'),
    CONSTRAINT FK_AuditEvents_Actor FOREIGN KEY (ActorId) REFERENCES pai.InstitutionalUsers (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT CK_AuditEvents_Correlation CHECK (DATALENGTH(CorrelationId) BETWEEN 1 AND 64 AND LEFT(CorrelationId,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND CorrelationId COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._:-]%'),
    CONSTRAINT CK_AuditEvents_Action CHECK (Action IN ('poc:report-created','poc:report-updated','poc:user-enabled-changed','poc:assignment-enabled-changed') AND DATALENGTH(Action)=DATALENGTH(RTRIM(Action))),
    CONSTRAINT CK_AuditEvents_AfterJson CHECK (ISJSON(AfterJson, OBJECT)=1),
    CONSTRAINT CK_AuditEvents_BeforeJson CHECK ((Action='poc:report-created' AND BeforeJson IS NULL) OR (Action<>'poc:report-created' AND BeforeJson IS NOT NULL AND ISJSON(BeforeJson, OBJECT)=1))
);

CREATE TABLE pai.IdempotencyRecords (
    Id varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    ActorId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    Operation varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    IdempotencyKey varchar(128) COLLATE Latin1_General_100_BIN2 NOT NULL,
    RequestFingerprint varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    State varchar(40) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CreatedAt datetime2(3) NOT NULL,
    CompletedAt datetime2(3) NULL,
    OutcomeReportId varchar(64) COLLATE Latin1_General_100_BIN2 NULL,
    OutcomeAuditEventId varchar(64) COLLATE Latin1_General_100_BIN2 NULL,
    OutcomeReportJson nvarchar(max) COLLATE Latin1_General_100_BIN2 NULL,
    RV rowversion NOT NULL,
    CONSTRAINT PK_IdempotencyRecords PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT CK_IdempotencyRecords_Id CHECK (DATALENGTH(Id) BETWEEN 1 AND 64 AND LEFT(Id,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND Id COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._-]%'),
    CONSTRAINT FK_IdempotencyRecords_Actor FOREIGN KEY (ActorId) REFERENCES pai.InstitutionalUsers (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT FK_IdempotencyRecords_Report FOREIGN KEY (OutcomeReportId) REFERENCES pai.Reports (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT FK_IdempotencyRecords_Audit FOREIGN KEY (OutcomeAuditEventId) REFERENCES pai.AuditEvents (Id) ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT UQ_IdempotencyRecords_Scope UNIQUE (ActorId, Operation, IdempotencyKey),
    CONSTRAINT CK_IdempotencyRecords_Key CHECK (DATALENGTH(IdempotencyKey) BETWEEN 1 AND 128 AND LEFT(IdempotencyKey,1) COLLATE Latin1_General_100_BIN2 LIKE '[A-Za-z0-9]' AND IdempotencyKey COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^A-Za-z0-9._:-]%'),
    CONSTRAINT CK_IdempotencyRecords_Fingerprint CHECK (DATALENGTH(RequestFingerprint)=64 AND RequestFingerprint COLLATE Latin1_General_100_BIN2 NOT LIKE '%[^0-9a-f]%'),
    CONSTRAINT CK_IdempotencyRecords_Operation CHECK (Operation IN ('poc:create-report','poc:update-report') AND DATALENGTH(Operation)=DATALENGTH(RTRIM(Operation))),
    CONSTRAINT CK_IdempotencyRecords_State CHECK (State IN ('poc:reserved','poc:completed') AND DATALENGTH(State)=DATALENGTH(RTRIM(State))),
    CONSTRAINT CK_IdempotencyRecords_Outcome CHECK ((State='poc:reserved' AND CompletedAt IS NULL AND OutcomeReportId IS NULL AND OutcomeAuditEventId IS NULL AND OutcomeReportJson IS NULL) OR (State='poc:completed' AND CompletedAt IS NOT NULL AND OutcomeReportId IS NOT NULL AND OutcomeAuditEventId IS NOT NULL AND OutcomeReportJson IS NOT NULL AND ISJSON(OutcomeReportJson, OBJECT)=1))
);
CREATE TABLE pai_meta.SchemaMigrations (
    MigrationId varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    UpSha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    VerifySha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    DownSha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    CatalogSha256 varchar(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    AppliedAtUtc datetime2(3) NOT NULL,
    CONSTRAINT PK_SchemaMigrations PRIMARY KEY CLUSTERED (MigrationId),
    CONSTRAINT CK_SchemaMigrations_Hashes CHECK (DATALENGTH(UpSha256)=64 AND UpSha256 NOT LIKE '%[^0-9a-f]%' AND DATALENGTH(VerifySha256)=64 AND VerifySha256 NOT LIKE '%[^0-9a-f]%' AND DATALENGTH(DownSha256)=64 AND DownSha256 NOT LIKE '%[^0-9a-f]%' AND DATALENGTH(CatalogSha256)=64 AND CatalogSha256 NOT LIKE '%[^0-9a-f]%')
);
CREATE INDEX IX_Fichas_Dependency ON pai.Fichas (DependencyId);
CREATE INDEX IX_AccessAssignments_UserFichaOrder ON pai.AccessAssignments (UserId, FichaId, InsertionOrder);
CREATE INDEX IX_AccessAssignments_Ficha ON pai.AccessAssignments (FichaId);
CREATE INDEX IX_Activities_FichaOrder ON pai.Activities (FichaId, InsertionOrder);
CREATE INDEX IX_Reports_CreatedBy ON pai.Reports (CreatedBy);
CREATE INDEX IX_Reports_UpdatedBy ON pai.Reports (UpdatedBy);
CREATE INDEX IX_AuditEvents_Correlation ON pai.AuditEvents (CorrelationId);
CREATE INDEX IX_AuditEvents_Actor ON pai.AuditEvents (ActorId);
CREATE INDEX IX_IdempotencyRecords_Report ON pai.IdempotencyRecords (OutcomeReportId);
CREATE INDEX IX_IdempotencyRecords_Audit ON pai.IdempotencyRecords (OutcomeAuditEventId);
GRANT SELECT ON OBJECT::pai.InstitutionalUsers TO pai_api_runtime;
GRANT SELECT ON OBJECT::pai.Dependencies TO pai_api_runtime;
GRANT SELECT ON OBJECT::pai.Fichas TO pai_api_runtime;
GRANT SELECT ON OBJECT::pai.AccessAssignments TO pai_api_runtime;
GRANT SELECT ON OBJECT::pai.Activities TO pai_api_runtime;
GRANT SELECT ON OBJECT::pai.Reports TO pai_api_runtime;
GRANT SELECT ON OBJECT::pai.AuditEvents TO pai_api_runtime;
GRANT SELECT ON OBJECT::pai.IdempotencyRecords TO pai_api_runtime;
GRANT INSERT ON OBJECT::pai.Reports TO pai_api_runtime;
GRANT INSERT ON OBJECT::pai.AuditEvents TO pai_api_runtime;
GRANT INSERT ON OBJECT::pai.IdempotencyRecords TO pai_api_runtime;
GRANT UPDATE ON OBJECT::pai.InstitutionalUsers (Enabled) TO pai_api_runtime;
GRANT UPDATE ON OBJECT::pai.AccessAssignments (Enabled) TO pai_api_runtime;
GRANT UPDATE ON OBJECT::pai.Reports (QuantityText, Narrative, State, UpdatedBy, UpdatedAt) TO pai_api_runtime;
GRANT UPDATE ON OBJECT::pai.IdempotencyRecords (State, CompletedAt, OutcomeReportId, OutcomeAuditEventId, OutcomeReportJson) TO pai_api_runtime;
DENY DELETE ON SCHEMA::pai TO pai_api_runtime;
DENY ALTER ON SCHEMA::pai TO pai_api_runtime;
DENY SELECT, INSERT, UPDATE, DELETE ON SCHEMA::pai_meta TO pai_api_runtime;
DENY UPDATE ON OBJECT::pai.AuditEvents TO pai_api_runtime;
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
INSERT pai_meta.SchemaMigrations (MigrationId,UpSha256,VerifySha256,DownSha256,CatalogSha256,AppliedAtUtc)
 VALUES ('0001_initial',CONVERT(varchar(64),@Up),CONVERT(varchar(64),@Verify),CONVERT(varchar(64),@Down),@CatalogHash,CONVERT(datetime2(3),SYSUTCDATETIME()));
 COMMIT TRANSACTION;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
