import { InvalidValueError } from './errors.js';

declare const brand: unique symbol;
type Branded<Value, Kind extends string> = Value & { readonly [brand]: Kind };

export type IdentifierKind =
  | 'user' | 'tenant' | 'directory-object' | 'dependency' | 'ficha'
  | 'assignment' | 'activity' | 'report' | 'audit-event' | 'idempotency-record' | 'evidence' | 'goal';
export type EntityId<Kind extends IdentifierKind> = Branded<string, `id:${Kind}`>;
export type UserId = EntityId<'user'>;
export type TenantId = EntityId<'tenant'>;
export type DirectoryObjectId = EntityId<'directory-object'>;
export type DependencyId = EntityId<'dependency'>;
export type FichaId = EntityId<'ficha'>;
export type AssignmentId = EntityId<'assignment'>;
export type ActivityId = EntityId<'activity'>;
export type ReportId = EntityId<'report'>;
export type AuditEventId = EntityId<'audit-event'>;
export type IdempotencyRecordId = EntityId<'idempotency-record'>;

/** Token opaco: el consumidor no calcula ni incrementa versiones. */
export type Version = Branded<string, 'version'>;
export type UtcInstant = Branded<string, 'utc-instant'>;
export type DecimalText = Branded<string, 'decimal-text'>;
export type PeriodKey = Branded<string, 'period-key'>;
export type CorrelationId = Branded<string, 'correlation-id'>;
export type IdempotencyKey = Branded<string, 'idempotency-key'>;
export type RequestFingerprint = Branded<string, 'request-fingerprint'>;

// Exclusivos del laboratorio: no son roles, cierres ni transiciones institucionales.
export type ReportState = 'poc-draft' | 'poc-blocked';
export type Capability = 'poc:read' | 'poc:edit-report';
export type IdempotentOperation = 'poc:create-report' | 'poc:update-report' | 'poc:associate-evidence' | 'poc:submit-report';

function token<Kind extends string>(value: string): Branded<string, Kind> {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidValueError();
  }
  return value as Branded<string, Kind>;
}

// Sin normalización: la representación recibida debe ser ya canónica.
export function entityId<Kind extends IdentifierKind>(kind: Kind, value: string): EntityId<Kind> {
  const result = token<`id:${Kind}`>(value);
  if (kind === 'tenant' || kind === 'directory-object') {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
        || value === '00000000-0000-0000-0000-000000000000') throw new InvalidValueError();
  } else if (value.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new InvalidValueError();
  return result;
}
export function version(value: string): Version {
  const result = token<'version'>(value);
  if (value.length > 128 || /[^\x21-\x7e]/.test(value)) throw new InvalidValueError();
  return result;
}
export function periodKey(value: string): PeriodKey {
  const result = token<'period-key'>(value);
  if (value.length > 128) throw new InvalidValueError();
  // Unidades UTF-16, no grafemas. Rechaza sustitutos aislados sin alterar el texto.
  for (let index = 0; index < value.length; index++) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new InvalidValueError();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new InvalidValueError();
  }
  return result;
}
export function correlationId(value: string): CorrelationId {
  const result = token<'correlation-id'>(value);
  if (value.length > 64 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new InvalidValueError();
  return result;
}
export function idempotencyKey(value: string): IdempotencyKey {
  const result = token<'idempotency-key'>(value);
  if (value.length > 128 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new InvalidValueError();
  return result;
}
export function requestFingerprint(value: string): RequestFingerprint {
  const result = token<'request-fingerprint'>(value);
  if (!/^[0-9a-f]{64}$/.test(value)) throw new InvalidValueError();
  return result;
}

/** Representación decimal exacta, sin rangos, escala ni redondeo institucionales. */
export function decimalText(value: string): DecimalText {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new InvalidValueError();
  return value as DecimalText;
}

/** ISO UTC canónico con milisegundos; valida representación, no ventanas de reporte. */
export function utcInstant(value: string): UtcInstant {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      || value.startsWith('0000-')) throw new InvalidValueError();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new InvalidValueError();
  return value as UtcInstant;
}
