import { SqlInfrastructureError } from './errors.js';
import type { SqlInfrastructureCode } from './errors.js';
import { prepareMssqlOdbcParameters, validateSqlStatement } from './parameters.js';
import type { SqlParameter, SqlStatement } from './parameters.js';
import type { SqlConnection, SqlRows, SqlTransaction, SqlTransport } from './session.js';

/** Narrow bridge to mssql; the local composition injects the lazy native loader.
 * No native import, environment connection string or HTTP composition here. */
interface Request {
  input(name: string, type: unknown, value: unknown): unknown;
  query(text: string): Promise<{ recordset?: SqlRows }>;
}
interface NativeTransaction {
  begin(isolation: number): Promise<unknown>;
  commit(): Promise<unknown>;
  rollback(): Promise<unknown>;
}
interface Pool {
  connect(): Promise<unknown>;
  close(): Promise<unknown>;
  on(event: 'error', listener: (error: unknown) => void): unknown;
}
export interface OdbcDriver {
  ConnectionPool: new (config: object) => Pool;
  Transaction: new (pool: Pool) => NativeTransaction;
  Request: new (owner: Pool | NativeTransaction) => Request;
  ISOLATION_LEVEL: { SERIALIZABLE: number };
  MAX: number;
  VarChar(length: number): unknown;
  NVarChar(length: number): unknown;
  UniqueIdentifier: unknown;
  DateTime2(scale: number): unknown;
  Bit: unknown;
  BigInt: unknown;
  Binary(length: number): unknown;
  VarBinary(length: number): unknown;
}
export type OdbcStage = 'LOAD' | 'CONNECT' | 'BEGIN' | 'QUERY' | 'COMMIT' | 'ROLLBACK' | 'CLOSE';
export interface OdbcTrace {
  readonly stage: OdbcStage;
  readonly durationMs: number;
  readonly result: 'ok' | 'failed';
  readonly category?: SqlInfrastructureCode;
  readonly technicalCode?: string | number;
  readonly connected: boolean;
  readonly transactionActive: boolean;
}
interface Options {
  readonly loadDriver: () => Promise<OdbcDriver>;
  readonly trace?: boolean;
  readonly onTrace?: (record: Readonly<OdbcTrace>) => void;
}

