import { createRequire } from 'node:module';
import type { UnitOfWork } from '../application/ports/unitOfWork.js';
import { LocalOdbcTransport } from '../infrastructure/sql/odbc.js';
import type { OdbcDriver } from '../infrastructure/sql/odbc.js';
import { SqlSessionRunner } from '../infrastructure/sql/session.js';
import type { SqlTransport } from '../infrastructure/sql/session.js';
import { SqlUnitOfWork } from '../infrastructure/sql/unitOfWork.js';

// Creating this loader does not load mssql or its native driver.
const loadNative = createRequire(import.meta.url);

/** Trusted composition only. Construction never opens a connection.
 * Tests supply a transport double; production transport keeps all local guards. */
export function createLocalSqlUnitOfWork(transport?: SqlTransport): UnitOfWork {
  const selected = transport ?? new LocalOdbcTransport({
    loadDriver: async () => loadNative('mssql/msnodesqlv8.js') as OdbcDriver,
  });
  return new SqlUnitOfWork(new SqlSessionRunner(selected));
}
