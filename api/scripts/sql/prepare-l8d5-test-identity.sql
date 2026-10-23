/* PREPARADO, NO EJECUTADO. Solo PAIPOC / pai_poc_dev / Shared Memory.
   Requiere cuenta Windows local PAIPOC_Test ya creada y aprobacion de sesion.
   No contiene fixtures, DML funcional, migraciones ni configuracion de red. */
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT <> 0 THROW 52100, 'Se requiere una sesion sin transaccion previa.', 1;
IF DB_NAME() <> N'pai_poc_dev'
 OR COALESCE(CONVERT(nvarchar(128), SERVERPROPERTY('InstanceName')),N'') <> N'PAIPOC'
 OR COALESCE(CONVERT(int, SERVERPROPERTY('EngineEdition')),0) NOT IN (2,3,4)
 OR COALESCE(CONVERT(int, SERVERPROPERTY('ProductMajorVersion')),0) < 16
 OR COALESCE(CONVERT(nvarchar(40), CONNECTIONPROPERTY('net_transport')),N'') <> N'Shared memory'
 THROW 52101, 'Destino local de pruebas no autorizado.', 1;
IF COALESCE(CONVERT(nvarchar(64), SESSION_CONTEXT(N'pai.l8d5.identity.approval')), N'') <> N'LOCAL_L8D5_ONLY'
 THROW 52102, 'Falta autorizacion explicita de sesion.', 1;

DECLARE @Login sysname = CONVERT(sysname, SERVERPROPERTY('MachineName')) + N'\PAIPOC_Test';
DECLARE @Sid varbinary(85) = SUSER_SID(@Login);
IF @Sid IS NULL OR @Sid = SUSER_SID() OR @Sid = (SELECT owner_sid FROM sys.databases WHERE database_id = DB_ID())
 THROW 52103, 'Se requiere una cuenta Windows local distinta, existente y no propietaria.', 1;
IF EXISTS (SELECT 1 FROM sys.server_principals WHERE name = @Login AND (type <> 'U' OR is_disabled = 1 OR sid <> @Sid))
 THROW 52104, 'Login preexistente incompatible.', 1;
IF EXISTS (SELECT 1 FROM sys.server_role_members m JOIN sys.server_principals p ON p.principal_id=m.member_principal_id WHERE p.sid=@Sid)
 OR EXISTS (SELECT 1 FROM sys.server_permissions p JOIN sys.server_principals s ON s.principal_id=p.grantee_principal_id
 WHERE s.sid=@Sid AND NOT (p.permission_name=N'CONNECT SQL' AND p.state=N'G'))
 THROW 52105, 'La identidad tiene permisos de servidor inesperados.', 1;

/* Lista cerrada. El DML siguiente solo prepara variables locales de permisos. */
DECLARE @Allowed TABLE (Class int, MajorId int, MinorId int, PermissionName sysname, State char(1), Target nvarchar(400));
INSERT @Allowed VALUES
 (0,0,0,N'CONNECT','G',N'DATABASE::[pai_poc_dev]'),
 (0,0,0,N'VIEW DEFINITION','G',N'DATABASE::[pai_poc_dev]');
INSERT @Allowed
SELECT 1,OBJECT_ID(N'pai.'+t.TableName),0,p.PermissionName,'G',N'OBJECT::[pai].'+QUOTENAME(t.TableName)
FROM (VALUES (N'InstitutionalUsers'),(N'Dependencies'),(N'Fichas'),(N'AccessAssignments'),
 (N'Activities'),(N'Reports'),(N'AuditEvents'),(N'IdempotencyRecords')) t(TableName)
CROSS JOIN (VALUES (N'SELECT'),(N'INSERT')) p(PermissionName);
INSERT @Allowed VALUES
 (1,OBJECT_ID(N'pai_meta.SchemaMigrations'),0,N'SELECT','G',N'OBJECT::[pai_meta].[SchemaMigrations]');
INSERT @Allowed
SELECT 1,OBJECT_ID(N'pai.'+v.TableName),COLUMNPROPERTY(OBJECT_ID(N'pai.'+v.TableName),v.ColumnName,'ColumnId'),
 N'UPDATE','G',N'OBJECT::[pai].'+QUOTENAME(v.TableName)+N' ('+QUOTENAME(v.ColumnName)+N')'
FROM (VALUES (N'InstitutionalUsers',N'Enabled'),(N'AccessAssignments',N'Enabled'),
 (N'Reports',N'QuantityText'),(N'Reports',N'Narrative'),(N'Reports',N'State'),(N'Reports',N'UpdatedBy'),(N'Reports',N'UpdatedAt'),
 (N'IdempotencyRecords',N'State'),(N'IdempotencyRecords',N'CompletedAt'),(N'IdempotencyRecords',N'OutcomeReportId'),
 (N'IdempotencyRecords',N'OutcomeAuditEventId'),(N'IdempotencyRecords',N'OutcomeReportJson')) v(TableName,ColumnName);
INSERT @Allowed
SELECT 3,SCHEMA_ID(v.SchemaName),0,v.PermissionName,'D',N'SCHEMA::'+QUOTENAME(v.SchemaName)
FROM (VALUES (N'pai',N'DELETE'),(N'pai',N'ALTER'),(N'pai',N'TAKE OWNERSHIP'),
 (N'pai_meta',N'INSERT'),(N'pai_meta',N'UPDATE'),(N'pai_meta',N'DELETE'),
 (N'pai_meta',N'ALTER'),(N'pai_meta',N'TAKE OWNERSHIP')) v(SchemaName,PermissionName);
