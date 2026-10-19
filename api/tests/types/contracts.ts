// Solo tsc --noEmit. Estas declaraciones no son adaptadores ni fixtures ejecutables.
import type { AuditEvent, IdempotencyRecord, Report } from '../../src/domain/entities.js';
import type { Capability, FichaId, ReportId, ReportState, UserId, Version } from '../../src/domain/types.js';
import type { NewReport, ReportChanges, ReportRepository } from '../../src/application/ports/repositories.js';
import type { TransactionContext, UnitOfWork } from '../../src/application/ports/unitOfWork.js';
import type { Clock } from '../../src/application/ports/clock.js';

declare const userId: UserId;
declare const fichaId: FichaId;
declare const reportId: ReportId;
declare const expectedVersion: Version;
declare const input: NewReport;
declare const changes: ReportChanges;
declare const report: Report;
declare const event: AuditEvent;
declare const idempotency: IdempotencyRecord;
declare const repository: ReportRepository;
declare const tx: TransactionContext;
declare const uow: UnitOfWork;
declare const clock: Clock;
declare function takesReportId(id: ReportId): void;
declare function takesVersion(value: Version): void;
declare function takesState(value: ReportState): void;
declare function takesCapability(value: Capability): void;
declare function takesReportPromise(value: Promise<Report>): void;

takesReportId(reportId);
// @ts-expect-error Un usuario no es un reporte.
takesReportId(userId);
// @ts-expect-error Una ficha no es un reporte.
takesReportId(fichaId);
// @ts-expect-error Texto externo sin validar no es ID tipado.
takesReportId('synthetic-report');
// @ts-expect-error Una versión no es un contador numérico.
takesVersion(1);
// @ts-expect-error Un ID no sustituye una versión.
takesVersion(reportId);
takesState('poc-draft');
// @ts-expect-error No existe aprobación institucional en este contrato.
takesState('approved');
takesCapability('poc:read');
// @ts-expect-error No se definen roles institucionales.
takesCapability('planning-admin');

takesReportPromise(repository.create(input));
takesReportPromise(repository.update(reportId, expectedVersion, changes));
// @ts-expect-error Toda actualización exige versión esperada.
void repository.update(reportId, changes);
// @ts-expect-error No se permite cambiar la relación con la actividad mediante update.
void repository.update(reportId, expectedVersion, { ...changes, activityId: report.activityId });
// @ts-expect-error La entidad persistida es de solo lectura.
report.narrative = 'synthetic-change';
// @ts-expect-error El consumidor no asigna la versión inicial.
void repository.create({ ...input, version: expectedVersion });
// @ts-expect-error Auditoría no dispone de edición.
void tx.audit.update(event);
// @ts-expect-error Los repositorios no confirman por separado.
void tx.reports.commit();
// @ts-expect-error El contexto no permite transacciones anidadas.
void tx.runAtomic(async () => undefined);

const result: Promise<Report> = uow.runAtomic(async (context) => {
  void context.users.findById(userId);
  void context.assignments.listByUserAndFicha(userId, fichaId);
  void context.audit.findById(event.id);
  void context.idempotency.findByScope(idempotency.scope);
  return context.reports.update(reportId, expectedVersion, changes);
});
takesReportPromise(result);
// @ts-expect-error UnitOfWork exige callback asíncrono.
void uow.runAtomic(() => report);
if (idempotency.state === 'poc:reserved') {
  const pending: null = idempotency.outcome;
  void pending;
  // @ts-expect-error Una reserva no tiene respuesta completada.
  void idempotency.outcome.report;
} else {
  takesReportId(idempotency.outcome.report.id);
}
void clock.now();
