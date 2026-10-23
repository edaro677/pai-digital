import { AsyncLocalStorage } from 'node:async_hooks';
import { SqlInfrastructureError, sanitizeWorkError } from './errors.js';
import type { SqlInfrastructureCode, SqlSessionFailure } from './errors.js';

import { validateSqlStatement } from './parameters.js';
import type { SqlStatement } from './parameters.js';
export type { SqlStatement, SqlParameter } from './parameters.js';

export type SqlRows = readonly Readonly<Record<string, unknown>>[];

/** Puerto interno. El transporte futuro debe limitar sus tiempos de I/O y cerrar
 * incluso una conexion no reutilizable. No se importa mssql ni una configuracion. */
export interface SqlTransaction {
  execute(statement: SqlStatement): Promise<SqlRows>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}
export interface SqlConnection {
  begin(isolation: 'SERIALIZABLE'): Promise<SqlTransaction>;
  close(): Promise<void>;
}
export interface SqlTransport { connect(): Promise<SqlConnection> }

interface Scope { failure?: SqlInfrastructureError }
const execution = new AsyncLocalStorage<Scope>();
function failure(code: SqlInfrastructureCode): SqlInfrastructureError { return new SqlInfrastructureError(code); }

/** Solo consultas ligadas a UNA transaccion; no expone commit ni el controlador. */
export interface SqlSession { execute(statement: SqlStatement): Promise<SqlRows> }

class TransactionSession implements SqlSession {
  #accepting = true;
  #busy = false;
  #pending = new Set<Promise<unknown>>();

  #transaction: SqlTransaction;
  #scope: Scope;
  constructor(transaction: SqlTransaction, scope: Scope) {
    this.#transaction = transaction;
    this.#scope = scope;
  }

  execute(statement: SqlStatement): Promise<SqlRows> {
    let promise: Promise<SqlRows>;
    if (!this.#accepting || this.#scope.failure || this.#busy) {
      const error = failure(!this.#accepting ? 'SQL_SESSION_CLOSED'
        : this.#scope.failure ? this.#scope.failure.code : 'SQL_SESSION_BUSY');
      if (this.#accepting) this.#scope.failure ??= failure(error.code);
      promise = Promise.reject(error);
    } else {
      this.#busy = true;
      promise = (async () => {
        try {
          // No retener objetos mutables del llamador o del transporte.
          return structuredClone(await this.#transaction.execute(validateSqlStatement(structuredClone(statement))));
        } catch {
          const error = failure('SQL_QUERY_FAILED');
          this.#scope.failure ??= failure('SQL_QUERY_FAILED');
          throw error;
        } finally { this.#busy = false; }
      })();
    }
    if (this.#accepting) {
      this.#pending.add(promise);
      void promise.finally(() => this.#pending.delete(promise)).catch(() => undefined);
    }
    // Un rechazo no esperado por el callback aun impide confirmar la transaccion.
    void promise.catch(() => undefined);
    return promise;
  }

  async finish(): Promise<void> {
    this.#accepting = false;
    if (this.#pending.size) this.#scope.failure ??= failure('SQL_SESSION_PENDING');
    // Drenar antes de rollback/close: nunca liberar una conexion con I/O en vuelo.
    await Promise.allSettled([...this.#pending]);
  }
}

/** Infraestructura, NO implementa UnitOfWork ni construye repositorios. La forma
 * de finalizacion siempre es explicita; los commits solo se prueban con dobles. */
export class SqlSessionRunner {
  constructor(private readonly transport: SqlTransport) {}

  async run<Result>(completion: 'commit' | 'rollback', work: (session: SqlSession) => Promise<Result>): Promise<Result> {
    const parent = execution.getStore();
    if (parent) {
      const error = failure('SQL_SESSION_NESTED');
      parent.failure ??= failure('SQL_SESSION_NESTED');
      throw error;
    }
    return execution.run({}, async () => {
      const scope = execution.getStore()!;
      let connection: SqlConnection | undefined;
      let transaction: SqlTransaction | undefined;
      let session: TransactionSession | undefined;
      let result!: Result;
      let primary: SqlSessionFailure | undefined;
      let commitAttempted = false;
      let committed = false;
      const attempt = async <Value>(code: SqlInfrastructureCode, operation: () => Promise<Value>): Promise<Value> => {
        try { return await operation(); } catch { throw failure(code); }
      };
      try {
        if (completion !== 'commit' && completion !== 'rollback') throw failure('SQL_WORK_FAILED');
        connection = await attempt('SQL_CONNECT_FAILED', () => this.transport.connect());
        transaction = await attempt('SQL_BEGIN_FAILED', () => connection!.begin('SERIALIZABLE'));
        session = new TransactionSession(transaction, scope);
        // Fachada real de runtime: no entregar el objeto que controla finish,
        // la transaccion o el estado que impide confirmar despues de un fallo.
        const context: SqlSession = Object.freeze({ execute: (statement: SqlStatement) => session!.execute(statement) });
        try { result = await work(context); }
        catch (error) { primary = scope.failure ?? sanitizeWorkError(error); }
      } catch (error) {
        primary = sanitizeWorkError(error);
      } finally {
        if (session) await session.finish();
        primary ??= scope.failure;
        if (transaction) {
          if (!primary && completion === 'commit') {
            commitAttempted = true;
            try { await attempt('SQL_COMMIT_OUTCOME_UNKNOWN', () => transaction!.commit()); committed = true; }
            catch (error) { primary = error as SqlInfrastructureError; }
          }
          if (!committed) {
            try { await attempt('SQL_ROLLBACK_FAILED', () => transaction!.rollback()); }
            catch (error) { primary ??= error as SqlInfrastructureError; }
          }
        }
        if (connection) {
          try { await attempt('SQL_CLOSE_FAILED', () => connection!.close()); }
          catch (error) { primary ??= error as SqlInfrastructureError; }
        }
      }
      if (primary) {
        const safe = sanitizeWorkError(primary);
        if (commitAttempted && safe instanceof SqlInfrastructureError) {
          throw new SqlInfrastructureError(safe.code, committed ? 'committed' : 'unknown');
        }
        throw safe;
      }
      return result;
    });
  }
}