INSERT @Allowed VALUES (1,OBJECT_ID(N'pai.AuditEvents'),0,N'UPDATE','D',N'OBJECT::[pai].[AuditEvents]');
IF EXISTS (SELECT 1 FROM @Allowed WHERE MajorId IS NULL OR MinorId IS NULL)
 THROW 52106, 'Falta un objeto o columna del esquema aprobado.', 1;

BEGIN TRY
 BEGIN TRANSACTION;
 DECLARE @UserId int = DATABASE_PRINCIPAL_ID(N'pai_l8d5_test_user');
 DECLARE @RoleId int = DATABASE_PRINCIPAL_ID(N'pai_l8d5_test');
 IF @UserId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE principal_id=@UserId AND type='U' AND sid=@Sid)
  THROW 52107, 'Usuario preexistente incompatible.', 1;
 IF @RoleId IS NOT NULL AND NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE principal_id=@RoleId AND type='R' AND is_fixed_role=0 AND owning_principal_id=DATABASE_PRINCIPAL_ID(N'dbo'))
  THROW 52108, 'Rol preexistente incompatible.', 1;
 IF EXISTS (SELECT 1 FROM sys.database_principals WHERE sid=@Sid AND principal_id<>COALESCE(@UserId,-1))
  THROW 52109, 'La cuenta ya tiene otro mapeo en esta base.', 1;
 IF EXISTS (SELECT 1 FROM sys.database_role_members WHERE
   (member_principal_id=@UserId AND role_principal_id<>COALESCE(@RoleId,-1)) OR
   (role_principal_id=@RoleId AND member_principal_id<>COALESCE(@UserId,-1)) OR member_principal_id=@RoleId)
  THROW 52110, 'Membresias inesperadas; no se modifican automaticamente.', 1;
 IF EXISTS (SELECT 1 FROM sys.schemas WHERE principal_id IN (@UserId,@RoleId))
  OR EXISTS (SELECT 1 FROM sys.objects WHERE principal_id IN (@UserId,@RoleId))
  OR EXISTS (SELECT 1 FROM sys.database_principals WHERE owning_principal_id IN (@UserId,@RoleId))
  THROW 52111, 'La identidad o rol posee objetos inesperados.', 1;
 IF EXISTS (SELECT 1 FROM sys.database_permissions WHERE grantee_principal_id=@UserId
   AND NOT (class=0 AND permission_name=N'CONNECT' AND state='G'))
  THROW 52112, 'Usuario con permisos directos inesperados.', 1;
 IF EXISTS (SELECT 1 FROM sys.database_permissions p WHERE p.grantee_principal_id=@RoleId
  AND NOT EXISTS (SELECT 1 FROM @Allowed a WHERE a.Class=p.class AND a.MajorId=p.major_id
   AND a.MinorId=p.minor_id
   AND a.PermissionName COLLATE Latin1_General_100_BIN2 = p.permission_name COLLATE Latin1_General_100_BIN2
   AND a.State COLLATE Latin1_General_100_BIN2 = p.state COLLATE Latin1_General_100_BIN2))
  THROW 52113, 'Rol con permisos inesperados; revisar manualmente.', 1;

 /* SQL Server admite CREATE LOGIN en transacciones (Microsoft Learn, CREATE LOGIN).
    Un rollback revierte el login nuevo; no se puede utilizar hasta el commit.
    Se conserva junto a usuario, rol y permisos para evitar un login nuevo huerfano
    si falla la configuracion posterior. La cuenta Windows se crea por separado.
    Confirmacion documental; este script aun no se ha ejecutado contra PAIPOC. */
 DECLARE @Sql nvarchar(max);
 IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name=@Login)
 BEGIN
  SET @Sql=N'CREATE LOGIN '+QUOTENAME(@Login)+N' FROM WINDOWS WITH DEFAULT_DATABASE=[pai_poc_dev];';
  EXEC sys.sp_executesql @Sql;
 END;
 IF @UserId IS NULL
 BEGIN
  SET @Sql=N'CREATE USER [pai_l8d5_test_user] FOR LOGIN '+QUOTENAME(@Login)+N' WITH DEFAULT_SCHEMA=[pai];';
  EXEC sys.sp_executesql @Sql;
 END;
 IF @RoleId IS NULL EXEC(N'CREATE ROLE [pai_l8d5_test] AUTHORIZATION [dbo];');
 IF NOT EXISTS (SELECT 1 FROM sys.database_role_members
  WHERE role_principal_id=DATABASE_PRINCIPAL_ID(N'pai_l8d5_test') AND member_principal_id=DATABASE_PRINCIPAL_ID(N'pai_l8d5_test_user'))
  ALTER ROLE [pai_l8d5_test] ADD MEMBER [pai_l8d5_test_user];

 DECLARE @Permission sysname,@State char(1),@Target nvarchar(400);
 DECLARE Permissions CURSOR LOCAL FAST_FORWARD FOR SELECT PermissionName,State,Target FROM @Allowed;
 OPEN Permissions;
 FETCH NEXT FROM Permissions INTO @Permission,@State,@Target;
 WHILE @@FETCH_STATUS=0
 BEGIN
  SET @Sql=CASE @State WHEN 'G' THEN N'GRANT ' ELSE N'DENY ' END+@Permission+N' ON '+@Target+N' TO [pai_l8d5_test];';
  EXEC sys.sp_executesql @Sql;
  FETCH NEXT FROM Permissions INTO @Permission,@State,@Target;
 END;
 CLOSE Permissions;
 DEALLOCATE Permissions;
 COMMIT TRANSACTION;
 SELECT CAST(1 AS bit) AS preparationApplied, CAST(1 AS bit) AS effectiveIdentityVerificationStillRequired;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 /* No imprimir ERROR_MESSAGE(), identidades ni SQL dinamico. */
 THROW 52114, 'Preparacion no completada; revisar localmente con el administrador.', 1;
END CATCH;
