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
-- Excepcion administrativa exclusivamente para evidencia SINTETICA de este ensayo.
IF COALESCE(IS_SRVROLEMEMBER(N'sysadmin'),0)<>1 THROW 52220, 'El escritor HTTP no puede limpiar.', 1;
IF COALESCE(CONVERT(nvarchar(80),SESSION_CONTEXT(N'pai.l8e4.approval')),N'')<>N'CLEAN_SYNTHETIC_L8E4_R01_ONLY'
 OR COALESCE(CONVERT(int,SESSION_CONTEXT(N'pai.l8e4.synthetic_audit_deletion_approved')),0)<>1
 THROW 52221, 'Falta aprobacion expresa de limpieza incluida auditoria sintetica.', 1;
DECLARE @RawReportId nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.report_id'));
DECLARE @ReportId varchar(64)=TRY_CONVERT(varchar(64),@RawReportId);
DECLARE @AuditId varchar(64),@IdempotencyId varchar(64);
DECLARE @VerifiedAuditHash nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.audit_snapshot_sha256'));
DECLARE @VerifiedOutcomeHash nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.outcome_snapshot_sha256'));
IF @VerifiedAuditHash IS NULL OR @VerifiedOutcomeHash IS NULL
 OR DATALENGTH(@VerifiedAuditHash)<>128 OR DATALENGTH(@VerifiedOutcomeHash)<>128
 OR @VerifiedAuditHash COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
 OR @VerifiedOutcomeHash COLLATE Latin1_General_100_BIN2 LIKE N'%[^0-9a-f]%'
 THROW 52235, 'Falta evidencia independiente previa de ambos snapshots sinteticos.', 1;
IF @RawReportId IS NULL OR DATALENGTH(@RawReportId) NOT BETWEEN 2 AND 128 OR @ReportId IS NULL OR LEFT(@RawReportId,1) COLLATE Latin1_General_100_BIN2 NOT LIKE N'[A-Za-z0-9]' OR @RawReportId COLLATE Latin1_General_100_BIN2 LIKE N'%[^A-Za-z0-9._-]%' THROW 52222, 'Falta reportId del ensayo.', 1;
DECLARE @RawActor nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.actor_object_id'));
DECLARE @Actor uniqueidentifier=TRY_CONVERT(uniqueidentifier,@RawActor);
IF @RawActor IS NULL OR DATALENGTH(@RawActor)<>72 OR @Actor IS NULL
 OR @RawActor COLLATE Latin1_General_100_BIN2<>LOWER(CONVERT(nvarchar(36),@Actor)) COLLATE Latin1_General_100_BIN2
 OR @Actor='00000000-0000-0000-0000-000000000000' THROW 52234, 'Falta identidad aprobada del ensayo.', 1;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
