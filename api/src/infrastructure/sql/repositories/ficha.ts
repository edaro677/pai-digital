import type { FichaRepository } from '../../../application/ports/repositories.js';
import type { Ficha } from '../../../domain/entities.js';
import type { FichaId } from '../../../domain/types.js';
import { identifier, rowversion, unicodeText } from '../codecs.js';
import { SqlInfrastructureError } from '../errors.js';
import type { SqlSession } from '../session.js';
import { mapped, queryRows, single } from './shared.js';

const select = 'SELECT Id, DependencyId, CycleLabel, RV FROM pai.Fichas';
function decode(row: Readonly<Record<string, unknown>>): Ficha {
  return mapped(() => ({ id: identifier('ficha').decode(row.Id),
    dependencyId: identifier('dependency').decode(row.DependencyId),
    cycleLabel: unicodeText.decode(row.CycleLabel), version: rowversion.decode(row.RV) }));
}
export class SqlFichaRepository implements FichaRepository {
  constructor(private readonly session: SqlSession) {}

  async findById(id: FichaId): Promise<Ficha | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE Id = @id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('ficha').encode(id) },
    ] }), decode);
  }

  async findByIds(ids: readonly FichaId[]): Promise<readonly Ficha[]> {
    const unique = [...new Set(ids.map(id => identifier('ficha').encode(id)))];
    if (!unique.length) {
      // Exercise session lifetime even for an empty input (no cached bypass).
      const rows = await queryRows(this.session, { text: `${select} WHERE 1 = 0;`, parameters: [] });
      if (rows.length) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
      return [];
    }
    const found = new Map<string, Ficha>();
    // Batches bound the parameter count; they do not restrict the L2 input length.
    for (let start = 0; start < unique.length; start += 500) {
      const batch = unique.slice(start, start + 500);
      const parameters = batch.map((value, index) => ({ name: `id${index}`, type: 'varchar' as const, length: 64, value }));
      const rows = await queryRows(this.session, {
        text: `${select} WHERE Id IN (${parameters.map(p => `@${p.name}`).join(', ')});`, parameters,
      });
      for (const row of rows) {
        const value = decode(row);
        if (!batch.includes(value.id) || found.has(value.id)) throw new SqlInfrastructureError('SQL_CODEC_INVALID');
        found.set(value.id, value);
      }
    }
    return unique.flatMap(id => { const value = found.get(id); return value ? [value] : []; });
  }
}
