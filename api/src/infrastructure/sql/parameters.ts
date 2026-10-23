import { decimal, guid, instant } from './codecs.js';
import { SqlInfrastructureError } from './errors.js';

export type SqlLength = number | 'max';
interface Named { readonly name: string }
export type SqlParameter = Named & (
  | { readonly type: 'varchar' | 'nvarchar'; readonly value: string | null; readonly length?: SqlLength }
  | { readonly type: 'uniqueidentifier'; readonly value: string | null }
  | { readonly type: 'datetime2'; readonly value: Date | null; readonly scale?: number }
  | { readonly type: 'bit'; readonly value: boolean | null }
  | { readonly type: 'bigint'; readonly value: string | null }
  | { readonly type: 'decimal' | 'numeric'; readonly value: string | null; readonly precision: number; readonly scale: number }
  | { readonly type: 'binary'; readonly value: Uint8Array | null; readonly length?: number }
  | { readonly type: 'varbinary'; readonly value: Uint8Array | null; readonly length: SqlLength }
);
export interface SqlStatement {
  readonly text: string;
  readonly parameters: readonly SqlParameter[];
}

function invalid(): never { throw new SqlInfrastructureError('SQL_CODEC_INVALID'); }
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(value);
  if (keys.some(key => typeof key !== 'string' || ![...required, ...optional].includes(key))
      || required.some(key => !Object.hasOwn(descriptors, key))
      || keys.some(key => !Object.hasOwn(descriptors[key as string], 'value'))) return invalid();
  return Object.fromEntries(Object.entries(descriptors).map(([key, entry]) => [key, entry.value]));
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) return invalid();
  return value;
}
function length(value: unknown, max: number, allowMax: boolean): SqlLength {
  return value === 'max' && allowMax ? 'max' : integer(value, 1, max);
}
function guarded<Value>(operation: () => Value): Value {
  try { return operation(); } catch { return invalid(); }
}

/** Descriptores existentes sin longitud: texto=max, binary=8, datetime2=3.
 * Solo ausencia permite default; metadatos presentes pero undefined son invalidos. */
export function validateSqlParameter(input: unknown): SqlParameter {
  return guarded(() => {
    const base = record(input, ['name', 'type', 'value'], ['length', 'precision', 'scale']);
    if (typeof base.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,126}$/.test(base.name)) return invalid();
    const { name, type, value } = base;
    const shape = (required: string[] = [], optional: string[] = []) => record(base, ['name', 'type', 'value', ...required], optional);
    switch (type) {
      case 'varchar': case 'nvarchar': {
        shape([], ['length']);
        const size = Object.hasOwn(base, 'length') ? length(base.length, type === 'nvarchar' ? 4000 : 8000, true) : 'max';
        if (value !== null && (typeof value !== 'string'
            || (type === 'varchar' && /[^\x00-\x7f]/.test(value))
            || (size !== 'max' && value.length > size))) return invalid();
        return { name, type, length: size, value: value as string | null };
      }
      case 'uniqueidentifier':
        shape();
        return { name, type, value: value === null ? null : guid('tenant').encode(value as never) };
      case 'bit':
        shape();
        if (value !== null && typeof value !== 'boolean') return invalid();
        return { name, type, value };
      case 'datetime2': {
        shape([], ['scale']);
        const scale = Object.hasOwn(base, 'scale') ? integer(base.scale, 0, 7) : 3;
        const date = value === null ? null : instant.encode(instant.decode(value));
        if (date && scale < 3 && date.getUTCMilliseconds() % (10 ** (3 - scale)) !== 0) return invalid();
        return { name, type, scale, value: date };
      }
      case 'bigint': {
        shape();
        if (value !== null) {
          if (typeof value !== 'string' || !/^-?(0|[1-9][0-9]*)$/.test(value)) return invalid();
          const exact = BigInt(value);
          if (exact < -9223372036854775808n || exact > 9223372036854775807n) return invalid();
        }
        return { name, type, value: value as string | null };
      }
      case 'decimal': case 'numeric': {
        shape(['precision', 'scale']);
        const precision = integer(base.precision, 1, 38);
        const scale = integer(base.scale, 0, precision);
        if (value !== null) {
          const exact = decimal.decode(value);
          const [whole, fraction = ''] = exact.replace(/^-/, '').split('.');
          if ((whole === '0' ? 0 : whole.length) > precision - scale || fraction.length > scale) return invalid();
        }
        return { name, type, precision, scale, value: value as string | null };
      }
      case 'binary': case 'varbinary': {
        shape(type === 'varbinary' ? ['length'] : [], type === 'binary' ? ['length'] : []);
        const size = Object.hasOwn(base, 'length') ? length(base.length, 8000, type === 'varbinary') : 8;
        let bytes: Uint8Array | null = null;
        if (value !== null) {
          if (!(value instanceof Uint8Array)) return invalid();
          bytes = Uint8Array.from(Uint8Array.prototype.values.call(value));
          if ((size !== 'max' && bytes.length > size) || (type === 'binary' && bytes.length !== size)) return invalid();
        }
        if (type === 'binary') return { name, type, length: size as number, value: bytes };
        return { name, type, length: size, value: bytes };
      }
      default: return invalid();
    }
  });
}

function parameterList(input: unknown): SqlParameter[] {
  if (!Array.isArray(input)) return invalid();
  const parameters = Array.from(input, validateSqlParameter);
  const names = parameters.map(parameter => parameter.name.toLowerCase());
  if (new Set(names).size !== names.length) return invalid();
  return parameters;
}

export function validateSqlStatement(input: unknown): SqlStatement {
  return guarded(() => {
    const row = record(input, ['text', 'parameters']);
    if (typeof row.text !== 'string' || !row.text.trim() || !Array.isArray(row.parameters)) return invalid();
    return { text: row.text, parameters: parameterList(row.parameters) };
  });
}

export type MssqlOdbcBindingIssue = 'EXACT_DECIMAL_BINDING_UNAVAILABLE' | 'BINARY_NULL_BINDING_UNSAFE' | 'EMPTY_BINARY_BINDING_UNSAFE';
/** Barrera pura para el futuro transporte; no importa ni ejecuta el controlador. */
export function mssqlOdbcBindingIssue(input: unknown): MssqlOdbcBindingIssue | null {
  const parameter = validateSqlParameter(input);
  if (parameter.type === 'decimal' || parameter.type === 'numeric') return 'EXACT_DECIMAL_BINDING_UNAVAILABLE';
  if ((parameter.type === 'binary' || parameter.type === 'varbinary') && parameter.value === null) return 'BINARY_NULL_BINDING_UNSAFE';
  // R3: el enlace real convierte Buffer(0) en SQL NULL. No confundir ambos.
  if ((parameter.type === 'binary' || parameter.type === 'varbinary') && parameter.value?.length === 0) return 'EMPTY_BINARY_BINDING_UNSAFE';
  return null;
}
export function prepareMssqlOdbcParameters(inputs: readonly SqlParameter[]): readonly SqlParameter[] {
  return guarded(() => parameterList(inputs).map(parameter => {
    if (mssqlOdbcBindingIssue(parameter)) return invalid();
    if ((parameter.type === 'binary' || parameter.type === 'varbinary') && parameter.value !== null) {
      // msnodesqlv8 no debe convertir Uint8Array.toString() a bytes de texto.
      return { ...parameter, value: Buffer.from(parameter.value) };
    }
    return parameter;
  }));
}