BEGIN TRY
 BEGIN TRANSACTION;
 -- Solo el escenario completo 6 padres + 3 resultados; otros estados requieren revision.
 IF (SELECT COUNT(*) FROM pai.InstitutionalUsers WITH(TABLOCKX,HOLDLOCK))<>1
 OR (SELECT COUNT(*) FROM pai.Dependencies WITH(TABLOCKX,HOLDLOCK))<>1
 OR (SELECT COUNT(*) FROM pai.Fichas WITH(TABLOCKX,HOLDLOCK))<>1
 OR (SELECT COUNT(*) FROM pai.Activities WITH(TABLOCKX,HOLDLOCK))<>1
 OR (SELECT COUNT(*) FROM pai.AccessAssignments WITH(TABLOCKX,HOLDLOCK))<>2
 OR (SELECT COUNT(*) FROM pai.Reports WITH(TABLOCKX,HOLDLOCK))<>1
 OR (SELECT COUNT(*) FROM pai.AuditEvents WITH(TABLOCKX,HOLDLOCK))<>1
 OR (SELECT COUNT(*) FROM pai.IdempotencyRecords WITH(TABLOCKX,HOLDLOCK))<>1
  THROW 52223, 'Inventario distinto; no se eliminan filas.', 1;
 IF NOT EXISTS(SELECT 1 FROM pai.InstitutionalUsers WHERE Id='l8e4-20261023-r01-user' AND Alias=N'Usuario sintetico L8-E4 r01' AND TenantId='9c6cb0e9-1c0e-4137-ac54-6ba138984ef2' AND DirectoryObjectId=@Actor AND Enabled=1)
 OR NOT EXISTS(SELECT 1 FROM pai.Dependencies WHERE Id='l8e4-20261023-r01-dep' AND Label=N'Dependencia sintetica L8-E4 r01')
 OR NOT EXISTS(SELECT 1 FROM pai.Fichas WHERE Id='l8e4-20261023-r01-ficha' AND DependencyId='l8e4-20261023-r01-dep' AND CycleLabel=N'Ciclo sintetico L8-E4 r01')
 OR NOT EXISTS(SELECT 1 FROM pai.Activities WHERE Id='l8e4-20261023-r01-activity' AND FichaId='l8e4-20261023-r01-ficha' AND Description=N'Actividad sintetica: á 😀 漢字')
 OR (SELECT COUNT(*) FROM pai.AccessAssignments WHERE UserId='l8e4-20261023-r01-user' AND FichaId='l8e4-20261023-r01-ficha' AND ((Id='l8e4-20261023-r01-read' AND Capability='poc:read') OR (Id='l8e4-20261023-r01-edit' AND Capability='poc:edit-report')))<>2
  THROW 52224, 'Los padres no pertenecen exactamente al ensayo.', 1;
 SELECT @IdempotencyId=i.Id,@AuditId=i.OutcomeAuditEventId FROM pai.IdempotencyRecords i
 JOIN pai.Reports r ON r.Id=i.OutcomeReportId JOIN pai.AuditEvents a ON a.Id=i.OutcomeAuditEventId
 WHERE r.Id=@ReportId AND r.ActivityId='l8e4-20261023-r01-activity' AND r.PeriodKey=N'poc-durable-20261023-r01'
 AND r.QuantityText='9007199254740993.000100' AND DATALENGTH(r.QuantityText)=DATALENGTH('9007199254740993.000100') AND r.Narrative=N'Ensayo sintetico L8-E4: á 😀 漢字' AND DATALENGTH(r.Narrative)=DATALENGTH(N'Ensayo sintetico L8-E4: á 😀 漢字')
 AND r.CreatedBy='l8e4-20261023-r01-user' AND r.UpdatedBy=r.CreatedBy AND r.CreatedAt=r.UpdatedAt AND r.State='poc-draft'
 AND i.ActorId=r.CreatedBy AND i.Operation='poc:create-report' AND i.IdempotencyKey='l8e4:20261023:r01:create-report' AND i.State='poc:completed'
 AND a.ActorId=r.CreatedBy AND a.Action='poc:report-created' AND a.BeforeJson IS NULL
 AND LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',a.AfterJson),2)) COLLATE Latin1_General_100_BIN2=@VerifiedAuditHash COLLATE Latin1_General_100_BIN2
 AND LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',i.OutcomeReportJson),2)) COLLATE Latin1_General_100_BIN2=@VerifiedOutcomeHash COLLATE Latin1_General_100_BIN2
 AND DATALENGTH(a.AfterJson)=DATALENGTH(i.OutcomeReportJson) AND a.AfterJson COLLATE Latin1_General_100_BIN2=i.OutcomeReportJson COLLATE Latin1_General_100_BIN2
 AND JSON_VALUE(a.AfterJson,'$.id')=@ReportId AND JSON_VALUE(a.AfterJson,'$.activityId')='l8e4-20261023-r01-activity'
 AND JSON_VALUE(a.AfterJson,'$.version')='rv1:'+LOWER(CONVERT(varchar(16),r.RV,2));
 IF @IdempotencyId IS NULL OR @AuditId IS NULL THROW 52225, 'Resultados no correlacionados; conservar para revision.', 1;
 DELETE FROM pai.IdempotencyRecords WHERE Id=@IdempotencyId;
 IF @@ROWCOUNT<>1 THROW 52226, 'Limpieza de idempotencia incoherente.', 1;
 DELETE FROM pai.AuditEvents WHERE Id=@AuditId;
 IF @@ROWCOUNT<>1 THROW 52227, 'Limpieza de auditoria incoherente.', 1;
 DELETE FROM pai.Reports WHERE Id=@ReportId;
 IF @@ROWCOUNT<>1 THROW 52228, 'Limpieza de reporte incoherente.', 1;
 DELETE FROM pai.AccessAssignments WHERE Id IN ('l8e4-20261023-r01-read','l8e4-20261023-r01-edit') AND UserId='l8e4-20261023-r01-user' AND FichaId='l8e4-20261023-r01-ficha';
 IF @@ROWCOUNT<>2 THROW 52229, 'Limpieza de asignaciones incoherente.', 1;
 DELETE FROM pai.Activities WHERE Id='l8e4-20261023-r01-activity' AND FichaId='l8e4-20261023-r01-ficha';
 IF @@ROWCOUNT<>1 THROW 52230, 'Limpieza de actividad incoherente.', 1;
 DELETE FROM pai.Fichas WHERE Id='l8e4-20261023-r01-ficha' AND DependencyId='l8e4-20261023-r01-dep';
 IF @@ROWCOUNT<>1 THROW 52231, 'Limpieza de ficha incoherente.', 1;
 DELETE FROM pai.Dependencies WHERE Id='l8e4-20261023-r01-dep';
 IF @@ROWCOUNT<>1 THROW 52232, 'Limpieza de dependencia incoherente.', 1;
 DELETE FROM pai.InstitutionalUsers WHERE Id='l8e4-20261023-r01-user';
 IF @@ROWCOUNT<>1 THROW 52233, 'Limpieza de usuario incoherente.', 1;
 COMMIT TRANSACTION;
 SELECT N'synthetic-scenario-cleaned' AS Status;
END TRY
BEGIN CATCH
 IF XACT_STATE()<>0 ROLLBACK TRANSACTION;
 THROW;
END CATCH;
