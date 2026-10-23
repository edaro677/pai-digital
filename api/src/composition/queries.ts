import { FichaAuthorizationService } from '../application/authorization/service.js';
import { ReadFichaQueries } from '../application/queries/readFicha.js';
import { ReportService } from '../application/reports/service.js';
import type { ReportTools } from '../application/reports/service.js';
import type { IdentityValidator } from '../application/ports/identity.js';
import type { UnitOfWork } from '../application/ports/unitOfWork.js';
import type { Clock } from '../application/ports/clock.js';
import { entityId, utcInstant } from '../domain/types.js';
import type { TenantId } from '../domain/types.js';
import { createFichaHandlers, unavailableQuery } from '../http/fichas.js';
import { validateConfiguration } from '../infrastructure/identity/config.js';
import { createEntraIdentityValidator } from '../infrastructure/identity/validator.js';
import { MemoryUnitOfWork } from '../infrastructure/memory/unitOfWork.js';
import { reportTools } from '../infrastructure/reportTools.js';
import { createReportHandlers } from '../http/reportes.js';
import { createLocalSqlUnitOfWork } from './sql.js';

export type PersistenceMode = 'memory' | 'sql-local';
export interface PersistenceFactories {
  readonly memory: () => UnitOfWork;
  readonly sqlLocal: () => UnitOfWork;
}
const persistenceFactories: PersistenceFactories = Object.freeze({
  memory: () => new MemoryUnitOfWork(), // Empty, without fixtures.
  sqlLocal: () => createLocalSqlUnitOfWork(),
});

export function selectPersistence(raw: string | undefined): PersistenceMode {
  if (raw === undefined || raw === 'memory') return 'memory';
  if (raw === 'sql-local') return 'sql-local';
  const error = new Error('Configuración de persistencia no válida.');
  delete error.stack;
  throw error;
}

/** Factories are supplied by trusted code only, never by request data. */
export function createPersistence(raw: string | undefined,
  factories: PersistenceFactories = persistenceFactories): UnitOfWork {
  return selectPersistence(raw) === 'memory' ? factories.memory() : factories.sqlLocal();
}

export function createLocalAuthorization(tenantId: TenantId, clock: Clock): FichaAuthorizationService {
  return new FichaAuthorizationService(tenantId, clock, { isApplicable: () => false });
}

/** Una única unidad de trabajo para TODOS los controladores; DI solo desde código confiable. */
export function createApplicationHandlers(identity: IdentityValidator, work: UnitOfWork,
  authorization: FichaAuthorizationService, clock: Clock, tools: ReportTools) {
  return Object.freeze({
    ...createFichaHandlers(identity, new ReadFichaQueries(work, authorization)),
    ...createReportHandlers(identity, new ReportService(work, authorization, clock, tools)),
  });
}

/** Composición local sin fixtures ni claves inyectadas. Nunca selecciona un modo ficticio.
 * No conecta con Entra al construir: JWKS se resuelve solo al validar una petición.
 */
export function createLocalQueryHandlers(rawConfiguration: string | undefined,
  rawPersistence?: string, factories: PersistenceFactories = persistenceFactories) {
  try {
    if (!rawConfiguration || rawConfiguration.length > 16384) throw new Error();
    const config = validateConfiguration(JSON.parse(rawConfiguration));
    const clock = { now: () => utcInstant(new Date().toISOString()) };
    const identity = createEntraIdentityValidator(config, { clock });
    const work = createPersistence(rawPersistence, factories);
    // Bloqueo explícito hasta aprobar/componer una política temporal. No inventar vigencia.
    const authorization = createLocalAuthorization(entityId('tenant', config.tenantId), clock);
    return createApplicationHandlers(identity, work, authorization, clock, reportTools);
  } catch {
    // Configuración ausente/incorrecta no habilita identidad alternativa ni afecta health.
    return Object.freeze({ ficha: unavailableQuery, actividades: unavailableQuery,
      createReport: unavailableQuery, updateReport: unavailableQuery, getReport: unavailableQuery });
  }
}
