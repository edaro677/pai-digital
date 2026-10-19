import { FichaAuthorizationService } from '../application/authorization/service.js';
import { ReadFichaQueries } from '../application/queries/readFicha.js';
import { entityId, utcInstant } from '../domain/types.js';
import { createFichaHandlers, unavailableQuery } from '../http/fichas.js';
import { validateConfiguration } from '../infrastructure/identity/config.js';
import { createEntraIdentityValidator } from '../infrastructure/identity/validator.js';
import { MemoryUnitOfWork } from '../infrastructure/memory/unitOfWork.js';

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
    return createFichaHandlers(identity, new ReadFichaQueries(work, authorization));
  } catch {
    // Configuración ausente/incorrecta no habilita identidad alternativa ni afecta health.
    return Object.freeze({ ficha: unavailableQuery, actividades: unavailableQuery });
  }
}
