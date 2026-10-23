import { DuplicateError, IncompatibleStateError, NotFoundError, VersionConflictError } from '../../../domain/errors.js';
import { version } from '../../../domain/types.js';
import type { Version } from '../../../domain/types.js';
import { rowversion } from '../codecs.js';
import { SqlInfrastructureError, sanitizeWorkError } from '../errors.js';
import type { SqlRows, SqlSession, SqlStatement } from '../session.js';

export async function queryRows(session: SqlSession, statement: SqlStatement): Promise<SqlRows> {
  try {
    const rows = await session.execute(statement);
    if (!Array.isArray(rows)) throw new SqlInfrastructureError('SQL_QUERY_FAILED');
    return rows;
  } catch (error) {
    if (error instanceof SqlInfrastructureError) throw sanitizeWorkError(error);
    throw new SqlInfrastructureError('SQL_QUERY_FAILED');
  }
}
export function mapped<Value>(work: () => Value): Value {
  try { return work(); } catch { throw new SqlInfrastructureError('SQL_CODEC_INVALID'); }
}
export function single<Value>(rows: SqlRows, decode: (row: SqlRows[number]) => Value): Value | null {
  if (rows.length > 1) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
  return rows.length ? decode(rows[0]) : null;
}
export function notFound(): never { throw sanitizeWorkError(new NotFoundError()); }
export function conflict(): never { throw sanitizeWorkError(new VersionConflictError()); }
export function duplicate(): never { throw sanitizeWorkError(new DuplicateError()); }
export function incompatible(): never { throw sanitizeWorkError(new IncompatibleStateError()); }
/** Constant table selection only; checks references without rebuilding historical results. */
export async function requireReference(session: SqlSession, table: 'InstitutionalUsers' | 'Activities' | 'Reports', id: string): Promise<void> {
  const rows = await queryRows(session, { text: `SELECT Id FROM pai.${table} WHERE Id = @id;`,
    parameters: [{ name: 'id', type: 'varchar', length: 64, value: id }] });
  if (!rows.length) return notFound();
  if (rows.length !== 1 || rows[0].Id !== id) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
}
export function expectedBytes(actual: Version, expected: Version): Uint8Array {
  let checked: Version;
  try { checked = version(expected); } catch (error) { throw sanitizeWorkError(error); }
  // A valid opaque L2 token need not be an SQL rv1 token. Compare BEFORE encoding.
  if (actual !== checked) return conflict();
  return rowversion.encode(actual);
}
