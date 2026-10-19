import { ReportService } from '../../src/application/reports/service.js';
import type { CreateReportCommand, UpdateReportCommand, ReportTools } from '../../src/application/reports/service.js';
import type { UnitOfWork } from '../../src/application/ports/unitOfWork.js';
import type { Clock } from '../../src/application/ports/clock.js';
import type { AuthenticatedIdentity } from '../../src/application/ports/identity.js';
import type { FichaAuthorizationService } from '../../src/application/authorization/service.js';
import type { ActivityId, ReportId } from '../../src/domain/types.js';
declare const work: UnitOfWork;
declare const auth: FichaAuthorizationService;
declare const clock: Clock;
declare const tools: ReportTools;
declare const principal: AuthenticatedIdentity;
declare const activity: ActivityId;
declare const report: ReportId;
declare const create: CreateReportCommand;
declare const update: UpdateReportCommand;
const service = new ReportService(work, auth, clock, tools);
void service.create(principal, activity, create);
void service.update(principal, report, update);
// @ts-expect-error La actualización requiere versión esperada.
const noVersion: UpdateReportCommand = { key: update.key, quantity: null };
void noVersion;
// @ts-expect-error No aceptar números binarios como DecimalText.
const numeric: CreateReportCommand = { ...create, quantity: 1 };
void numeric;
// @ts-expect-error No permitir confundir ID de actividad y reporte.
void service.update(principal, activity, update);
