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
-- Solo SELECT; puede ejecutarse bajo PAIPOC_Test en una conexion nueva.
IF COALESCE(CONVERT(nvarchar(80),SESSION_CONTEXT(N'pai.l8e4.approval')),N'')<>N'READ_DURABLE_RESULT_ONLY'
 THROW 52210, 'Falta aprobacion de lectura del ensayo.', 1;
DECLARE @RawReportId nvarchar(4000)=CONVERT(nvarchar(4000),SESSION_CONTEXT(N'pai.l8e4.report_id'));
DECLARE @ReportId varchar(64)=TRY_CONVERT(varchar(64),@RawReportId);
IF @RawReportId IS NULL OR DATALENGTH(@RawReportId) NOT BETWEEN 2 AND 128 OR @ReportId IS NULL OR LEFT(@RawReportId,1) COLLATE Latin1_General_100_BIN2 NOT LIKE N'[A-Za-z0-9]' OR @RawReportId COLLATE Latin1_General_100_BIN2 LIKE N'%[^A-Za-z0-9._-]%'
 THROW 52211, 'Se requiere el reportId del recibo HTTP, no un valor inventado.', 1;
IF (SELECT COUNT(*) FROM pai.Reports)<>1 OR (SELECT COUNT(*) FROM pai.AuditEvents)<>1
 OR (SELECT COUNT(*) FROM pai.IdempotencyRecords)<>1
 THROW 52212, 'Resultado duradero incompleto o con filas ajenas.', 1;
IF NOT EXISTS(
 SELECT 1 FROM pai.Reports r JOIN pai.Activities act ON act.Id=r.ActivityId
 JOIN pai.IdempotencyRecords i ON i.OutcomeReportId=r.Id
 JOIN pai.AuditEvents a ON a.Id=i.OutcomeAuditEventId
 WHERE r.Id=@ReportId AND r.ActivityId='l8e4-20261023-r01-activity' AND act.FichaId='l8e4-20261023-r01-ficha'
 AND r.PeriodKey=N'poc-durable-20261023-r01' AND r.QuantityText='9007199254740993.000100' AND DATALENGTH(r.QuantityText)=DATALENGTH('9007199254740993.000100')
 AND r.Narrative=N'Ensayo sintetico L8-E4: á 😀 漢字' AND DATALENGTH(r.Narrative)=DATALENGTH(N'Ensayo sintetico L8-E4: á 😀 漢字') AND r.State='poc-draft'
 AND r.CreatedBy='l8e4-20261023-r01-user' AND r.UpdatedBy=r.CreatedBy AND r.CreatedAt=r.UpdatedAt
 AND i.ActorId=r.CreatedBy AND i.Operation='poc:create-report' AND i.IdempotencyKey='l8e4:20261023:r01:create-report'
 AND i.State='poc:completed' AND i.CompletedAt IS NOT NULL
 AND a.ActorId=r.CreatedBy AND a.Action='poc:report-created' AND a.BeforeJson IS NULL
 AND DATALENGTH(a.AfterJson)=DATALENGTH(i.OutcomeReportJson)
 AND a.AfterJson COLLATE Latin1_General_100_BIN2=i.OutcomeReportJson COLLATE Latin1_General_100_BIN2
 AND JSON_VALUE(a.AfterJson,'$.id')=r.Id AND JSON_VALUE(a.AfterJson,'$.activityId')=r.ActivityId
 AND JSON_VALUE(a.AfterJson,'$.quantity')=r.QuantityText
 AND JSON_VALUE(a.AfterJson,'$.version')='rv1:'+LOWER(CONVERT(varchar(16),r.RV,2)))
 THROW 52213, 'Reporte, auditoria o resultado historico no coinciden.', 1;
SELECT Id,ActivityId,PeriodKey,QuantityText,Narrative,State,
 CONVERT(varchar(23),CreatedAt,126)+'Z' AS CreatedAtUtc,
 CONVERT(varchar(23),UpdatedAt,126)+'Z' AS UpdatedAtUtc,
 'rv1:'+LOWER(CONVERT(varchar(16),RV,2)) AS Version,
 (SELECT OutcomeAuditEventId FROM pai.IdempotencyRecords WHERE OutcomeReportId=@ReportId) AS AuditEventId,
 (SELECT Id FROM pai.IdempotencyRecords WHERE OutcomeReportId=@ReportId) AS IdempotencyRecordId,
 (SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',a.AfterJson),2))
  FROM pai.AuditEvents a JOIN pai.IdempotencyRecords i ON i.OutcomeAuditEventId=a.Id WHERE i.OutcomeReportId=@ReportId) AS AuditSnapshotSha256,
 (SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',OutcomeReportJson),2)) FROM pai.IdempotencyRecords WHERE OutcomeReportId=@ReportId) AS OutcomeSnapshotSha256
FROM pai.Reports WHERE Id=@ReportId;
