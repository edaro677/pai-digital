import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SqlAuditRepository } from '../.local-build/infrastructure/sql/repositories/audit.js';
import { SqlReportRepository } from '../.local-build/infrastructure/sql/repositories/report.js';
import { SqlIdempotencyRepository } from '../.local-build/infrastructure/sql/repositories/idempotency.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';
import { SqlInfrastructureError } from '../.local-build/infrastructure/sql/errors.js';

const now = '2026-01-02T03:04:05.123Z', later = '2026-02-03T04:05:06.456Z';
const bytes = n => Uint8Array.from([0, 0, 0, 0, 0, 0, 0, n]);
const secret = 'EMPRESA\\usuario.prueba C:\\Privado\\usuario.prueba Password=sintetica';
const report = (extra = {}) => ({ id: 'report-A', activityId: 'activity-A', period: '2026-T1-á😀',
  quantity: '-0.00000000000000000000000000000000000000000100', narrative: 'PoC á😀漢字', state: 'poc-draft',
  createdBy: 'user-A', createdAt: now, updatedBy: 'user-A', updatedAt: now,
  version: 'rv1:0000000000000001', ...extra });
const newReport = extra => { const { version, ...value } = report(extra); return value; };
const event = (r = report(), extra = {}) => ({ id: 'audit-A', actorId: 'user-A', occurredAt: now,
  correlationId: 'corr:1', change: { action: 'poc:report-created', before: null, after: r }, ...extra });
const scope = (extra = {}) => ({ actorId: 'user-A', operation: 'poc:create-report', key: 'request:1', ...extra });
const reservation = (extra = {}) => ({ id: 'idem-A', scope: scope(), requestFingerprint: 'a'.repeat(64), createdAt: now, ...extra });
const reportRow = (r = report()) => ({ Id: r.id, ActivityId: r.activityId, PeriodKey: r.period,
  QuantityText: r.quantity, Narrative: r.narrative, State: r.state, CreatedBy: r.createdBy,
  CreatedAt: new Date(r.createdAt), UpdatedBy: r.updatedBy, UpdatedAt: new Date(r.updatedAt), RV: bytes(1) });
const auditRow = (e = event()) => ({ Id: e.id, ActorId: e.actorId, OccurredAt: new Date(e.occurredAt),
  CorrelationId: e.correlationId, Action: e.change.action,
  BeforeJson: e.change.before === null ? null : JSON.stringify(e.change.before), AfterJson: JSON.stringify(e.change.after) });
const reservedRow = (extra = {}) => ({ Id: 'idem-A', ActorId: 'user-A', Operation: 'poc:create-report',
  IdempotencyKey: 'request:1', RequestFingerprint: 'a'.repeat(64), CreatedAt: new Date(now),
  State: 'poc:reserved', CompletedAt: null, OutcomeReportId: null, OutcomeAuditEventId: null,
  OutcomeReportJson: null, RV: bytes(1), ...extra });
function safe(code) { return error => {
  assert.equal(error.code, code); assert.equal(error.stack, undefined); assert.equal(error.cause, undefined);
  assert.equal(error.originalError, undefined); assert.equal(JSON.stringify(error).includes(secret), false); return true;
}; }

