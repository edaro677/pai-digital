import type { AssignmentRepository } from '../../../application/ports/repositories.js';
import type { AccessAssignment } from '../../../domain/entities.js';
import type { AssignmentId, FichaId, UserId, Version } from '../../../domain/types.js';
import { bit, capability, identifier, instant, nullable, rowversion } from '../codecs.js';
import type { SqlSession } from '../session.js';
import { conflict, expectedBytes, mapped, notFound, queryRows, single } from './shared.js';

const select = 'SELECT Id, UserId, FichaId, Capability, Enabled, ValidFrom, ValidUntil, RV FROM pai.AccessAssignments';
const update = 'UPDATE pai.AccessAssignments SET Enabled = @enabled OUTPUT INSERTED.Id, INSERTED.UserId, INSERTED.FichaId, INSERTED.Capability, INSERTED.Enabled, INSERTED.ValidFrom, INSERTED.ValidUntil, INSERTED.RV WHERE Id = @id AND RV = @expectedVersion;';
function decode(row: Readonly<Record<string, unknown>>): AccessAssignment {
  return mapped(() => ({ id: identifier('assignment').decode(row.Id), userId: identifier('user').decode(row.UserId),
    fichaId: identifier('ficha').decode(row.FichaId), capability: capability.decode(row.Capability),
    enabled: bit.decode(row.Enabled), validFrom: instant.decode(row.ValidFrom),
    validUntil: nullable(instant).decode(row.ValidUntil), version: rowversion.decode(row.RV) }));
}
export class SqlAssignmentRepository implements AssignmentRepository {
  constructor(private readonly session: SqlSession) {}

  async listByUser(userId: UserId): Promise<readonly AccessAssignment[]> {
    return (await queryRows(this.session, {
      text: `${select} WHERE UserId = @userId ORDER BY InsertionOrder ASC;`,
      parameters: [{ name: 'userId', type: 'varchar', length: 64, value: identifier('user').encode(userId) }],
    })).map(decode);
  }

  async findById(id: AssignmentId): Promise<AccessAssignment | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE Id = @id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('assignment').encode(id) },
    ] }), decode);
  }

  async listByUserAndFicha(userId: UserId, fichaId: FichaId): Promise<readonly AccessAssignment[]> {
    const rows = await queryRows(this.session, {
      text: `${select} WHERE UserId = @userId AND FichaId = @fichaId ORDER BY InsertionOrder ASC;`, parameters: [
        { name: 'userId', type: 'varchar', length: 64, value: identifier('user').encode(userId) },
        { name: 'fichaId', type: 'varchar', length: 64, value: identifier('ficha').encode(fichaId) },
      ],
    });
    return rows.map(decode);
  }

  async setEnabled(id: AssignmentId, expectedVersion: Version, enabled: boolean): Promise<AccessAssignment> {
    const current = await this.findById(id);
    if (!current) return notFound();
    const expected = expectedBytes(current.version, expectedVersion);
    const result = single(await queryRows(this.session, { text: update, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('assignment').encode(id) },
      { name: 'expectedVersion', type: 'binary', length: 8, value: expected },
      { name: 'enabled', type: 'bit', value: bit.encode(enabled) },
    ] }), decode);
    if (!result) return conflict();
    return result;
  }
}
