import type { TransactionContext, UnitOfWork } from '../../application/ports/unitOfWork.js';
import { IncompatibleStateError } from '../../domain/errors.js';
import { SqlInfrastructureError, sanitizeWorkError } from './errors.js';
import type { SqlSessionFailure } from './errors.js';
import { SqlSessionRunner } from './session.js';
import type { SqlSession } from './session.js';
import { SqlUserRepository } from './repositories/user.js';
import { SqlAssignmentRepository } from './repositories/assignment.js';
import { SqlFichaRepository } from './repositories/ficha.js';
import { SqlActivityRepository } from './repositories/activity.js';
import { SqlReportRepository } from './repositories/report.js';
import { SqlAuditRepository } from './repositories/audit.js';
import { SqlIdempotencyRepository } from './repositories/idempotency.js';

/** Tracks WHOLE repository calls, including validation/mapping outside execute(). */
class RepositoryScope {
  #active = true;
  #busy = false;
  #failure?: SqlSessionFailure;
  #pending = new Set<Promise<unknown>>();

  invoke<Value>(work: () => Promise<Value>): Promise<Value> {
    let promise: Promise<Value>;
    if (!this.#active || this.#failure || this.#busy) {
      const error = !this.#active ? sanitizeWorkError(new IncompatibleStateError())
        : this.#failure ? sanitizeWorkError(this.#failure) : new SqlInfrastructureError('SQL_SESSION_BUSY');
      if (this.#active) this.#failure ??= sanitizeWorkError(error);
      promise = Promise.reject(error);
    } else {
      this.#busy = true;
      promise = (async () => {
        try { return await work(); }
        catch (error) {
          const safe = sanitizeWorkError(error);
          // Store a separate sanitized instance: callers cannot mutate the latch.
          this.#failure ??= sanitizeWorkError(safe);
          throw safe;
        } finally { this.#busy = false; }
      })();
    }
    if (this.#active) {
      this.#pending.add(promise);
      void promise.finally(() => this.#pending.delete(promise)).catch(() => undefined);
    }
    void promise.catch(() => undefined);
    return promise;
  }

  async finish(): Promise<SqlSessionFailure | undefined> {
    this.#active = false;
    const hadPending = this.#pending.size > 0;
    // Started multi-query repository calls finish before runner rollback/close.
    await Promise.allSettled([...this.#pending]);
    return this.#failure ?? (hadPending ? new SqlInfrastructureError('SQL_SESSION_PENDING') : undefined);
  }
}

function context(session: SqlSession, scope: RepositoryScope): TransactionContext {
  const users = new SqlUserRepository(session), assignments = new SqlAssignmentRepository(session);
  const fichas = new SqlFichaRepository(session), activities = new SqlActivityRepository(session);
  const reports = new SqlReportRepository(session), audit = new SqlAuditRepository(session);
  const idempotency = new SqlIdempotencyRepository(session);
  // Only the port methods escape. No session, raw repository or lifecycle controls.
  return Object.freeze({
    users: Object.freeze({
      findById: (id) => scope.invoke(() => users.findById(id)),
      findByIdentity: (tenant, object) => scope.invoke(() => users.findByIdentity(tenant, object)),
      setEnabled: (id, expected, enabled) => scope.invoke(() => users.setEnabled(id, expected, enabled)),
    } satisfies TransactionContext['users']),
    assignments: Object.freeze({
      findById: (id) => scope.invoke(() => assignments.findById(id)),
      listByUserAndFicha: (user, ficha) => scope.invoke(() => assignments.listByUserAndFicha(user, ficha)),
      setEnabled: (id, expected, enabled) => scope.invoke(() => assignments.setEnabled(id, expected, enabled)),
    } satisfies TransactionContext['assignments']),
    fichas: Object.freeze({
      findById: (id) => scope.invoke(() => fichas.findById(id)),
      findByIds: (ids) => scope.invoke(() => fichas.findByIds(ids)),
    } satisfies TransactionContext['fichas']),
    activities: Object.freeze({
      findById: (id) => scope.invoke(() => activities.findById(id)),
      listByFicha: (id) => scope.invoke(() => activities.listByFicha(id)),
    } satisfies TransactionContext['activities']),
    reports: Object.freeze({
      findById: (id) => scope.invoke(() => reports.findById(id)),
      findByActivityAndPeriod: (id, period) => scope.invoke(() => reports.findByActivityAndPeriod(id, period)),
      create: (input) => scope.invoke(() => reports.create(input)),
      update: (id, expected, changes) => scope.invoke(() => reports.update(id, expected, changes)),
    } satisfies TransactionContext['reports']),
    audit: Object.freeze({
      findById: (id) => scope.invoke(() => audit.findById(id)),
      append: (event) => scope.invoke(() => audit.append(event)),
    } satisfies TransactionContext['audit']),
    idempotency: Object.freeze({
      findByScope: (input) => scope.invoke(() => idempotency.findByScope(input)),
      reserve: (input) => scope.invoke(() => idempotency.reserve(input)),
      complete: (id, expected, outcome, at) => scope.invoke(() => idempotency.complete(id, expected, outcome, at)),
    } satisfies TransactionContext['idempotency']),
  });
}

/** Implements the existing port; connection/transaction ownership stays in runner. */
export class SqlUnitOfWork implements UnitOfWork {
  constructor(private readonly runner: SqlSessionRunner) {}

  runAtomic<Result>(work: (context: TransactionContext) => Promise<Result>): Promise<Result> {
    return this.runner.run('commit', async session => {
      const scope = new RepositoryScope();
      let result!: Result, primary: SqlSessionFailure | undefined;
      try { result = await work(context(session, scope)); }
      catch (error) { primary = sanitizeWorkError(error); }
      finally {
        const repositoryFailure = await scope.finish();
        primary ??= repositoryFailure;
      }
      if (primary) throw primary;
      return result;
    });
  }
}
