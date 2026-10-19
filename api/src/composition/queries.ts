import { FichaAuthorizationService } from '../application/authorization/service.js';
import { ReadFichaQueries } from '../application/queries/readFicha.js';
import { ReportService } from '../application/reports/service.js';
import type { ReportTools } from '../application/reports/service.js';
import type { IdentityValidator } from '../application/ports/identity.js';
import type { UnitOfWork } from '../application/ports/unitOfWork.js';
import type { Clock } from '../application/ports/clock.js';
import { entityId, utcInstant } from '../domain/types.js';
import { createFichaHandlers, unavailableQuery } from '../http/fichas.js';
import { validateConfiguration } from '../infrastructure/identity/config.js';
import { createEntraIdentityValidator } from '../infrastructure/identity/validator.js';
import { MemoryUnitOfWork } from '../infrastructure/memory/unitOfWork.js';
import { reportTools } from '../infrastructure/reportTools.js';
import { createReportHandlers } from '../http/reportes.js';

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
export function createLocalQueryHandlers(rawConfiguration: string | undefined) {
  try {
    if (!rawConfiguration || rawConfiguration.length > 16384) throw new Error();
    const config = validateConfiguration(JSON.parse(rawConfiguration));
    const clock = { now: () => utcInstant(new Date().toISOString()) };
    const identity = createEntraIdentityValidator(config, { clock });
    const work = new MemoryUnitOfWork(); // Vacío; no hay cargador de usuarios/asignaciones.
    // Bloqueo explícito hasta aprobar/componer una política temporal. No inventar vigencia.
    const authorization = new FichaAuthorizationService(entityId('tenant', config.tenantId), clock,
      { isApplicable: () => false });
    return createApplicationHandlers(identity, work, authorization, clock, reportTools);
  } catch {
    // Configuración ausente/incorrecta no habilita identidad alternativa ni afecta health.
    return Object.freeze({ ficha: unavailableQuery, actividades: unavailableQuery,
      createReport: unavailableQuery, updateReport: unavailableQuery, getReport: unavailableQuery });
  }
}
