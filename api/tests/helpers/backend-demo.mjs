// Test/demo only. Reuses approved identity fixtures and the real application composition.
import assert from 'node:assert/strict';
import { HttpRequest } from '@azure/functions';
import { createApplicationHandlers } from '../../.local-build/composition/queries.js';
import { FichaAuthorizationService } from '../../.local-build/application/authorization/service.js';
import { MemoryUnitOfWork } from '../../.local-build/infrastructure/memory/unitOfWork.js';
import { reportTools } from '../../.local-build/infrastructure/reportTools.js';
import { entityId, correlationId } from '../../.local-build/domain/types.js';
import { requireSubmissionEvidence } from '../../.local-build/domain/planning.js';
import { configuration, epoch, harness, signedToken } from '../fixtures/identity.mjs';
import { fixtures } from '../fixtures/memory.mjs';

export async function runBackendDemo() {
  const http = [], checks = [];
  let stage = 'SETUP', bearer = null, otherBearer = null;
  const levels = {
    http: 'Controladores HTTP en proceso; sin servidor ni sockets',
    identity: 'JWT firmado de laboratorio; validador original con reloj y JWKS de prueba',
    evidence: 'Precondición de dominio; no envío HTTP ni gestión de archivos',
    audit: 'Inspección directa de repositorios dentro de UnitOfWork en memoria',
  };
  try {
    const f = fixtures(), h = harness();
    const demoTime = Date.parse('2026-10-27T13:00:00.000Z');
    h.advance(demoTime - epoch);
    f.seed.fichas[0].cycleLabel = 'Ciclo sintético 2026';
    f.seed.users = f.seed.users.map(u => ({ ...u, tenantId: entityId('tenant', configuration.tenantId) }));
    const memory = new MemoryUnitOfWork(f.seed);
    const writes = { reports: 0, audit: 0, reservations: 0, completions: 0 };
    const track = (repository, method, counter) => async (...args) => {
      const result = await repository[method](...args);
      writes[counter]++;
      return result;
    };
    const work = { runAtomic: callback => memory.runAtomic(context => callback({ ...context,
      reports: { ...context.reports, create: track(context.reports, 'create', 'reports') },
      audit: { ...context.audit, append: track(context.audit, 'append', 'audit') },
      idempotency: { ...context.idempotency,
        reserve: track(context.idempotency, 'reserve', 'reservations'),
        complete: track(context.idempotency, 'complete', 'completions') },
    })) };
    // Approved test-only validity double. Never installed in the local/production host.
    const authorization = new FichaAuthorizationService(entityId('tenant', configuration.tenantId), h.clock, {
      isApplicable: (assignment, at) => Date.parse(assignment.validFrom) <= Date.parse(at)
        && (assignment.validUntil === null || Date.parse(at) < Date.parse(assignment.validUntil)),
    });
    let sequence = 0;
    const tools = { ...reportTools,
      id: kind => entityId(kind, `demo-${kind}-${++sequence}`),
      correlation: () => correlationId('demo:backend:276'),
    };
    const handlers = createApplicationHandlers(h.validator, work, authorization, h.clock, tools);
    const token = index => signedToken({ oid: f.seed.users[index].directoryObjectId,
      nbf: demoTime / 1000 - 60, exp: demoTime / 1000 + 600 });
    bearer = `Bearer ${await token(0)}`;
    otherBearer = `Bearer ${await token(1)}`;
    const invoke = async (name, handler, path, expected, options = {}) => {
      stage = name;
      const method = options.method ?? 'GET';
      const headers = { ...(options.auth === null ? {} : { Authorization: options.auth ?? bearer }),
        ...(options.body ? { 'Content-Type': 'application/json', 'Idempotency-Key': options.key ?? 'demo:advance:276' } : {}) };
      const response = await handlers[handler](new HttpRequest({ method,
        url: 'http://127.0.0.1:7071/api/poc/' + path, params: options.params ?? {}, headers,
        ...(options.body ? { body: { string: JSON.stringify(options.body) } } : {}) }));
      http.push({ check: name, method, path: '/api/poc/' + path, status: response.status });
      assert.equal(response.status, expected);
      return response;
    };
    const check = (name, operation, level = 'http-handler-in-process') => {
      stage = name; operation(); checks.push({ check: name, level, status: 'OK' });
    };
    await invoke('SIN_BEARER', 'fichas', 'fichas', 401, { auth: null });
    await invoke('BEARER_INVALIDO', 'fichas', 'fichas', 401, { auth: 'Bearer invalid-synthetic' });
    const list = await invoke('FICHAS_AUTORIZADAS', 'fichas', 'fichas', 200);
    check('SOLO_FICHA_AUTORIZADA', () => assert.deepEqual(list.jsonBody.data.map(x => x.id), [f.fichaAlpha]));
    const ficha = await invoke('DETALLE_FICHA', 'ficha', `fichas/${f.fichaAlpha}`, 200, { params: { fichaId: f.fichaAlpha } });
    const denied = await invoke('FICHA_NO_AUTORIZADA', 'ficha', `fichas/${f.fichaBeta}`, 404, { params: { fichaId: f.fichaBeta } });
    const missing = await invoke('FICHA_INEXISTENTE', 'ficha', 'fichas/synthetic-missing', 404, { params: { fichaId: 'synthetic-missing' } });
    check('DENEGACION_NO_REVELA_EXISTENCIA', () => assert.deepEqual(denied.jsonBody, missing.jsonBody));
    const activities = await invoke('ACTIVIDADES', 'actividades', `fichas/${f.fichaAlpha}/actividades`, 200,
      { params: { fichaId: f.fichaAlpha } });
    check('ACTIVIDADES_DE_LA_FICHA', () => {
      assert.equal(activities.jsonBody.data.length, 2);
      assert.ok(activities.jsonBody.data.every(x => x.fichaId === f.fichaAlpha));
    });
    const activityId = activities.jsonBody.data[0].id;
    const reportsPath = `fichas/${f.fichaAlpha}/reportes?period=2026-Q4`;
    const before = await invoke('REPORTES_INICIALES', 'reportes', reportsPath, 200, { params: { fichaId: f.fichaAlpha } });
    check('MEMORIA_INICIAL_SIN_REPORTES', () => assert.deepEqual(before.jsonBody.data, []));
    await invoke('REPORTES_NO_AUTORIZADOS', 'reportes', `fichas/${f.fichaBeta}/reportes?period=2026-Q4`, 404,
      { params: { fichaId: f.fichaBeta } });
    check('PRECONDICION_ENVIO_SIN_EVIDENCIA_RECHAZADA', () => {
      assert.throws(() => requireSubmissionEvidence(true, []), error => error.code === 'INVALID_VALUE');
      assert.deepEqual(writes, { reports: 0, audit: 0, reservations: 0, completions: 0 });
    }, 'domain-precondition-only');
    check('REFERENCIA_DE_EVIDENCIA_PRESENTE', () => requireSubmissionEvidence(true, ['synthetic-evidence-276']), 'domain-precondition-only');
    const command = { period: '2026-Q4', quantity: '9007199254740993.000100', narrative: 'Avance sintético trimestral: á 😀 漢字' };
    const postOptions = { method: 'POST', params: { activityId }, body: command };
    const postPath = `actividades/${activityId}/reportes`;
    await invoke('DATOS_OBLIGATORIOS', 'createReport', postPath, 400,
      { ...postOptions, body: { quantity: command.quantity, narrative: command.narrative }, key: 'demo:invalid:276' });
    const created = await invoke('REGISTRO_BORRADOR', 'createReport', postPath, 201, postOptions);
    const receipt = created.jsonBody.data;
    const replay = await invoke('REPETICION_IDEMPOTENTE', 'createReport', postPath, 201, postOptions);
    check('RECIBO_Y_VERSION_ORIGINALES', () => assert.deepEqual(replay.jsonBody, created.jsonBody));
    await invoke('CLAVE_CON_OTRO_CONTENIDO', 'createReport', postPath, 409,
      { ...postOptions, body: { ...command, narrative: 'Otro contenido sintético' } });
    const after = await invoke('REPORTES_DEL_PERIODO', 'reportes', reportsPath, 200, { params: { fichaId: f.fichaAlpha } });
    const read = await invoke('REPORTE_POR_ID', 'getReport', `reportes/${receipt.id}`, 200, { params: { reportId: receipt.id } });
    await invoke('REPORTE_OTRO_USUARIO', 'getReport', `reportes/${receipt.id}`, 404,
      { params: { reportId: receipt.id }, auth: otherBearer });
    check('UN_REPORTE_UN_AUDIT_UNA_RESERVA', () => {
      assert.equal(after.jsonBody.data.length, 1);
      assert.deepEqual(after.jsonBody.data[0], read.jsonBody.data);
      assert.equal(read.jsonBody.data.quantity, command.quantity);
      assert.equal(read.jsonBody.data.narrative, command.narrative);
      assert.equal(read.jsonBody.data.createdAt, '2026-10-27T13:00:00.000Z');
      assert.deepEqual(writes, { reports: 1, audit: 1, reservations: 1, completions: 1 });
    });
    stage = 'AUDITORIA_E_IDEMPOTENCIA';
    await memory.runAtomic(async context => {
      const idem = await context.idempotency.findByScope({ actorId: f.alpha, operation: 'poc:create-report', key: 'demo:advance:276' });
      assert.equal(idem.state, 'poc:completed');
      assert.equal(idem.outcome.report.id, receipt.id);
      const audit = await context.audit.findById(idem.outcome.auditEventId);
      assert.equal(audit.change.action, 'poc:report-created');
      assert.equal(audit.actorId, f.alpha);
      assert.equal(audit.change.before, null);
      assert.equal(audit.correlationId, 'demo:backend:276');
      assert.deepEqual(audit.change.after, idem.outcome.report);
    });
    checks.push({ check: stage, level: 'repositories-direct-in-memory-uow', status: 'OK' });
    const { version: _version, ...exampleReport } = read.jsonBody.data;
    return { status: 'OK', mode: 'memory-only', levels, http, checks, writes,
      examples: { ficha: ficha.jsonBody.data, activity: activities.jsonBody.data[0], report: exampleReport },
      limitations: { realInstitutionalLogin: false, networkHttp: false, sql: false,
        evidenceFilesVerified: false, institutionalSendImplemented: false, stateTransitionsImplemented: false,
        quarterlyClosuresImplemented: false },
    };
  } catch {
    return { status: 'FAILED', category: 'BACKEND_DEMO_CHECK_FAILED', failedStep: stage, levels, http, checks };
  } finally { bearer = null; otherBearer = null; }
}
