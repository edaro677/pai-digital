import test from 'node:test';
import assert from 'node:assert/strict';
import { SqlUnitOfWork } from '../.local-build/infrastructure/sql/unitOfWork.js';
import { SqlSessionRunner } from '../.local-build/infrastructure/sql/session.js';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { VersionConflictError } from '../.local-build/domain/errors.js';

const now = '2026-01-02T03:04:05.123Z', secret = 'EMPRESA\\usuario.prueba C:\\Privado\\usuario.prueba Password=ficticia';
const rv = n => Uint8Array.from([0, 0, 0, 0, 0, 0, 0, n]);
const input = () => ({ id: 'report-A', activityId: 'activity-A', period: '2026-Á😀',
  quantity: '-0.0000000000000000000000000000100', narrative: 'PoC á😀漢字', state: 'poc-draft',
  createdBy: 'user-A', createdAt: now, updatedBy: 'user-A', updatedAt: now });
const audit = report => ({ id: 'audit-A', actorId: 'user-A', occurredAt: now, correlationId: 'corr:1',
  change: { action: 'poc:report-created', before: null, after: report } });
const reservation = () => ({ id: 'idem-A', scope: { actorId: 'user-A', operation: 'poc:create-report', key: 'request:1' },
  requestFingerprint: 'a'.repeat(64), createdAt: now });
function safe(expected) { return error => {
  assert.equal(error.code, expected); assert.equal(error.stack, undefined);
  assert.equal(error.cause, undefined); assert.equal(error.originalError, undefined);
  assert.equal(JSON.stringify(error).includes(secret), false); return true;
}; }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