export function localOdbcConfig(): object {
  return {
    server: 'lpc:.\\PAIPOC', database: 'pai_poc_dev', driver: 'ODBC Driver 17 for SQL Server',
    connectionString: 'Driver={ODBC Driver 17 for SQL Server};Server=lpc:.\\PAIPOC;Database=pai_poc_dev;Trusted_Connection=Yes;Encrypt=Yes;TrustServerCertificate=Yes;APP=PAI-L8C2-Transport;',
    connectionTimeout: 10000, requestTimeout: 10000,
    options: { trustedConnection: true, encrypt: true, trustServerCertificate: true, useUTC: true },
    pool: { max: 1, min: 0, idleTimeoutMillis: 1000, acquireTimeoutMillis: 10000 },
  };
}
export function assertLocalSqlEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  if (process.platform !== 'win32' || process.arch !== 'x64' || !process.versions.node.startsWith('24.')
      || ['WEBSITE_INSTANCE_ID', 'WEBSITE_SITE_NAME', 'IDENTITY_ENDPOINT',
        'MSI_ENDPOINT', 'CONTAINER_APP_NAME', 'FUNCTIONS_WORKER_RUNTIME_VERSION'].some(key => Boolean(env[key]))
      || env.NODE_ENV === 'production') throw new SqlInfrastructureError('SQL_CONNECT_FAILED');
  const functionsContext = ['WEBSITE_HOSTNAME', 'PAI_POC_LOCAL_ONLY', 'AZURE_FUNCTIONS_ENVIRONMENT',
    'FUNCTIONS_WORKER_RUNTIME'].some(key => env[key] !== undefined);
  if (functionsContext) {
    const host = /^(localhost|127\.0\.0\.1|\[::1\])(?::([0-9]{1,5}))?$/i.exec(env.WEBSITE_HOSTNAME ?? '');
    const storageKeys = Object.keys(env).filter(key => key.toLowerCase().includes('azurewebjobsstorage'));
    if (!host || (host[2] !== undefined && (Number(host[2]) < 1 || Number(host[2]) > 65535))
        || env.PAI_POC_LOCAL_ONLY !== '1' || env.AZURE_FUNCTIONS_ENVIRONMENT !== 'Development'
        || env.FUNCTIONS_WORKER_RUNTIME !== 'node' || env.PAI_API_PERSISTENCE !== 'sql-local'
        || env.AzureWebJobsStorage !== 'UseDevelopmentStorage=true'
        || storageKeys.length !== 1 || storageKeys[0] !== 'AzureWebJobsStorage') {
      throw new SqlInfrastructureError('SQL_CONNECT_FAILED');
    }
  }
}
function safeCode(error: unknown): string | number | undefined {
  try {
    const item = error as { code?: unknown; number?: unknown; originalError?: { code?: unknown; number?: unknown } };
    const allowed: readonly unknown[] = ['ETIMEOUT', 'ETIMEDOUT', 'ECONNCLOSED', 'ENOTOPEN',
      'ELOGIN', 'ESOCKET', 'ECANCEL', 'EREQUEST', 'ENOTBEGUN', 'EABORT', 'EINPROG',
      'HYT00', 'HYT01', '08001', '08003', '28000', 'IM002', 258, 18456, 18452, 1205, 1222, -2];
    for (const code of [item?.code, item?.number, item?.originalError?.code, item?.originalError?.number]) {
      if (allowed.includes(code)) return code as string | number;
    }
    return undefined;
  } catch { return undefined; }
}
function bindingType(driver: OdbcDriver, parameter: SqlParameter): unknown {
  const length = 'length' in parameter ? parameter.length : undefined;
  const size = length === 'max' ? driver.MAX : length ?? 8;
  switch (parameter.type) {
    case 'varchar': return driver.VarChar(size);
    case 'nvarchar': return driver.NVarChar(size);
    case 'uniqueidentifier': return driver.UniqueIdentifier;
    case 'datetime2': return driver.DateTime2(parameter.scale!);
    case 'bit': return driver.Bit;
    case 'bigint': return driver.BigInt;
    case 'binary': return driver.Binary(size);
    case 'varbinary': return driver.VarBinary(size);
    default: throw new SqlInfrastructureError('SQL_CODEC_INVALID');
  }
}

/** Local technical transport, NOT a repository/UnitOfWork. One pool per lease.
 * Transactions have no retry, and commit is intentionally available only through
 * the existing port. The real integration test always chooses rollback. */
