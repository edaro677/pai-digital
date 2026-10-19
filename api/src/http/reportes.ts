import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { IdentityValidator } from '../application/ports/identity.js';
import type { CreateReportCommand, UpdateReportCommand, ReportService } from '../application/reports/service.js';
import {
  AccessDeniedError, DuplicateError, IncompatibleStateError, InvalidValueError, NotFoundError, VersionConflictError,
} from '../domain/errors.js';
import { decimalText, entityId, idempotencyKey, periodKey, version } from '../domain/types.js';
import { AuthenticationError } from '../infrastructure/identity/errors.js';
import { queryResponse, unavailableQuery } from './fichas.js';

const maxBodyBytes = 16384;
class RequestError extends Error {
  constructor(readonly status: 400 | 413 | 415) { super('Solicitud no válida.'); }
}
function validId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128
    && /^[A-Za-z0-9]/.test(id) && !/[^A-Za-z0-9._-]/.test(id);
}

async function readJson(request: HttpRequest): Promise<Record<string, unknown>> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')
      || !['identity', null].includes(request.headers.get('content-encoding'))) throw new RequestError(415);
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^[0-9]+$/.test(length)) throw new RequestError(400);
    if (Number(length) > maxBodyBytes) throw new RequestError(413);
  }
  if (!request.body) throw new RequestError(400);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) { await reader.cancel(); throw new RequestError(413); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  try {
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { bytes.set(part, offset); offset += part.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new RequestError(400);
    return parsed as Record<string, unknown>;
  } catch { throw new RequestError(400); }
}

function parseCommand(body: Record<string, unknown>, rawKey: string | null, create: true): CreateReportCommand;
function parseCommand(body: Record<string, unknown>, rawKey: string | null, create: false): UpdateReportCommand;
function parseCommand(body: Record<string, unknown>, rawKey: string | null, create: boolean): CreateReportCommand | UpdateReportCommand {
  if (!rawKey || rawKey.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(rawKey)
      || /[^A-Za-z0-9._:-]/.test(rawKey)) throw new RequestError(400);
  const keys = Object.keys(body);
  const allowed = create ? ['period', 'quantity', 'narrative'] : ['expectedVersion', 'quantity', 'narrative'];
  if (keys.some(key => !allowed.includes(key))
      || (create && !allowed.every(key => Object.hasOwn(body, key)))
      || (!create && (!Object.hasOwn(body, 'expectedVersion')
        || !['quantity', 'narrative'].some(key => Object.hasOwn(body, key))))) throw new RequestError(400);
  try {
    const key = idempotencyKey(rawKey);
    const fields: { quantity?: ReturnType<typeof decimalText> | null; narrative?: string } = {};
    if (Object.hasOwn(body, 'quantity')) {
      if (body.quantity !== null && (typeof body.quantity !== 'string' || body.quantity.length > 128)) throw new RequestError(400);
      fields.quantity = body.quantity === null ? null : decimalText(body.quantity as string);
    }
    if (Object.hasOwn(body, 'narrative')) {
      if (typeof body.narrative !== 'string' || body.narrative.length > 4000) throw new RequestError(400);
      fields.narrative = body.narrative;
    }
    if (create) {
      if (typeof body.period !== 'string' || body.period.length > 128) throw new RequestError(400);
      return Object.freeze({ key, period: periodKey(body.period), quantity: fields.quantity!, narrative: fields.narrative! });
    }
    if (typeof body.expectedVersion !== 'string' || body.expectedVersion.length > 128) throw new RequestError(400);
    return Object.freeze({ key, expectedVersion: version(body.expectedVersion), ...fields });
  } catch (error) {
    if (error instanceof InvalidValueError) throw new RequestError(400);
    throw error;
  }
}

export function createReportHandlers(identity: IdentityValidator, service: ReportService) {
  function handler(method: 'GET' | 'POST' | 'PATCH') {
    return async (request: HttpRequest): Promise<HttpResponseInit> => {
      try {
        const principal = await identity.validateAuthorization(request.headers.get('authorization'));
        const id = request.params[method === 'POST' ? 'activityId' : 'reportId'];
        if (request.method !== method || request.query.size !== 0 || !validId(id)) throw new RequestError(400);
        if (method === 'GET') {
          if (request.body !== null) throw new RequestError(400);
          return queryResponse(200, { data: await service.get(principal, entityId('report', id)) });
        }
        const body = await readJson(request);
        const key = request.headers.get('idempotency-key');
        const data = method === 'POST'
          ? await service.create(principal, entityId('activity', id), parseCommand(body, key, true))
          : await service.update(principal, entityId('report', id), parseCommand(body, key, false));
        return queryResponse(method === 'POST' ? 201 : 200, { data });
      } catch (error) {
        if (error instanceof RequestError) return queryResponse(error.status, { error: {
          code: error.status === 413 ? 'PAYLOAD_TOO_LARGE' : error.status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'INVALID_REQUEST',
          message: 'Solicitud no válida.',
        } });
        if (error instanceof AuthenticationError) return queryResponse(401, { error: { code: 'UNAUTHENTICATED', message: 'Autenticación requerida.' } });
        if (error instanceof AccessDeniedError || error instanceof NotFoundError) {
          return queryResponse(404, { error: { code: 'NOT_FOUND', message: 'Recurso no disponible.' } });
        }
        if (error instanceof DuplicateError || error instanceof IncompatibleStateError || error instanceof VersionConflictError) {
          return queryResponse(409, { error: { code: 'CONFLICT', message: 'La operación no puede confirmarse.' } });
        }
        return unavailableQuery();
      }
    };
  }
  return Object.freeze({ createReport: handler('POST'), updateReport: handler('PATCH'), getReport: handler('GET') });
}
