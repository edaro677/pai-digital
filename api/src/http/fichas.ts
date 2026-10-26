import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { IdentityValidator } from '../application/ports/identity.js';
import type { ReadFichaQueries } from '../application/queries/readFicha.js';
import { AccessDeniedError, InvalidValueError } from '../domain/errors.js';
import { entityId, periodKey } from '../domain/types.js';
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
  const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 64
    && /^[A-Za-z0-9]/.test(id) && !/[^A-Za-z0-9._-]/.test(id);
  function collection(resource: 'fichas' | 'reportes') {
    return async (request: HttpRequest): Promise<HttpResponseInit> => {
      try {
        const principal = await identity.validateAuthorization(request.headers.get('authorization'));
        if (request.method !== 'GET' || request.body !== null) throw new InvalidValueError();
        if (resource === 'fichas') {
          // Candidate selection is not an authorization grant or a global database scan.
          const ids = request.query.getAll('id');
          if ([...request.query.keys()].some(key => key !== 'id') || ids.length > 50
              || !ids.every(validId)) throw new InvalidValueError();
          return queryResponse(200, { data: await queries.fichas(principal,
            ids.length === 0 ? undefined : ids.map(id => entityId('ficha', id))) });
        }
        const id = request.params.fichaId;
        const periods = request.query.getAll('period');
        if (!validId(id) || periods.length !== 1 || [...request.query.keys()].some(key => key !== 'period')) {
          throw new InvalidValueError();
        }
        return queryResponse(200, { data: await queries.reportes(principal, entityId('ficha', id), periodKey(periods[0]!)) });
      } catch (error) {
        if (error instanceof AuthenticationError) return queryResponse(401,
          { error: { code: 'UNAUTHENTICATED', message: 'Autenticación requerida.' } });
        if (error instanceof InvalidValueError) return queryResponse(400,
          { error: { code: 'INVALID_REQUEST', message: 'Solicitud no válida.' } });
        if (error instanceof AccessDeniedError) return queryResponse(404,
          { error: { code: 'NOT_FOUND', message: 'Recurso no disponible.' } });
        return unavailableQuery();
      }
    };
  }
  function handler(resource: 'ficha' | 'actividades') {
    return async (request: HttpRequest): Promise<HttpResponseInit> => {
      try {
        // L4-A extrae y valida un único Bearer antes de cualquier consulta o validación de ID.
        const principal = await identity.validateAuthorization(request.headers.get('authorization'));
        const id = request.params.fichaId;
        // Restricción de transporte de la PoC; no cambia identificadores opacos de L2.
        if (request.method !== 'GET' || request.query.size !== 0 || request.body !== null
            || typeof id !== 'string' || id.length > 64
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
  return Object.freeze({ ficha: handler('ficha'), actividades: handler('actividades'),
    fichas: collection('fichas'), reportes: collection('reportes') });
}
