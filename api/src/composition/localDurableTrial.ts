import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { AssignmentValidityPolicy } from '../application/authorization/service.js';
import type { IdentityValidator } from '../application/ports/identity.js';
import type { Clock } from '../application/ports/clock.js';
import { AccessDeniedError } from '../domain/errors.js';
import { AuthenticationError } from '../infrastructure/identity/errors.js';
import { assertLocalEnvironment } from '../infrastructure/localOnly.js';

export const trialScope = Object.freeze({
  tenantId: '9c6cb0e9-1c0e-4137-ac54-6ba138984ef2',
  audience: 'aca30f77-872a-4cc5-a540-0a7547d95f53',
  userId: 'l8e4-20261023-r01-user', fichaId: 'l8e4-20261023-r01-ficha',
  activityId: 'l8e4-20261023-r01-activity',
  readAssignment: 'l8e4-20261023-r01-read', editAssignment: 'l8e4-20261023-r01-edit',
  period: 'poc-durable-20261023-r01', key: 'l8e4:20261023:r01:create-report',
  quantity: '9007199254740993.000100', narrative: 'Ensayo sintetico L8-E4: á 😀 漢字',
});
const instant = (value: unknown): value is string => typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const guid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  && value !== '00000000-0000-0000-0000-000000000000';
export interface TrialConfiguration {
  readonly enabled: 'L8E4_R01'; readonly tenantId: string; readonly objectId: string;
  readonly validFrom: string; readonly validUntil: string;
  readonly mode: 'write' | 'read'; readonly reportId?: string;
}
function invalid(): never {
  const error = new Error('Configuración local de ensayo no válida.');
  delete error.stack;
  throw error;
}
export function validateTrialConfiguration(value: unknown, clock: Clock): Readonly<TrialConfiguration> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['enabled','tenantId','objectId','validFrom','validUntil','mode','reportId'].includes(key))
    || input.enabled !== 'L8E4_R01' || input.tenantId !== trialScope.tenantId || !guid(input.objectId)
    || !instant(input.validFrom) || !instant(input.validUntil)
    || !['write','read'].includes(input.mode as string)
    || Date.parse(input.validUntil) - Date.parse(input.validFrom) > 3600000
    || !(input.validFrom < clock.now() && clock.now() < input.validUntil)
    || (input.mode === 'write' && input.reportId !== undefined)
    || (input.mode === 'read' && (typeof input.reportId !== 'string'
      || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.reportId)))) return invalid();
  return Object.freeze({ ...input }) as unknown as Readonly<TrialConfiguration>;
}
export function assertTrialEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  assertLocalEnvironment(env);
  if (process.platform !== 'win32' || process.arch !== 'x64' || !process.versions.node.startsWith('24.')
    || env.NODE_ENV === 'production' || env.FUNCTIONS_WORKER_RUNTIME_VERSION
    || env.NODE_OPTIONS || env.DOTNET_STARTUP_HOOKS || env.FUNCTIONS_WORKER_PROCESS_ARGUMENTS
    || env.FUNCTIONS_WORKER_RUNTIME !== 'node' || env.PAI_API_PERSISTENCE !== 'sql-local'
    || !['localhost:7071', '127.0.0.1:7071'].includes(env.WEBSITE_HOSTNAME ?? '')) throw new AccessDeniedError();
}
export function assertLocalTrialHost(): void {
  try {
    assertTrialEnvironment();
    // Actual OS identity, verified Core Tools ancestry/hash and owning loopback listener.
    // Neither HTTP input nor a set of environment variables can fabricate this check.
    const output = execFileSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
      ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',
        fileURLToPath(new URL('../../scripts/check-l8e4-host.ps1', import.meta.url)), '-WriterPid', String(process.pid)],
      { encoding: 'utf8', windowsHide: true, shell: false, timeout: 10000, maxBuffer: 4096,
        stdio: ['ignore','pipe','pipe'], env: { SystemRoot: 'C:\\Windows', WINDIR: 'C:\\Windows',
          PATH: 'C:\\Windows\\System32', PSModulePath: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules' } });
    if (JSON.stringify(JSON.parse(output.replace(/^\uFEFF/, ''))) !== '{"trusted":true}') throw new Error();
  } catch { throw new AccessDeniedError(); }
}
type Handler = (request: HttpRequest) => Promise<HttpResponseInit> | HttpResponseInit;
const response = (status: number, jsonBody: unknown): HttpResponseInit => ({ status, jsonBody, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff', ...(status === 401 ? { 'WWW-Authenticate': 'Bearer' } : {}),
} });
const unavailable = (): HttpResponseInit => response(404, { error: { code: 'NOT_FOUND', message: 'Recurso no disponible.' } });
async function exactBody(request: HttpRequest): Promise<boolean> {
  const reader = request.clone().body?.getReader();
  if (!reader) return false;
  let size = 0; const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) { void reader.cancel().catch(() => {}); return false; }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return body && Object.keys(body).length === 3 && body.period === trialScope.period
      && body.quantity === trialScope.quantity && body.narrative === trialScope.narrative;
  } finally { reader.releaseLock(); }
}
/** Trusted composition factory. The guard injection exists solely for isolated test doubles. */
export function createDurableTrial(raw: string, clock: Clock, checkHost: () => void = assertLocalTrialHost) {
  if (raw.length > 2048) return invalid();
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { return invalid(); }
  const config = validateTrialConfiguration(parsed, clock);
  const live = () => { if (!(config.validFrom < clock.now() && clock.now() < config.validUntil)) throw new AccessDeniedError(); };
  const validity: AssignmentValidityPolicy = Object.freeze({ isApplicable(
    assignment: Parameters<AssignmentValidityPolicy['isApplicable']>[0],
    at: Parameters<AssignmentValidityPolicy['isApplicable']>[1]) {
    const expectedId = assignment.capability === 'poc:read' ? trialScope.readAssignment
      : assignment.capability === 'poc:edit-report' ? trialScope.editAssignment : null;
    return assignment.id === expectedId && assignment.userId === trialScope.userId
      && assignment.fichaId === trialScope.fichaId && assignment.enabled === true
      && assignment.validFrom === config.validFrom && assignment.validUntil === config.validUntil
      && config.validFrom < at && at < config.validUntil;
  } });
  const restrictIdentity = (original: IdentityValidator): IdentityValidator => Object.freeze({
    async validateAuthorization(value: Parameters<IdentityValidator['validateAuthorization']>[0]) {
      const identity = await original.validateAuthorization(value); // Original JWT validation is mandatory.
      live();
      if (identity.tenantId !== config.tenantId || identity.objectId !== config.objectId
        || identity.audience !== trialScope.audience || !identity.scopes.includes('access_as_user')) throw new AccessDeniedError();
      return identity;
    },
  });
  let attempted = false;
  return Object.freeze({ validity, restrictIdentity,
    wrap(handler: Handler, identity: IdentityValidator, operation: 'create' | 'get' | 'deny'): Handler {
      return async request => {
        try {
          await identity.validateAuthorization(request.headers.get('authorization'));
          live(); checkHost();
          if (request.query.size !== 0) return unavailable();
          if (operation === 'create') {
            if (config.mode !== 'write' || attempted || request.method !== 'POST'
              || request.params.activityId !== trialScope.activityId
              || request.headers.get('idempotency-key') !== trialScope.key) return unavailable();
            attempted = true; // One dispatch only, including ambiguous/failing outcomes. No automatic replay.
            if (!await exactBody(request)) return unavailable();
          } else if (operation === 'get') {
            if (config.mode !== 'read' || request.method !== 'GET' || request.params.reportId !== config.reportId) return unavailable();
          } else {
            // Read-only diagnostic on an already-denied route. No application/UoW call.
            const denied = unavailable();
            if (request.method === 'GET' && request.headers.get('x-pai-l8e4-probe') === '1'
              && new URL(request.url).pathname === '/api/poc/fichas/' + trialScope.fichaId) {
              denied.headers = { ...denied.headers as Record<string, string>, 'X-PAI-L8E4-Guard': 'verified' };
            }
            return denied;
          }
          return await handler(request);
        } catch (error) {
          if (error instanceof AuthenticationError) return response(401, { error: { code: 'UNAUTHENTICATED', message: 'Autenticación requerida.' } });
          if (error instanceof AccessDeniedError) return unavailable();
          return response(500, { error: { code: 'INTERNAL_ERROR', message: 'Servicio no disponible.' } });
        }
      };
    },
  });
}
