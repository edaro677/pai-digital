import type { UserRepository } from '../../../application/ports/repositories.js';
import type { InstitutionalUser } from '../../../domain/entities.js';
import type { DirectoryObjectId, TenantId, UserId, Version } from '../../../domain/types.js';
import { bit, guid, identifier, rowversion, unicodeText } from '../codecs.js';
import type { SqlSession } from '../session.js';
import { conflict, expectedBytes, mapped, notFound, queryRows, single } from './shared.js';

const select = 'SELECT Id, TenantId, DirectoryObjectId, Alias, Enabled, RV FROM pai.InstitutionalUsers';
const update = 'UPDATE pai.InstitutionalUsers SET Enabled = @enabled OUTPUT INSERTED.Id, INSERTED.TenantId, INSERTED.DirectoryObjectId, INSERTED.Alias, INSERTED.Enabled, INSERTED.RV WHERE Id = @id AND RV = @expectedVersion;';
function decode(row: Readonly<Record<string, unknown>>): InstitutionalUser {
  return mapped(() => ({ id: identifier('user').decode(row.Id), tenantId: guid('tenant').decode(row.TenantId),
    directoryObjectId: guid('directory-object').decode(row.DirectoryObjectId), alias: unicodeText.decode(row.Alias),
    enabled: bit.decode(row.Enabled), version: rowversion.decode(row.RV) }));
}
export class SqlUserRepository implements UserRepository {
  constructor(private readonly session: SqlSession) {}

  async findById(id: UserId): Promise<InstitutionalUser | null> {
    return single(await queryRows(this.session, { text: `${select} WHERE Id = @id;`, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('user').encode(id) },
    ] }), decode);
  }

  async findByIdentity(tenantId: TenantId, directoryObjectId: DirectoryObjectId): Promise<InstitutionalUser | null> {
    return single(await queryRows(this.session, {
      text: `${select} WHERE TenantId = @tenantId AND DirectoryObjectId = @directoryObjectId;`, parameters: [
        { name: 'tenantId', type: 'uniqueidentifier', value: guid('tenant').encode(tenantId) },
        { name: 'directoryObjectId', type: 'uniqueidentifier', value: guid('directory-object').encode(directoryObjectId) },
      ],
    }), decode);
  }

  async setEnabled(id: UserId, expectedVersion: Version, enabled: boolean): Promise<InstitutionalUser> {
    const current = await this.findById(id);
    if (!current) return notFound();
    const expected = expectedBytes(current.version, expectedVersion);
    const result = single(await queryRows(this.session, { text: update, parameters: [
      { name: 'id', type: 'varchar', length: 64, value: identifier('user').encode(id) },
      { name: 'expectedVersion', type: 'binary', length: 8, value: expected },
      { name: 'enabled', type: 'bit', value: bit.encode(enabled) },
    ] }), decode);
    if (!result) return conflict();
    return result;
  }
}