// Simulates SQL-shaped rows and transaction snapshots. It is not a SQL engine.
function setup(options = {}) {
  let committed = { InstitutionalUsers: [{ Id: 'user-A', TenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    DirectoryObjectId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', Alias: 'Usuario á😀', Enabled: true, RV: rv(1) }],
    Fichas: [{ Id: 'ficha-A', DependencyId: 'dep-A', CycleLabel: '2026-Á😀', RV: rv(1) }],
    Activities: [{ Id: 'activity-A', FichaId: 'ficha-A', Description: 'Actividad á😀', RV: rv(1) }],
    AccessAssignments: [{ Id: 'assignment-A', UserId: 'user-A', FichaId: 'ficha-A', Capability: 'poc:read',
      Enabled: false, ValidFrom: new Date(now), ValidUntil: null, RV: rv(1) }],
    Reports: [], AuditEvents: [], IdempotencyRecords: [], ...structuredClone(options.seed ?? {}) };
  let version = 10;
  const events = [], statements = [], owners = [], connections = [];
  const raw = () => Object.assign(new Error(secret), { originalError: { message: secret } });
  const transport = { async connect() {
    events.push('connect'); if (options.fail === 'connect') throw raw();
    let draft;
    const tx = {
      async execute(s) {
        events.push('query'); statements.push(structuredClone(s)); owners.push(tx);
        await options.beforeQuery?.(s);
        if (options.fail === 'query' || options.failQuery?.(s)) throw raw();
        const p = Object.fromEntries(s.parameters.map(x => [x.name, x.value]));
        const table = s.text.match(/(?:FROM|INTO|UPDATE) pai\.(\w+)/)?.[1];
        assert.ok(table && draft[table]);
        if (s.text.startsWith('SELECT')) return structuredClone(draft[table].filter(row => {
          if (s.text.includes('WHERE 1 = 0')) return false;
          if (p.id !== undefined) return row.Id === p.id;
          if (Object.hasOwn(p, 'id0')) return s.parameters.some(v => v.value === row.Id);
          if (table === 'InstitutionalUsers') return row.TenantId === p.tenantId && row.DirectoryObjectId === p.directoryObjectId;
          if (table === 'Activities') return row.FichaId === p.fichaId;
          if (table === 'AccessAssignments') return row.UserId === p.userId && row.FichaId === p.fichaId;
          if (table === 'Reports') return row.ActivityId === p.activityId && row.PeriodKey === p.period;
          if (table === 'IdempotencyRecords') return row.ActorId === p.actorId && row.Operation === p.operation && row.IdempotencyKey === p.key;
          return false;
        }));
        if (s.text.startsWith('INSERT')) {
          let row;
          if (table === 'Reports') row = { Id: p.id, ActivityId: p.activityId, PeriodKey: p.period, QuantityText: p.quantity,
            Narrative: p.narrative, State: p.state, CreatedBy: p.createdBy, CreatedAt: p.createdAt,
            UpdatedBy: p.updatedBy, UpdatedAt: p.updatedAt, RV: rv(++version) };
          if (table === 'AuditEvents') row = { Id: p.id, ActorId: p.actorId, OccurredAt: p.occurredAt,
            CorrelationId: p.correlationId, Action: p.action, BeforeJson: p.beforeJson, AfterJson: p.afterJson };
          if (table === 'IdempotencyRecords') row = { Id: p.id, ActorId: p.actorId, Operation: p.operation, IdempotencyKey: p.key,
            RequestFingerprint: p.fingerprint, CreatedAt: p.createdAt, State: 'poc:reserved', CompletedAt: null,
            OutcomeReportId: null, OutcomeAuditEventId: null, OutcomeReportJson: null, RV: rv(++version) };
          assert.ok(row); draft[table].push(row); return [structuredClone(row)];
        }
        assert.ok(s.text.startsWith('UPDATE'));
        const row = draft[table].find(r => r.Id === p.id);
        if (!row || options.zeroUpdate || Buffer.compare(Buffer.from(row.RV), Buffer.from(p.expectedVersion)) !== 0) return [];
        if (table === 'IdempotencyRecords') Object.assign(row, { State: 'poc:completed', CompletedAt: p.completedAt,
          OutcomeReportId: p.reportId, OutcomeAuditEventId: p.auditId, OutcomeReportJson: p.reportJson, RV: rv(++version) });
        if (table === 'Reports') Object.assign(row, { QuantityText: p.quantity, Narrative: p.narrative,
          State: p.state, UpdatedBy: p.updatedBy, UpdatedAt: p.updatedAt, RV: rv(++version) });
        if (table === 'InstitutionalUsers' || table === 'AccessAssignments') Object.assign(row, { Enabled: p.enabled, RV: rv(++version) });
        return [structuredClone(row)];
      },
      async commit() { events.push('commit'); if (options.fail === 'commit') throw raw(); committed = structuredClone(draft); },
      async rollback() { events.push('rollback'); if (options.fail === 'rollback') throw raw(); draft = undefined; },
    };
    const connection = {
      async begin(level) { events.push('begin'); assert.equal(level, 'SERIALIZABLE'); if (options.fail === 'begin') throw raw(); draft = structuredClone(committed); return tx; },
      async close() { events.push('close'); await options.closeGate; if (options.fail === 'close') throw raw(); },
    };
    connections.push(connection); return connection;
  } };
  return { uow: new SqlUnitOfWork(new SqlSessionRunner(transport)), events, statements, owners, connections,
    rows: table => structuredClone(committed[table]) };
}
async function bundle(tx) {
  const report = await tx.reports.create(input());
  await tx.audit.append(audit(report));
  const pending = await tx.idempotency.reserve(reservation());
  return tx.idempotency.complete(pending.id, pending.version, { report, auditEventId: 'audit-A' }, now);
}

test('UoW: seven frozen repository facades share one connection/session/transaction', async () => {
  const f = setup();
  await f.uow.runAtomic(async tx => {
    assert.deepEqual(Object.keys(tx).sort(), ['activities','assignments','audit','fichas','idempotency','reports','users']);
    assert.equal(Object.isFrozen(tx), true);
    for (const repo of Object.values(tx)) {
      assert.equal(Object.isFrozen(repo), true); assert.equal(repo.session, undefined);
      assert.equal(repo.finish, undefined); assert.equal(repo.commit, undefined); assert.equal(repo.rollback, undefined);
    }
    assert.equal((await tx.users.findById('user-A')).alias, 'Usuario á😀');
    assert.equal((await tx.assignments.listByUserAndFicha('user-A', 'ficha-A'))[0].enabled, false);
    assert.equal((await tx.fichas.findById('ficha-A')).dependencyId, 'dep-A');
    assert.equal((await tx.activities.listByFicha('ficha-A'))[0].id, 'activity-A');
    assert.equal(await tx.reports.findById('missing'), null);
    assert.equal(await tx.audit.findById('missing'), null);
    assert.equal(await tx.idempotency.findByScope(reservation().scope), null);
  });
  assert.equal(f.connections.length, 1); assert.equal(new Set(f.owners).size, 1);
  assert.equal(f.events.filter(x => x === 'begin').length, 1);
  assert.equal(f.events.filter(x => x === 'commit').length, 1);
  assert.equal(f.events.includes('rollback'), false); assert.equal(f.events.at(-1), 'close');
});
test('UoW A: Report + Audit + Idempotency commit together, preserving exact snapshots', async () => {
  const f = setup(); const result = await f.uow.runAtomic(bundle);
  assert.equal(f.rows('Reports').length, 1); assert.equal(f.rows('AuditEvents').length, 1);
  assert.equal(f.rows('IdempotencyRecords')[0].State, 'poc:completed');
  assert.equal(result.outcome.report.quantity, input().quantity);
  assert.equal(result.outcome.report.narrative, input().narrative);
  assert.equal(result.outcome.report.createdAt, now);
  assert.deepEqual(JSON.parse(f.rows('AuditEvents')[0].AfterJson), result.outcome.report);
  assert.deepEqual(JSON.parse(f.rows('IdempotencyRecords')[0].OutcomeReportJson), result.outcome.report);
  assert.equal(f.events.filter(x => x === 'commit').length, 1);
  assert.equal(f.events.at(-1), 'close');
});
for (const [label, failTable] of [['B audit', 'AuditEvents'], ['C idempotency', 'IdempotencyRecords']]) {
  test(`UoW ${label}: downstream failure rolls back all earlier writes`, async () => {
    const f = setup({ failQuery: s => s.text.startsWith(`INSERT INTO pai.${failTable}`) });
    await assert.rejects(f.uow.runAtomic(bundle), safe('SQL_QUERY_FAILED'));
    for (const table of ['Reports','AuditEvents','IdempotencyRecords']) assert.deepEqual(f.rows(table), []);
    assert.equal(f.events.includes('commit'), false);
    assert.equal(f.events.filter(x => x === 'rollback').length, 1); assert.equal(f.events.at(-1), 'close');
  });
}
test('UoW: callback failure after all three writes rolls everything back', async () => {
  const f = setup();
  await assert.rejects(f.uow.runAtomic(async tx => { await bundle(tx); throw new Error(secret); }), safe('SQL_WORK_FAILED'));
  for (const table of ['Reports','AuditEvents','IdempotencyRecords']) assert.deepEqual(f.rows(table), []);
  assert.equal(f.events.includes('commit'), false); assert.equal(f.events.at(-1), 'close');
});
test('UoW D: version conflict rolls back earlier report writes, preserving domain error', async () => {
  const f = setup();
  await assert.rejects(f.uow.runAtomic(async tx => {
    await tx.reports.create(input());
    await tx.users.setEnabled('user-A', 'valid-opaque-stale', false);
  }), safe('VERSION_CONFLICT'));
  assert.deepEqual(f.rows('Reports'), []); assert.equal(f.rows('InstitutionalUsers')[0].Enabled, true);
  assert.equal(f.events.includes('commit'), false);
});
test('UoW: caught repository domain error still prevents commit and cannot be mutated away', async () => {
  const f = setup();
  await assert.rejects(f.uow.runAtomic(async tx => {
    await tx.reports.create(input());
    try { await tx.reports.create(input()); } catch (error) { error.code = 'MODIFIED'; error.message = secret; }
    await assert.rejects(tx.audit.findById('anything'), safe('DUPLICATE'));
  }), safe('DUPLICATE'));
  assert.deepEqual(f.rows('Reports'), []); assert.equal(f.events.includes('commit'), false);
});
test('UoW: caught codec failure outside session.execute also prevents commit', async () => {
  const f = setup();
  await assert.rejects(f.uow.runAtomic(async tx => {
    await tx.reports.create(input());
    await assert.rejects(tx.activities.findById('bad id'), safe('SQL_CODEC_INVALID'));
  }), safe('SQL_CODEC_INVALID'));
  assert.deepEqual(f.rows('Reports'), []);
});
test('UoW: zero-row guarded update rolls back, without converting to infrastructure error', async () => {
  const f = setup({ zeroUpdate: true });
  await assert.rejects(f.uow.runAtomic(async tx => {
    const created = await tx.reports.create(input()); await tx.reports.update(created.id, created.version, created);
  }), safe('VERSION_CONFLICT'));
  assert.deepEqual(f.rows('Reports'), []);
});
for (const fail of ['connect','begin','query']) {
  const expected = { connect: 'SQL_CONNECT_FAILED', begin: 'SQL_BEGIN_FAILED', query: 'SQL_QUERY_FAILED' }[fail];
  test(`UoW E: ${fail} failure sanitized, no retry, cleanup attempted`, async () => {
    const f = setup({ fail });
    await assert.rejects(f.uow.runAtomic(tx => tx.users.findById('user-A')), safe(expected));
    assert.equal(f.events.filter(x => x === fail).length, 1);
    assert.equal(f.events.includes('commit'), false);
    if (fail !== 'connect') assert.equal(f.events.at(-1), 'close');
  });
}
test('UoW: commit ambiguity and close-after-commit preserve existing runner semantics', async () => {
  const f = setup({ fail: 'commit' });
  await assert.rejects(f.uow.runAtomic(async () => 'result'), error => {
    safe('SQL_COMMIT_OUTCOME_UNKNOWN')(error); assert.equal(error.transactionOutcome, 'unknown'); return true;
  });
  assert.deepEqual(f.events.slice(-3), ['commit','rollback','close']);
  const g = setup({ fail: 'close' });
  await assert.rejects(g.uow.runAtomic(bundle), error => {
    safe('SQL_CLOSE_FAILED')(error); assert.equal(error.transactionOutcome, 'committed'); return true;
  });
  assert.equal(g.rows('Reports').length, 1); assert.equal(g.events.includes('rollback'), false);
});
test('UoW: rollback failure never suppresses primary failure or close attempt', async () => {
  const f = setup({ fail: 'rollback' });
  await assert.rejects(f.uow.runAtomic(async () => { throw new VersionConflictError(); }), safe('VERSION_CONFLICT'));
  assert.deepEqual(f.events.slice(-2), ['rollback','close']); assert.equal(f.events.includes('commit'), false);
});
test('UoW F: all 19 port methods reject after closure before any I/O, including empty IDs', async () => {
  const f = setup(); let retained;
  await f.uow.runAtomic(async tx => { retained = tx; });
  const count = f.statements.length;
  const operations = [
    () => retained.users.findById('user-A'), () => retained.users.findByIdentity('unused','unused'),
    () => retained.users.setEnabled('user-A','unused',false),
    () => retained.assignments.findById('assignment-A'), () => retained.assignments.listByUserAndFicha('user-A','ficha-A'),
    () => retained.assignments.setEnabled('assignment-A','unused',false),
    () => retained.fichas.findById('ficha-A'), () => retained.fichas.findByIds([]),
    () => retained.activities.findById('activity-A'), () => retained.activities.listByFicha('ficha-A'),
    () => retained.reports.findById('report-A'), () => retained.reports.findByActivityAndPeriod('activity-A','2026'),
    () => retained.reports.create(input()), () => retained.reports.update('report-A','unused',input()),
    () => retained.audit.findById('audit-A'), () => retained.audit.append(audit(input())),
    () => retained.idempotency.findByScope(reservation().scope), () => retained.idempotency.reserve(reservation()),
    () => retained.idempotency.complete('idem-A','unused',{},now),
  ];
  for (const call of operations) await assert.rejects(call(), safe('INCOMPATIBLE_STATE'));
  assert.equal(f.statements.length, count); assert.equal(f.events.filter(x => x === 'connect').length, 1);
});
test('UoW: leaked context is closed after callback failure too', async () => {
  const f = setup(); let retained;
  await assert.rejects(f.uow.runAtomic(async tx => { retained = tx; throw new Error(secret); }), safe('SQL_WORK_FAILED'));
  await assert.rejects(retained.users.findById('user-A'), safe('INCOMPATIBLE_STATE'));
  assert.equal(f.statements.length, 0);
});
test('UoW: omitted await drains whole multi-query repository operation, then rolls back', async () => {
  const entered = deferred(), gate = deferred(); let first = true;
  const f = setup({ beforeQuery: async () => { if (first) { first = false; entered.resolve(); await gate.promise; } } });
  let pending;
  const run = f.uow.runAtomic(async tx => { pending = tx.reports.create(input()); });
  await entered.promise;
  assert.equal(f.events.includes('rollback'), false); assert.equal(f.events.includes('close'), false);
  gate.resolve();
  await assert.rejects(run, safe('SQL_SESSION_PENDING'));
  assert.ok((await pending).version.startsWith('rv1:'));
  assert.deepEqual(f.rows('Reports'), []); assert.equal(f.events.includes('commit'), false);
  assert.equal(f.events.at(-2), 'rollback'); assert.equal(f.events.at(-1), 'close');
});
test('UoW: returned repository promise is awaited and may commit normally', async () => {
  const f = setup(); const report = await f.uow.runAtomic(tx => tx.reports.create(input()));
  assert.equal(f.rows('Reports')[0].Id, report.id); assert.equal(f.events.filter(x => x === 'commit').length, 1);
});
test('UoW: callback error while work is pending waits before rollback/close', async () => {
  const entered = deferred(), gate = deferred(); let first = true;
  const f = setup({ beforeQuery: async () => { if (first) { first = false; entered.resolve(); await gate.promise; } } });
  const run = f.uow.runAtomic(async tx => { void tx.reports.create(input()); throw new Error(secret); });
  await entered.promise; assert.equal(f.events.includes('close'), false); gate.resolve();
  await assert.rejects(run, safe('SQL_WORK_FAILED'));
  assert.deepEqual(f.rows('Reports'), []); assert.equal(f.events.at(-1), 'close');
});
test('UoW: overlapping repository calls are rejected and caught rejection still poisons work', async () => {
  const entered = deferred(), gate = deferred(); let first = true;
  const f = setup({ beforeQuery: async () => { if (first) { first = false; entered.resolve(); await gate.promise; } } });
  const run = f.uow.runAtomic(async tx => {
    const pending = tx.users.findById('user-A'); await entered.promise;
    await assert.rejects(tx.fichas.findById('ficha-A'), safe('SQL_SESSION_BUSY'));
    gate.resolve(); await pending;
  });
  await assert.rejects(run, safe('SQL_SESSION_BUSY'));
  assert.equal(f.statements.length, 1); assert.equal(f.events.includes('commit'), false);
});
test('UoW: nested transaction attempt poisons outer transaction even when caught', async () => {
  const f = setup();
  await assert.rejects(f.uow.runAtomic(async tx => {
    await tx.reports.create(input());
    await assert.rejects(f.uow.runAtomic(async () => {}), safe('SQL_SESSION_NESTED'));
  }), safe('SQL_SESSION_NESTED'));
  assert.deepEqual(f.rows('Reports'), []); assert.equal(f.connections.length, 1);
  assert.equal(f.events.includes('commit'), false);
});
test('UoW: successful promise resolves only after resource close completes', async () => {
  const gate = deferred(), f = setup({ closeGate: gate.promise }); let resolved = false;
  const run = f.uow.runAtomic(async () => 42).then(result => { resolved = true; return result; });
  // Advance microtasks only; no timers, I/O or polling.
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert.equal(f.events.includes('close'), true); assert.equal(resolved, false);
  gate.resolve(); assert.equal(await run, 42);
});
test('UoW: fresh transaction works after previous failed context, without retrying it', async () => {
  const f = setup(); let old;
  await assert.rejects(f.uow.runAtomic(async tx => { old = tx; throw new Error(secret); }), safe('SQL_WORK_FAILED'));
  assert.equal(await f.uow.runAtomic(async tx => (await tx.users.findById('user-A')).enabled), true);
  await assert.rejects(old.users.findById('user-A'), safe('INCOMPATIBLE_STATE'));
  assert.equal(f.connections.length, 2);
});
test('UoW: simple port behavior and expired contexts match memory adapter', async () => {
  for (const uow of [setup().uow, new MemoryUnitOfWork()]) {
    let retained;
    const result = await uow.runAtomic(async tx => {
      retained = tx; return { activity: await tx.activities.findById('missing'), fichas: await tx.fichas.findByIds([]) };
    });
    assert.deepEqual(result, { activity: null, fichas: [] });
    await assert.rejects(retained.fichas.findByIds([]), e => e.code === 'INCOMPATIBLE_STATE');
  }
});
