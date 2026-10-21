import type { AccessAssignment, InstitutionalUser, Report } from '../../domain/entities.js';
import type { IdentifierKind, Version } from '../../domain/types.js';
import { correlationId, decimalText, entityId, idempotencyKey, periodKey,
  requestFingerprint, utcInstant, version } from '../../domain/types.js';
import { SqlInfrastructureError } from './errors.js';

export interface SqlCodec<Domain, Sql> {
  decode(value: unknown): Domain;
  encode(value: Domain): Sql;
}

function invalid(): never { throw new SqlInfrastructureError('SQL_CODEC_INVALID'); }
function guarded<Value>(operation: () => Value): Value {
  try { return operation(); } catch { return invalid(); }
}
function text(value: unknown): string {
  if (typeof value !== 'string') return invalid();
  return value;
}
function textual<Value extends string>(parse: (value: string) => Value): SqlCodec<Value, string> {
  return {
    decode: value => guarded(() => parse(text(value))),
    encode: value => guarded(() => parse(text(value))),
  };
}

export const unicodeText = textual(text);
export function identifier<Kind extends IdentifierKind>(kind: Kind) {
  return textual(value => entityId(kind, value));
}
// uniqueidentifier no conserva mayusculas. Solo esta lectura de tipo GUID SQL
// acepta el caso del proveedor; la escritura exige la forma canonica del dominio.
export function guid<Kind extends 'tenant' | 'directory-object'>(kind: Kind) {
  const strict = identifier(kind);
  return { encode: strict.encode,
    decode: (value: unknown) => guarded(() => strict.decode(text(value).toLowerCase())) };
}
export const period = textual(periodKey);
export const correlation = textual(correlationId);
export const idempotency = textual(idempotencyKey);
export const fingerprint = textual(requestFingerprint);
export const decimal = textual(decimalText);
export const historicalVersion = textual(version);

export const bit: SqlCodec<boolean, boolean> = {
  decode(value) { if (typeof value !== 'boolean') return invalid(); return value; },
  encode(value) { if (typeof value !== 'boolean') return invalid(); return value; },
};

/** undefined es ausencia de columna, nunca SQL NULL. */
export function nullable<Domain, Sql>(codec: SqlCodec<Domain, Sql>): SqlCodec<Domain | null, Sql | null> {
  return {
    decode: value => value === null ? null : codec.decode(value),
    encode: value => value === null ? null : codec.encode(value),
  };
}

export const instant: SqlCodec<ReturnType<typeof utcInstant>, Date> = {
  decode: value => guarded(() => {
    if (!(value instanceof Date) || !Number.isFinite(Date.prototype.getTime.call(value))) return invalid();
    return utcInstant(Date.prototype.toISOString.call(value));
  }),
  encode: value => guarded(() => new Date(utcInstant(text(value)))),
};

function enumeration<const Values extends readonly string[]>(values: Values): SqlCodec<Values[number], string> {
  return textual(value => {
    if (!values.includes(value)) return invalid();
    return value as Values[number];
  });
}
export const capability = enumeration(['poc:read', 'poc:edit-report'] as const);
export const reportState = enumeration(['poc-draft', 'poc-blocked'] as const);
export const operation = enumeration(['poc:create-report', 'poc:update-report'] as const);
export const idempotencyState = enumeration(['poc:reserved', 'poc:completed'] as const);
export const auditAction = enumeration(['poc:report-created', 'poc:report-updated',
  'poc:user-enabled-changed', 'poc:assignment-enabled-changed'] as const);

/** Bytes en su orden original: no BigInt, base decimal, inversion o contador JS. */
export const rowversion: SqlCodec<Version, Uint8Array> = {
  decode: value => guarded(() => {
    if (!(value instanceof Uint8Array)) return invalid();
    const bytes = Array.from(Uint8Array.prototype.values.call(value));
    if (bytes.length !== 8) return invalid();
    return version(`rv1:${bytes.map(byte => byte.toString(16).padStart(2, '0')).join('')}`);
  }),
  encode: value => guarded(() => {
    const checked = version(text(value));
    if (!/^rv1:[0-9a-f]{16}$/.test(checked)) return invalid();
    return Uint8Array.from(checked.slice(4).match(/../g)!, pair => parseInt(pair, 16));
  }),
};