export class LocalOdbcTransport implements SqlTransport {
  #load: Options['loadDriver'];
  #trace: boolean;
  #sink?: Options['onTrace'];
  constructor(options: Options) {
    this.#load = options.loadDriver;
    this.#trace = options.trace === true;
    this.#sink = options.onTrace;
  }
  async connect(): Promise<SqlConnection> {
    assertLocalSqlEnvironment();
    let connected = false;
    let active = false;
    let closed = false;
    let started = false;
    let busy = false;
    let poisoned = false;
    let poolFault = false;
    const stage = async <T>(name: OdbcStage, category: SqlInfrastructureCode, work: () => Promise<T>): Promise<T> => {
      const start = performance.now();
      let failure: unknown;
      let failed = false;
      try { return await work(); }
      catch (error) { failure = error; failed = true; throw new SqlInfrastructureError(category); }
      finally {
        if (this.#trace) {
          const code = failed ? safeCode(failure) : undefined;
          const record: OdbcTrace = Object.freeze({ stage: name, durationMs: Math.max(0, performance.now() - start),
            result: failed ? 'failed' : 'ok', ...(failed ? { category } : {}),
            ...(code ? { technicalCode: code } : {}), connected, transactionActive: active });
          // Observers are non-authoritative and must not replace the I/O outcome.
          try { this.#sink?.(record); } catch { /* no logging of observer errors */ }
        }
      }
    };
    const driver = await stage('LOAD', 'SQL_CONNECT_FAILED', () => this.#load());
    let pool: Pool;
    try {
      pool = new driver.ConnectionPool(localOdbcConfig());
      pool.on('error', () => { poolFault = true; poisoned = true; });
    } catch { throw new SqlInfrastructureError('SQL_CONNECT_FAILED'); }
    try { await stage('CONNECT', 'SQL_CONNECT_FAILED', async () => { await pool.connect(); connected = true; }); }
    catch (primary) {
      try { await stage('CLOSE', 'SQL_CLOSE_FAILED', async () => { await pool.close(); connected = false; closed = true; }); } catch { /* preserve connect */ }
      throw primary;
    }
    const available = () => {
      if (closed || !connected) throw new SqlInfrastructureError('SQL_SESSION_CLOSED');
      if (busy) throw new SqlInfrastructureError('SQL_SESSION_BUSY');
    };
    return Object.freeze({
      begin: async (isolation: 'SERIALIZABLE'): Promise<SqlTransaction> => {
        available();
        if (started || isolation !== 'SERIALIZABLE' || poolFault) throw new SqlInfrastructureError('SQL_BEGIN_FAILED');
        started = true;
        busy = true;
        let transaction: NativeTransaction;
        try {
          transaction = await stage('BEGIN', 'SQL_BEGIN_FAILED', async () => {
            const tx = new driver.Transaction(pool);
            await tx.begin(driver.ISOLATION_LEVEL.SERIALIZABLE);
            active = true;
            return tx;
          });
        } finally { busy = false; }
        const finish = async (commit: boolean): Promise<void> => {
          available();
          if (!active || (commit && (poisoned || poolFault))) throw new SqlInfrastructureError('SQL_SESSION_CLOSED');
          busy = true;
          try {
            await stage(commit ? 'COMMIT' : 'ROLLBACK', commit ? 'SQL_COMMIT_OUTCOME_UNKNOWN' : 'SQL_ROLLBACK_FAILED', async () => {
              try { await (commit ? transaction.commit() : transaction.rollback()); }
              finally { active = false; }
            });
          } finally { busy = false; }
        };
        return Object.freeze({
          execute: async (input: SqlStatement): Promise<SqlRows> => {
            available();
            if (!active || poisoned || poolFault) throw new SqlInfrastructureError('SQL_SESSION_CLOSED');
            busy = true;
            try {
              return await stage('QUERY', 'SQL_QUERY_FAILED', async () => {
                const statement = validateSqlStatement(input);
                // Prepare the ENTIRE list before creating a request or binding anything.
                const parameters = prepareMssqlOdbcParameters(statement.parameters);
                const bindings = parameters.map(parameter => ({ parameter, type: bindingType(driver, parameter) }));
                const request = new driver.Request(transaction);
                for (const { parameter, type } of bindings) request.input(parameter.name, type, parameter.value);
                const result = await request.query(statement.text);
                if (!Array.isArray(result.recordset)) throw new SqlInfrastructureError('SQL_QUERY_FAILED');
                return structuredClone(result.recordset);
              });
            } catch (error) { poisoned = true; throw error; }
            finally { busy = false; }
          },
          commit: () => finish(true),
          rollback: () => finish(false),
        });
      },
      close: async (): Promise<void> => {
        if (closed) return;
        available();
        // Never close a pool with a borrowed transaction. Runner drains first.
        if (active) throw new SqlInfrastructureError('SQL_CLOSE_FAILED');
        busy = true;
        try {
          await stage('CLOSE', 'SQL_CLOSE_FAILED', async () => {
            await pool.close(); connected = false; closed = true;
          });
        } finally { busy = false; }
      },
    });
  }
}
