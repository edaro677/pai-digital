import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { IdentityValidator } from '../application/ports/identity.js';
import type { ReadFichaQueries } from '../application/queries/readFicha.js';
import { AccessDeniedError } from '../domain/errors.js';
import { entityId } from '../domain/types.js';
import { AuthenticationError } from '../infrastructure/identity/errors.js';

export function queryResponse(status: number, jsonBody: unknown): HttpResponseInit {
  return { status, jsonBody, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
  } };
}

export function unavailableQuery(): HttpResponseInit {
  return queryResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'No fue posible procesar la solicitud.' } });
}

/** Único controlador reutilizado por ambos registros Functions. No acepta identidad del cliente. */
export function createFichaHandlers(identity: IdentityValidator, queries: ReadFichaQueries) {
  function handler(resource: 'ficha' | 'actividades') {
    return async (request: HttpRequest): Promise<HttpResponseInit> => {
      try {
        // L4-A extrae y valida un único Bearer antes de cualquier consulta o validación de ID.
        const principal = await identity.validateAuthorization(request.headers.get('authorization'));
        const id = request.params.fichaId;
        // Restricción de transporte de la PoC; no cambia identificadores opacos de L2.
        if (request.method !== 'GET' || request.query.size !== 0 || request.body !== null
            || typeof id !== 'string' || id.length > 128
            || !/^[A-Za-z0-9]/.test(id) || /[^A-Za-z0-9._-]/.test(id)) {
          return queryResponse(400, { error: { code: 'INVALID_REQUEST', message: 'Solicitud no válida.' } });
        }
        const fichaId = entityId('ficha', id);
        const data = resource === 'ficha'
          ? await queries.ficha(principal, fichaId)
          : await queries.actividades(principal, fichaId);
        return queryResponse(200, { data });
      } catch (error) {
        if (error instanceof AuthenticationError) {
          return queryResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Autenticación requerida.' } });
        }
        if (error instanceof AccessDeniedError) {
          // Misma respuesta para ausencia o falta de acceso: no revelar existencia.
          return queryResponse(404, { error: { code: 'NOT_FOUND', message: 'Recurso no disponible.' } });
        }
        return unavailableQuery();
      }
    };
  }
  return Object.freeze({ ficha: handler('ficha'), actividades: handler('actividades') });
}