/** bigint fisico para InsertionOrder; nunca se convierte a number. */
export const insertionOrder: SqlCodec<bigint, string> = {
  decode: value => guarded(() => {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) return invalid();
    const parsed = BigInt(value);
    if (parsed > 9223372036854775807n) return invalid();
    return parsed;
  }),
  encode: value => guarded(() => {
    if (typeof value !== 'bigint' || value < 1n || value > 9223372036854775807n) return invalid();
    return value.toString();
  }),
};

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(value).length !== keys.length || keys.some(key =>
    !Object.hasOwn(descriptors, key) || !Object.hasOwn(descriptors[key], 'value'))) return invalid();
  // Usar los valores de los descriptores ya validados, no lecturas posteriores
  // que un Proxy o mutacion durante la inspeccion puedan cambiar.
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}

function report(value: unknown): Report {
  const row = object(value, ['id', 'activityId', 'period', 'quantity', 'narrative', 'state',
    'createdBy', 'createdAt', 'updatedBy', 'updatedAt', 'version']);
  return { id: identifier('report').decode(row.id), activityId: identifier('activity').decode(row.activityId),
    period: period.decode(row.period), quantity: nullable(decimal).decode(row.quantity),
    narrative: unicodeText.decode(row.narrative), state: reportState.decode(row.state),
    createdBy: identifier('user').decode(row.createdBy), createdAt: utcInstant(text(row.createdAt)),
    updatedBy: identifier('user').decode(row.updatedBy), updatedAt: utcInstant(text(row.updatedAt)),
    version: historicalVersion.decode(row.version) };
}
function user(value: unknown): InstitutionalUser {
  const row = object(value, ['id', 'tenantId', 'directoryObjectId', 'alias', 'enabled', 'version']);
  return { id: identifier('user').decode(row.id), tenantId: identifier('tenant').decode(row.tenantId),
    directoryObjectId: identifier('directory-object').decode(row.directoryObjectId),
    alias: unicodeText.decode(row.alias), enabled: bit.decode(row.enabled),
    version: historicalVersion.decode(row.version) };
}
function assignment(value: unknown): AccessAssignment {
  const row = object(value, ['id', 'userId', 'fichaId', 'capability', 'enabled', 'validFrom', 'validUntil', 'version']);
  return { id: identifier('assignment').decode(row.id), userId: identifier('user').decode(row.userId),
    fichaId: identifier('ficha').decode(row.fichaId), capability: capability.decode(row.capability),
    enabled: bit.decode(row.enabled), validFrom: utcInstant(text(row.validFrom)),
    validUntil: row.validUntil === null ? null : utcInstant(text(row.validUntil)),
    version: historicalVersion.decode(row.version) };
}
function parseJson(value: unknown): unknown {
  const source = text(value);
  const parsed: unknown = JSON.parse(source);
  // JSON.parse por si solo sobrescribe claves duplicadas: no perder informacion.
  const tokens = source.match(/"(?:\\.|[^"\\])*"|[{}\[\]:]/g) ?? [];
  const objects: (Set<string> | null)[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token === '{') objects.push(new Set());
    else if (token === '[') objects.push(null);
    else if (token === '}' || token === ']') objects.pop();
    else if (token.startsWith('"') && tokens[index + 1] === ':') {
      const key: string = JSON.parse(token);
      const keys = objects.at(-1);
      if (!keys || keys.has(key)) return invalid();
      keys.add(key);
    }
  }
  return parsed;
}
function snapshot<Value>(parse: (value: unknown) => Value): SqlCodec<Value, string> {
  return {
    decode: value => guarded(() => parse(parseJson(value))),
    encode: value => guarded(() => JSON.stringify(parse(value))),
  };
}
// AuditEvents.{Before,After}Json y IdempotencyRecords.OutcomeReportJson.
// Validacion estructural, sin reinterpretar la version historica como RV actual.
export const reportSnapshot = snapshot(report);
export const userSnapshot = snapshot(user);
export const assignmentSnapshot = snapshot(assignment);