// SQL-shaped transport double, not a persistence adapter or SQL executor.
function setup(seed = {}, options = {}) {
  let db = { InstitutionalUsers: [{ Id: 'user-A' }], Activities: [{ Id: 'activity-A' }],
    Reports: [], AuditEvents: [], IdempotencyRecords: [], ...structuredClone(seed) };
  const statements = [], events = []; let counter = 10, saved;
  const tx = {
    async execute(statement) {
      statements.push(structuredClone(statement)); events.push('query');
      if (options.fail?.(statement)) throw Object.assign(new Error(secret), { number: 2627, originalError: { message: secret } });
      const p = Object.fromEntries(statement.parameters.map(x => [x.name, x.value]));
      const table = statement.text.match(/(?:FROM|INTO|UPDATE) pai\.(\w+)/)?.[1];
      assert.ok(table && db[table]);
      if (statement.text.startsWith('SELECT')) {
        const rows = db[table].filter(r => {
          if (p.id !== undefined) return r.Id === p.id;
          if (table === 'Reports') return r.ActivityId === p.activityId && r.PeriodKey === p.period;
          if (table === 'IdempotencyRecords') return r.ActorId === p.actorId && r.Operation === p.operation && r.IdempotencyKey === p.key;
          return true;
        });
        return structuredClone(rows);
      }
      if (statement.text.startsWith('INSERT')) {
        let row;
        if (table === 'Reports') row = { Id: p.id, ActivityId: p.activityId, PeriodKey: p.period, QuantityText: p.quantity,
          Narrative: p.narrative, State: p.state, CreatedBy: p.createdBy, CreatedAt: p.createdAt,
          UpdatedBy: p.updatedBy, UpdatedAt: p.updatedAt, RV: bytes(++counter) };
        if (table === 'AuditEvents') row = { Id: p.id, ActorId: p.actorId, OccurredAt: p.occurredAt,
          CorrelationId: p.correlationId, Action: p.action, BeforeJson: p.beforeJson, AfterJson: p.afterJson };
        if (table === 'IdempotencyRecords') row = reservedRow({ Id: p.id, ActorId: p.actorId, Operation: p.operation,
          IdempotencyKey: p.key, RequestFingerprint: p.fingerprint, CreatedAt: p.createdAt, RV: bytes(++counter) });
        assert.ok(row); db[table].push(row); return [structuredClone(row)];
      }
      assert.ok(statement.text.startsWith('UPDATE'));
      const row = db[table].find(r => r.Id === p.id);
      if (options.zeroUpdate || !row || Buffer.compare(Buffer.from(row.RV), Buffer.from(p.expectedVersion)) !== 0) return [];
      if (table === 'Reports') Object.assign(row, { QuantityText: p.quantity, Narrative: p.narrative,
        State: p.state, UpdatedBy: p.updatedBy, UpdatedAt: p.updatedAt, RV: bytes(++counter) });
      if (table === 'IdempotencyRecords') {
        if (row.State !== 'poc:reserved') return [];
        Object.assign(row, { State: 'poc:completed', CompletedAt: p.completedAt, OutcomeReportId: p.reportId,
          OutcomeAuditEventId: p.auditId, OutcomeReportJson: p.reportJson, RV: bytes(++counter) });
      }
      return [structuredClone(row)];
    },
    async rollback() { events.push('rollback'); db = saved; },
    async commit() { events.push('commit'); },
  };
  const runner = new SqlSessionRunner({ async connect() { events.push('connect'); return {
    async begin(isolation) { assert.equal(isolation, 'SERIALIZABLE'); events.push('begin'); saved = structuredClone(db); return tx; },
    async close() { events.push('close'); },
  }; } });
  return { statements, events, rows: table => structuredClone(db[table]),
    run: (work, completion = 'rollback') => runner.run(completion, session => work({
      reports: new SqlReportRepository(session), audit: new SqlAuditRepository(session),
      idempotency: new SqlIdempotencyRepository(session),
    })) };
}
for (const [name, Repo, file] of [['Audit', SqlAuditRepository, 'audit'], ['Report', SqlReportRepository, 'report'], ['Idempotency', SqlIdempotencyRepository, 'idempotency']]) {
  test(`${name}: compiled contract, session-only constructor and no independent transaction`, () => {
    const source = readFileSync(new URL(`../src/infrastructure/sql/repositories/${file}.ts`, import.meta.url), 'utf8');
    assert.ok(source.includes(`implements ${name}Repository`));
    assert.match(source, /constructor\(private readonly session: SqlSession\)/);
    assert.doesNotMatch(source, /ConnectionPool|BEGIN TRANSACTION|COMMIT|ROLLBACK|@azure\/functions/);
    let called = false; new Repo({ execute() { called = true; } }); assert.equal(called, false);
  });
}
test('Report: reads preserve exact DecimalText, Unicode period/narrative, UTC and rowversion', async () => {
  const f = setup({ Reports: [reportRow()] });
  await f.run(async ({ reports }) => {
    assert.deepEqual(await reports.findById('report-A'), report());
    assert.deepEqual(await reports.findByActivityAndPeriod('activity-A', report().period), report());
    assert.equal(await reports.findById('missing'), null);
    assert.equal(await reports.findByActivityAndPeriod('missing', report().period), null);
  });
  assert.deepEqual(f.statements[1].parameters, [
    { name: 'activityId', type: 'varchar', length: 64, value: 'activity-A' },
    { name: 'period', type: 'nvarchar', length: 128, value: report().period },
  ]);
  assert.equal(f.statements[1].text.includes(report().period), false);
});
test('Report: create checks references and returns only SQL-generated RV', async () => {
  const f = setup();
  const value = await f.run(({ reports }) => reports.create(newReport()));
  assert.equal(value.quantity, report().quantity); assert.equal(value.version, 'rv1:000000000000000b');
  const insert = f.statements.find(s => s.text.startsWith('INSERT'));
  assert.match(insert.text, /OUTPUT INSERTED\.Id/);
  assert.deepEqual(insert.parameters.find(p => p.name === 'quantity'), { name: 'quantity', type: 'varchar', length: 'max', value: report().quantity });
  assert.equal(insert.parameters.find(p => p.name === 'createdAt').value.toISOString(), now);
  assert.equal(insert.parameters.some(p => p.name === 'version'), false);
  assert.deepEqual(f.rows('Reports'), []); assert.equal(f.events.includes('commit'), false);
});
for (const duplicate of [report(), report({ id: 'other-report' })]) {
  test(`Report: duplicate ${duplicate.id === 'report-A' ? 'ID' : 'activity/period'} rejected before INSERT`, async () => {
    const f = setup({ Reports: [reportRow(duplicate)] });
    await assert.rejects(f.run(({ reports }) => reports.create(newReport())), safe('DUPLICATE'));
    assert.equal(f.statements.some(s => s.text.startsWith('INSERT')), false);
  });
}
test('Report: absent activity/author is NOT_FOUND without partial writes', async () => {
  for (const seed of [{ Activities: [] }, { InstitutionalUsers: [] }]) {
    const f = setup(seed);
    await assert.rejects(f.run(({ reports }) => reports.create(newReport())), safe('NOT_FOUND'));
    assert.equal(f.statements.some(s => s.text.startsWith('INSERT')), false);
  }
});
test('Report: update changes only permitted fields and uses expected binary RV', async () => {
  const f = setup({ Reports: [reportRow()] });
  const value = await f.run(({ reports }) => reports.update('report-A', report().version, {
    ...report(), id: 'ignored', activityId: 'ignored', period: 'ignored', createdAt: later,
    quantity: null, narrative: 'Actualizado á😀', state: 'poc-blocked', updatedAt: later,
  }));
  assert.equal(value.id, 'report-A'); assert.equal(value.activityId, 'activity-A'); assert.equal(value.period, report().period);
  assert.equal(value.createdAt, now); assert.equal(value.quantity, null); assert.equal(value.updatedAt, later);
  const update = f.statements.find(s => s.text.startsWith('UPDATE'));
  assert.match(update.text, /WHERE Id=@id AND RV=@expectedVersion/);
  assert.doesNotMatch(update.text.split('OUTPUT')[0], /SET Id|ActivityId=|PeriodKey=|CreatedAt=|CreatedBy=/);
  assert.deepEqual(update.parameters.find(p => p.name === 'expectedVersion'), { name: 'expectedVersion', type: 'binary', length: 8, value: bytes(1) });
});
for (const expected of ['opaque-memory-version', 'rv1:0000000000000002']) {
  test(`Report: opaque/stale expected version ${expected} conflicts, never codec failure`, async () => {
    const f = setup({ Reports: [reportRow()] });
    await assert.rejects(f.run(({ reports }) => reports.update('report-A', expected, report())), safe('VERSION_CONFLICT'));
    assert.equal(f.statements.some(s => s.text.startsWith('UPDATE')), false);
  });
}
test('Report: missing update and concurrent zero-row update have distinct errors', async () => {
  await assert.rejects(setup().run(({ reports }) => reports.update('missing', 'opaque', report())), safe('NOT_FOUND'));
  await assert.rejects(setup({ Reports: [reportRow()] }, { zeroUpdate: true }).run(({ reports }) => reports.update('report-A', report().version, report())), safe('VERSION_CONFLICT'));
});
for (const quantity of ['-0.000', '999999999999999999999999999999999999999.123456789012345678900', null]) {
  test(`Report: exact decimal representation (${quantity === null ? 'null' : quantity.length})`, async () => {
    const result = await setup().run(({ reports }) => reports.create(newReport({ quantity })));
    assert.equal(result.quantity, quantity);
  });
}
test('Report: malformed decimal, UTC and period never reach INSERT', async () => {
  for (const changes of [{ quantity: '1e3' }, { createdAt: '2026-01-01T00:00:00Z' }, { period: '\ud800' }]) {
    const f = setup(); await assert.rejects(f.run(({ reports }) => reports.create(newReport(changes))), safe('SQL_CODEC_INVALID'));
    assert.equal(f.statements.length, 0);
  }
});
test('Audit: append-only insert preserves opaque historical version and deep snapshots', async () => {
  const historical = report({ version: 'historical:memory-v7' }), input = event(historical), f = setup();
  await f.run(async ({ audit }) => {
    await audit.append(input); input.change.after.narrative = 'caller mutation';
    const found = await audit.findById('audit-A'); assert.equal(found.change.after.version, 'historical:memory-v7');
    assert.equal(found.change.after.narrative, 'PoC á😀漢字'); found.change.after.narrative = 'output mutation';
    assert.equal((await audit.findById('audit-A')).change.after.narrative, 'PoC á😀漢字');
    assert.equal(audit.update, undefined); assert.equal(audit.delete, undefined);
  });
  const insert = f.statements.find(s => s.text.startsWith('INSERT'));
  assert.equal(insert.parameters.find(p => p.name === 'beforeJson').value, null);
  assert.match(insert.parameters.find(p => p.name === 'afterJson').value, /historical:memory-v7/);
  assert.deepEqual(f.rows('AuditEvents'), []);
});
test('Audit: report update, user and assignment snapshot variants roundtrip', async () => {
  const user = { id: 'user-A', tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', directoryObjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', alias: 'á😀', enabled: true, version: 'old:user' };
  const assignment = { id: 'assignment-A', userId: 'user-A', fichaId: 'ficha-A', capability: 'poc:read', enabled: false, validFrom: now, validUntil: null, version: 'old:assignment' };
  for (const change of [
    { action: 'poc:report-updated', before: report(), after: report({ narrative: 'next', version: 'opaque:next' }) },
    { action: 'poc:user-enabled-changed', before: user, after: { ...user, enabled: false } },
    { action: 'poc:assignment-enabled-changed', before: assignment, after: { ...assignment, enabled: true } },
  ]) {
    const f = setup(), input = event(undefined, { change });
    await f.run(async ({ audit }) => { await audit.append(input); assert.deepEqual(await audit.findById(input.id), input); });
  }
});
test('Audit: duplicate, missing actor, missing read and invalid historical JSON', async () => {
  await assert.rejects(setup({ AuditEvents: [auditRow()] }).run(({ audit }) => audit.append(event())), safe('DUPLICATE'));
  await assert.rejects(setup({ InstitutionalUsers: [] }).run(({ audit }) => audit.append(event())), safe('NOT_FOUND'));
  assert.equal(await setup().run(({ audit }) => audit.findById('missing')), null);
  const bad = auditRow(); bad.AfterJson = bad.AfterJson.replace('"id":', '"id":"duplicate","id":');
  await assert.rejects(setup({ AuditEvents: [bad] }).run(({ audit }) => audit.findById('audit-A')), safe('SQL_CODEC_INVALID'));
});
test('Audit: non-null before on creation and invalid snapshot versions rejected', async () => {
  for (const change of [ { action: 'poc:report-created', before: report(), after: report() },
    { action: 'poc:report-created', before: null, after: report({ version: '' }) } ]) {
    const f = setup(); await assert.rejects(f.run(({ audit }) => audit.append(event(undefined, { change }))), safe('SQL_CODEC_INVALID'));
    assert.equal(f.statements.length, 0);
  }
});
test('Idempotency: reserve typed scope and database version, empty read returns null', async () => {
  const f = setup();
  await f.run(async ({ idempotency }) => {
    assert.equal(await idempotency.findByScope(scope()), null);
    const r = await idempotency.reserve(reservation());
    assert.equal(r.state, 'poc:reserved'); assert.equal(r.outcome, null); assert.equal(r.completedAt, null);
    assert.notEqual(r.version, report().version); assert.deepEqual(await idempotency.findByScope(scope()), r);
  });
  const query = f.statements[0];
  assert.match(query.text, /ActorId=@actorId AND Operation=@operation AND IdempotencyKey=@key/);
  assert.deepEqual(query.parameters.map(p => [p.name, p.type, p.length]), [['actorId','varchar',64],['operation','varchar',40],['key','varchar',128]]);
  assert.equal(query.text.includes('request:1'), false);
});
for (const existing of [reservedRow({ IdempotencyKey: 'different' }), reservedRow({ Id: 'different' })]) {
  test(`Idempotency: no overwrite duplicate ${existing.Id === 'idem-A' ? 'ID' : 'scope'}`, async () => {
    const f = setup({ IdempotencyRecords: [existing] });
    await assert.rejects(f.run(({ idempotency }) => idempotency.reserve(reservation())), safe('DUPLICATE'));
    assert.equal(f.statements.some(s => s.text.startsWith('INSERT')), false);
  });
}
test('Idempotency: actor/operation/key remain independent scope components', async () => {
  const f = setup({ IdempotencyRecords: [reservedRow()] });
  await f.run(async ({ idempotency }) => {
    for (const s of [scope({ actorId: 'user-B' }), scope({ operation: 'poc:update-report' }), scope({ key: 'request:2' })]) assert.equal(await idempotency.findByScope(s), null);
  });
});
test('Idempotency: complete preserves historical result after report changes; no reconstruction', async () => {
  const f = setup();
  await f.run(async ({ reports, audit, idempotency }) => {
    const created = await reports.create(newReport()); await audit.append(event(created));
    const pending = await idempotency.reserve(reservation());
    const completed = await idempotency.complete(pending.id, pending.version, { report: created, auditEventId: 'audit-A' }, later);
    assert.equal(completed.state, 'poc:completed'); assert.notEqual(completed.version, pending.version);
    await reports.update(created.id, created.version, { ...created, narrative: 'new current report' });
    const beforeRead = f.statements.length;
    const replay = await idempotency.findByScope(scope());
    assert.deepEqual(replay, completed); assert.equal(replay.outcome.report.narrative, 'PoC á😀漢字');
    assert.equal(f.statements.length, beforeRead + 1); assert.match(f.statements.at(-1).text, /FROM pai.IdempotencyRecords/);
    replay.outcome.report.narrative = 'caller mutation';
    assert.deepEqual(await idempotency.findByScope(scope()), completed);
    const update = f.statements.find(s => s.text.startsWith('UPDATE pai.IdempotencyRecords'));
    assert.match(update.text, /RV=@expectedVersion AND State='poc:reserved'/);
    assert.equal(update.parameters.find(p => p.name === 'reportJson').type, 'nvarchar');
  });
});
test('Idempotency: missing, opaque-version conflict and completed-state rejection', async () => {
  const outcome = { report: report(), auditEventId: 'audit-A' };
  await assert.rejects(setup().run(({ idempotency }) => idempotency.complete('missing', 'opaque', outcome, later)), safe('NOT_FOUND'));
  await assert.rejects(setup({ IdempotencyRecords: [reservedRow()] }).run(({ idempotency }) => idempotency.complete('idem-A', 'opaque', outcome, later)), safe('VERSION_CONFLICT'));
  const completed = reservedRow({ State: 'poc:completed', CompletedAt: new Date(later), OutcomeReportId: 'report-A', OutcomeAuditEventId: 'audit-A', OutcomeReportJson: JSON.stringify(report()) });
  await assert.rejects(setup({ IdempotencyRecords: [completed] }).run(({ idempotency }) => idempotency.complete('idem-A', report().version, outcome, later)), safe('INCOMPATIBLE_STATE'));
});
test('Idempotency: required report/audit references and exact audit result consistency', async () => {
  for (const [seed, expected] of [
    [{}, 'NOT_FOUND'],
    [{ Reports: [reportRow()] }, 'NOT_FOUND'],
    [{ Reports: [reportRow()], AuditEvents: [auditRow(event(report({ narrative: 'mismatch' })))] }, 'INCOMPATIBLE_STATE'],
  ]) {
    const f = setup({ IdempotencyRecords: [reservedRow()], ...seed });
    await assert.rejects(f.run(({ idempotency }) => idempotency.complete('idem-A', report().version, { report: report(), auditEventId: 'audit-A' }, later)), safe(expected));
    assert.equal(f.statements.some(s => s.text.startsWith('UPDATE')), false);
  }
});
test('Idempotency: concurrent zero-row complete conflicts instead of overwriting', async () => {
  const f = setup({ Reports: [reportRow()], AuditEvents: [auditRow()], IdempotencyRecords: [reservedRow()] }, { zeroUpdate: true });
  await assert.rejects(f.run(({ idempotency }) => idempotency.complete('idem-A', report().version, { report: report(), auditEventId: 'audit-A' }, later)), safe('VERSION_CONFLICT'));
});
test('Idempotency: corrupted state/outcome links and duplicate historical JSON keys rejected', async () => {
  const completed = reservedRow({ State: 'poc:completed', CompletedAt: new Date(later), OutcomeReportId: 'report-A', OutcomeAuditEventId: 'audit-A', OutcomeReportJson: JSON.stringify(report({ version: 'historic:memory' })) });
  for (const value of [reservedRow({ CompletedAt: new Date(later) }), { ...completed, OutcomeReportId: 'different' },
    { ...completed, OutcomeReportJson: completed.OutcomeReportJson.replace('"id":', '"id":"duplicate","id":') }]) {
    await assert.rejects(setup({ IdempotencyRecords: [value] }).run(({ idempotency }) => idempotency.findByScope(scope())), safe('SQL_CODEC_INVALID'));
  }
  const historical = await setup({ IdempotencyRecords: [completed] }).run(({ idempotency }) => idempotency.findByScope(scope()));
  assert.equal(historical.outcome.report.version, 'historic:memory');
});
test('Idempotency: invalid fingerprints and missing actors cannot create reservations', async () => {
  const f = setup(); await assert.rejects(f.run(({ idempotency }) => idempotency.reserve(reservation({ requestFingerprint: 'invalid' }))), safe('SQL_CODEC_INVALID'));
  assert.equal(f.statements.length, 0);
  await assert.rejects(setup({ InstitutionalUsers: [] }).run(({ idempotency }) => idempotency.reserve(reservation())), safe('NOT_FOUND'));
});
test('Idempotency: invalid composite inputs/accessors cannot expose raw errors', async () => {
  const f = setup(), bad = {};
  Object.defineProperty(bad, 'report', { get() { throw new Error(secret); } });
  await assert.rejects(f.run(({ idempotency }) => idempotency.complete('idem-A', 'opaque', bad, later)), safe('SQL_CODEC_INVALID'));
  await assert.rejects(f.run(({ idempotency }) => idempotency.findByScope(null)), safe('SQL_CODEC_INVALID'));
  assert.equal(f.statements.length, 0);
});
test('Atomic caller rollback restores report, audit and reservation/completion together', async () => {
  const f = setup();
  await assert.rejects(f.run(async ({ reports, audit, idempotency }) => {
    const created = await reports.create(newReport()); await audit.append(event(created));
    const pending = await idempotency.reserve(reservation());
    await idempotency.complete(pending.id, pending.version, { report: created, auditEventId: 'audit-A' }, later);
    throw new Error(secret);
  }), safe('SQL_WORK_FAILED'));
  for (const table of ['Reports', 'AuditEvents', 'IdempotencyRecords']) assert.deepEqual(f.rows(table), []);
  assert.equal(f.events.filter(e => e === 'rollback').length, 1); assert.equal(f.events.includes('commit'), false);
});
const operations = [
  ['report findById', ({ reports }) => reports.findById('report-A')],
  ['report findByActivityAndPeriod', ({ reports }) => reports.findByActivityAndPeriod('activity-A', report().period)],
  ['report create', ({ reports }) => reports.create(newReport())],
  ['report update', ({ reports }) => reports.update('report-A', report().version, report())],
  ['audit findById', ({ audit }) => audit.findById('audit-A')],
  ['audit append', ({ audit }) => audit.append(event())],
  ['idempotency findByScope', ({ idempotency }) => idempotency.findByScope(scope())],
  ['idempotency reserve', ({ idempotency }) => idempotency.reserve(reservation())],
  ['idempotency complete', ({ idempotency }) => idempotency.complete('idem-A', report().version, { report: report(), auditEventId: 'audit-A' }, later)],
];
test('Report/Audit/Reservation: inputs are captured before asynchronous reads', async () => {
  for (const kind of ['report', 'audit', 'reservation']) {
    const input = kind === 'report' ? newReport() : kind === 'audit' ? event() : reservation();
    const f = setup({}, { fail: () => {
      input.id = 'mutated';
      if (kind === 'report') input.activityId = 'mutated';
      if (kind === 'audit') input.change.after.narrative = 'mutated';
      if (kind === 'reservation') input.scope.actorId = 'mutated';
      return false;
    } });
    await f.run(async ({ reports, audit, idempotency }) => {
      if (kind === 'report') assert.equal((await reports.create(input)).id, 'report-A');
      if (kind === 'audit') { await audit.append(input); assert.equal((await audit.findById('audit-A')).change.after.narrative, report().narrative); }
      if (kind === 'reservation') assert.equal((await idempotency.reserve(input)).scope.actorId, 'user-A');
    });
  }
});
test('Report update and idempotency completion do not retain mutable caller inputs', async () => {
  const changes = { ...report(), narrative: 'captured' };
  const f = setup({ Reports: [reportRow()] }, { fail: () => { changes.narrative = 'mutated'; return false; } });
  assert.equal((await f.run(({ reports }) => reports.update('report-A', report().version, changes))).narrative, 'captured');
  const outcome = { report: report(), auditEventId: 'audit-A' };
  const g = setup({ Reports: [reportRow()], AuditEvents: [auditRow()], IdempotencyRecords: [reservedRow()] }, {
    fail: () => { outcome.report.id = 'mutated'; outcome.auditEventId = 'mutated'; return false; },
  });
  const completed = await g.run(({ idempotency }) => idempotency.complete('idem-A', report().version, outcome, later));
  assert.equal(completed.outcome.report.id, 'report-A'); assert.equal(completed.outcome.auditEventId, 'audit-A');
});
for (const [name, invoke] of operations) {
  test(`${name}: closed session rejects without extra I/O`, async () => {
    const f = setup(); let retained; await f.run(async repos => { retained = repos; });
    const count = f.statements.length;
    await assert.rejects(invoke(retained), safe('SQL_SESSION_CLOSED')); assert.equal(f.statements.length, count);
  });
  test(`${name}: raw driver errors are sanitized, not reclassified by message/SQL number`, async () => {
    const f = setup({}, { fail: () => true });
    await assert.rejects(f.run(invoke), safe('SQL_QUERY_FAILED'));
    assert.deepEqual(f.events.slice(-2), ['rollback', 'close']);
  });
}
for (const [name, invoke, seed] of [
  ['Report INSERT', r => r.reports.create(newReport()), {}],
  ['Report UPDATE', r => r.reports.update('report-A', report().version, report()), { Reports: [reportRow()] }],
  ['Audit INSERT', r => r.audit.append(event()), {}],
  ['Idempotency INSERT', r => r.idempotency.reserve(reservation()), {}],
  ['Idempotency UPDATE', r => r.idempotency.complete('idem-A', report().version, { report: report(), auditEventId: 'audit-A' }, later),
    { Reports: [reportRow()], AuditEvents: [auditRow()], IdempotencyRecords: [reservedRow()] }],
]) {
  test(`${name}: write failure remains SQL_QUERY_FAILED rather than invented DUPLICATE/CONFLICT`, async () => {
    const f = setup(seed, { fail: s => /^(INSERT|UPDATE)/.test(s.text) });
    await assert.rejects(f.run(invoke), safe('SQL_QUERY_FAILED'));
  });
}
