-- BORRADOR REVISABLE. NO EJECUTAR SIN AUTORIZACION POSTERIOR.
-- No modifica esquema, permisos, autenticacion ni politica de asignaciones.
SET NOCOUNT ON;
SET XACT_ABORT ON;
IF @@TRANCOUNT<>0 THROW 52200, 'Se requiere sesion sin transaccion previa.', 1;
IF DB_NAME()<>N'pai_poc_dev'
 OR COALESCE(CONVERT(nvarchar(128),SERVERPROPERTY('InstanceName')),N'')<>N'PAIPOC'
 OR COALESCE(CONVERT(nvarchar(128),SERVERPROPERTY('Edition')),N'') NOT LIKE N'%Developer%'
 OR COALESCE(CONVERT(int,SERVERPROPERTY('ProductMajorVersion')),0)<>16
 OR COALESCE(CONVERT(nvarchar(40),CONNECTIONPROPERTY('net_transport')),N'')<>N'Shared memory'
 THROW 52201, 'Destino local sintetico no confirmado.', 1;
IF COALESCE(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1 THROW 52202, 'Solo administrador ya autorizado.', 1;
IF COALESCE(CONVERT(nvarchar(80),SESSION_CONTEXT(N'pai.l8e4.approval')),N'')<>N'PREPARE_SYNTHETIC_PARENTS_ONLY'
 OR COALESCE(CONVERT(int,SESSION_CONTEXT(N'pai.l8e4.positive_policy_approved')),0)<>1
 THROW 52203, 'Falta aprobacion explicita; este script no cambia la politica HTTP.', 1;
DECLARE @RawActor nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.actor_object_id'));
DECLARE @Actor uniqueidentifier=TRY_CONVERT(uniqueidentifier,@RawActor);
DECLARE @RawFrom nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.valid_from_utc'));
DECLARE @RawUntil nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.valid_until_utc'));
DECLARE @From datetime2(3)=TRY_CONVERT(datetime2(3),@RawFrom,126);
DECLARE @Until datetime2(3)=TRY_CONVERT(datetime2(3),@RawUntil,126);
DECLARE @Now datetime2(3)=SYSUTCDATETIME();
IF @RawActor IS NULL OR DATALENGTH(@RawActor)<>72 OR @Actor IS NULL OR @RawActor COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@Actor)) COLLATE Latin1_General_100_BIN2 OR @Actor='00000000-0000-0000-0000-000000000000'
 OR @From IS NULL OR @Until IS NULL OR NOT (@From<@Now AND @Now<@Until)
 OR DATALENGTH(@RawFrom)<>48 OR DATALENGTH(@RawUntil)<>48
 OR @RawFrom COLLATE Latin1_General_100_BIN2<>(CONVERT(nvarchar(23),@From,126)+N'Z') COLLATE Latin1_General_100_BIN2
 OR @RawUntil COLLATE Latin1_General_100_BIN2<>(CONVERT(nvarchar(23),@Until,126)+N'Z') COLLATE Latin1_General_100_BIN2
 THROW 52204, 'Identidad o ventana de prueba no confirmada.', 1;
-- La ventana interior evita decidir inclusividad de extremos; NO hace aplicable la politica actual.
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRY
 BEGIN TRANSACTION;
 IF EXISTS(SELECT 1 FROM pai.InstitutionalUsers WITH(TABLOCKX,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM pai.Dependencies WITH(TABLOCKX,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM pai.Fichas WITH(TABLOCKX,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM pai.AccessAssignments WITH(TABLOCKX,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM pai.Activities WITH(TABLOCKX,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM pai.Reports WITH(TABLOCKX,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM pai.AuditEvents WITH(TABLOCKX,HOLDLOCK))
 OR EXISTS(SELECT 1 FROM pai.IdempotencyRecords WITH(TABLOCKX,HOLDLOCK))
  THROW 52205, 'Se exige base funcional vacia; no mezclar ensayos.', 1;
 INSERT pai.InstitutionalUsers(Id,TenantId,DirectoryObjectId,Alias,Enabled)
 VALUES('l8e4-20261023-r01-user','9c6cb0e9-1c0e-4137-ac54-6ba138984ef2',@Actor,N'Usuario sintetico L8-E4 r01',1);
 INSERT pai.Dependencies(Id,Label) VALUES('l8e4-20261023-r01-dep',N'Dependencia sintetica L8-E4 r01');
 INSERT pai.Fichas(Id,DependencyId,CycleLabel)
 VALUES('l8e4-20261023-r01-ficha','l8e4-20261023-r01-dep',N'Ciclo sintetico L8-E4 r01');
 INSERT pai.Activities(Id,FichaId,Description)
 VALUES('l8e4-20261023-r01-activity','l8e4-20261023-r01-ficha',N'Actividad sintetica: á 😀 漢字');
 INSERT pai.AccessAssignments(Id,UserId,FichaId,Capability,Enabled,ValidFrom,ValidUntil)
 VALUES('l8e4-20261023-r01-read','l8e4-20261023-r01-user','l8e4-20261023-r01-ficha','poc:read',1,@From,@Until),
 ('l8e4-20261023-r01-edit','l8e4-20261023-r01-user','l8e4-20261023-r01-ficha','poc:edit-report',1,@From,@Until);
 COMMIT TRANSACTION;
 SELECT N'synthetic-parents-prepared' AS Status,6 AS ParentRows;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
