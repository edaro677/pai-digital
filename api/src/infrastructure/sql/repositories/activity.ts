import type { ActivityRepository } from '../../../application/ports/repositories.js';
import type { Activity } from '../../../domain/entities.js';
import type { ActivityId, FichaId } from '../../../domain/types.js';
import { identifier, rowversion, unicodeText } from '../codecs.js';
import { SqlInfrastructureError, sanitizeWorkError } from '../errors.js';
import type { SqlRows, SqlSession, SqlStatement } from '../session.js';

const byId = 'SELECT Id, FichaId, Description, RV FROM pai.Activities WHERE Id = @id;';
const byFicha = 'SELECT Id, FichaId, Description, RV FROM pai.Activities WHERE FichaId = @fichaId ORDER BY InsertionOrder ASC;';

function decode(row: Readonly<Record<string, unknown>>): Activity {
  try {
    return {
      id: identifier('activity').decode(row.Id),
      fichaId: identifier('ficha').decode(row.FichaId),
      description: unicodeText.decode(row.Description),
      version: rowversion.decode(row.RV),
    };
  } catch { throw new SqlInfrastructureError('SQL_CODEC_INVALID'); }
}

/** Read-only adapter bound to the caller's transaction and session lifetime. */
export class SqlActivityRepository implements ActivityRepository {
  constructor(private readonly session: SqlSession) {}

  private async read(statement: SqlStatement): Promise<SqlRows> {
    try {
      const rows = await this.session.execute(statement);
      if (!Array.isArray(rows)) throw new SqlInfrastructureError('SQL_QUERY_FAILED');
      return rows;
    } catch (error) {
      if (error instanceof SqlInfrastructureError) throw sanitizeWorkError(error);
      throw new SqlInfrastructureError('SQL_QUERY_FAILED');
    }
  }

  async findById(id: ActivityId): Promise<Activity | null> {
    const rows = await this.read({ text: byId, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('activity').encode(id) },
    ] });
    if (rows.length > 1) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
    return rows.length === 0 ? null : decode(rows[0]);
  }

  async listByFicha(fichaId: FichaId): Promise<readonly Activity[]> {
    const rows = await this.read({ text: byFicha, parameters: [
      { name: 'fichaId', type: 'varchar', length: 64, value: identifier('ficha').encode(fichaId) },
    ] });
    return rows.map(decode);
  }
}
