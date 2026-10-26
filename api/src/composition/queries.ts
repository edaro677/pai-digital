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
import { createProgressHandlers } from '../http/progress.js';
import { ReportProgressService } from '../application/reports/progress.js';
import type { ProgressDependencies } from '../application/ports/progress.js';
import { createLocalSqlUnitOfWork } from './sql.js';
import { createDurableTrial, trialScope } from './localDurableTrial.js';

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
  authorization: FichaAuthorizationService, clock: Clock, tools: ReportTools, progress: ProgressDependencies = {}) {
  return Object.freeze({
    ...createFichaHandlers(identity, new ReadFichaQueries(work, authorization)),
    ...createReportHandlers(identity, new ReportService(work, authorization, clock, tools)),
    ...createProgressHandlers(identity, new ReportProgressService(work, authorization, clock, tools, progress)),
  });
}

/** Composición local sin fixtures ni claves inyectadas. Nunca selecciona un modo ficticio.
 * No conecta con Entra al construir: JWKS se resuelve solo al validar una petición.
 */
export function createLocalQueryHandlers(rawConfiguration: string | undefined,
  rawPersistence?: string, factories: PersistenceFactories = persistenceFactories,
  rawTrial: string | undefined = process.env.PAI_L8E4_TRIAL) {
  let stage = 'IDENTITY_CONFIGURATION';
  try {
    if (!rawConfiguration || rawConfiguration.length > 16384) throw new Error();
    const config = validateConfiguration(JSON.parse(rawConfiguration));
    const clock = { now: () => utcInstant(new Date().toISOString()) };
    const identity = createEntraIdentityValidator(config, { clock });
    stage = 'TRIAL_CONFIGURATION';
    const trial = rawTrial === undefined ? undefined : createDurableTrial(rawTrial, clock);
    if (trial && (rawPersistence !== 'sql-local' || config.tenantId !== trialScope.tenantId
      || config.audience !== trialScope.audience || config.requiredScope !== 'access_as_user')) throw new Error();
    stage = 'PERSISTENCE_FACTORY';
    const work = createPersistence(rawPersistence, factories);
    stage = 'AUTHORIZATION_COMPOSITION';
    const authorization = trial
      ? new FichaAuthorizationService(entityId('tenant', config.tenantId), clock, trial.validity)
      : createLocalAuthorization(entityId('tenant', config.tenantId), clock);
    const selectedIdentity = trial ? trial.restrictIdentity(identity) : identity;
    const handlers = createApplicationHandlers(selectedIdentity, work, authorization, clock, reportTools);
    if (!trial) return handlers;
    return Object.freeze({
      associateEvidence: trial.wrap(handlers.associateEvidence, selectedIdentity, 'deny'),
      listEvidence: trial.wrap(handlers.listEvidence, selectedIdentity, 'deny'),
      submitReport: trial.wrap(handlers.submitReport, selectedIdentity, 'deny'),
      getSubmission: trial.wrap(handlers.getSubmission, selectedIdentity, 'deny'),
      fichas: trial.wrap(handlers.fichas, selectedIdentity, 'deny'),
      reportes: trial.wrap(handlers.reportes, selectedIdentity, 'deny'),
      ficha: trial.wrap(handlers.ficha, selectedIdentity, 'deny'),
      actividades: trial.wrap(handlers.actividades, selectedIdentity, 'deny'),
      createReport: trial.wrap(handlers.createReport, selectedIdentity, 'create'),
      getReport: trial.wrap(handlers.getReport, selectedIdentity, 'get'),
      updateReport: trial.wrap(handlers.updateReport, selectedIdentity, 'deny'),
    });
  } catch {
    if (process.env.PAI_POC_LOCAL_ONLY === '1') {
      // Closed projection: no original error, config values, identity or token.
      console.warn(JSON.stringify({ probe: 'LOCAL_COMPOSITION_FAILURE', stage,
        identityConfigurationPresent: Boolean(rawConfiguration), trialConfigurationPresent: Boolean(rawTrial),
        sqlLocalSelected: rawPersistence === 'sql-local' }));
    }
    const unavailable = (request?: { readonly headers: { get(name: string): string | null } }) => {
      const failure = unavailableQuery();
      if (process.env.PAI_POC_LOCAL_ONLY === '1' && rawPersistence === 'sql-local'
          && request?.headers.get('x-pai-l8e4-probe') === '1') {
        failure.headers = { ...failure.headers as Record<string, string>,
          'X-PAI-L8E4-Configuration-Stage': stage,
          'X-PAI-L8E4-Identity-Present': rawConfiguration ? '1' : '0',
          'X-PAI-L8E4-Trial-Present': rawTrial ? '1' : '0' };
      }
      return failure;
    };
    // Configuración ausente/incorrecta no habilita identidad alternativa ni afecta health.
    return Object.freeze({ ficha: unavailable, actividades: unavailable, fichas: unavailable, reportes: unavailable,
      createReport: unavailable, updateReport: unavailable, getReport: unavailable,
      associateEvidence:unavailable,listEvidence:unavailable,submitReport:unavailable,getSubmission:unavailable });
  }
}
