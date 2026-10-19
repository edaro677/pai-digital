import { InvalidValueError } from './errors.js';

declare const brand: unique symbol;
type Branded<Value, Kind extends string> = Value & { readonly [brand]: Kind };

export type IdentifierKind =
  | 'user' | 'tenant' | 'directory-object' | 'dependency' | 'ficha'
  | 'assignment' | 'activity' | 'report' | 'audit-event' | 'idempotency-record';
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
export type IdempotentOperation = 'poc:create-report' | 'poc:update-report';

function token<Kind extends string>(value: string): Branded<string, Kind> {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidValueError();
  }
  return value as Branded<string, Kind>;
}

// kind establece la marca de compilación; no codifica roles ni procedencia en el ID.
export function entityId<Kind extends IdentifierKind>(_kind: Kind, value: string): EntityId<Kind> {
  return token<`id:${Kind}`>(value);
}
export function version(value: string): Version { return token<'version'>(value); }
export function periodKey(value: string): PeriodKey { return token<'period-key'>(value); }
export function correlationId(value: string): CorrelationId { return token<'correlation-id'>(value); }
export function idempotencyKey(value: string): IdempotencyKey { return token<'idempotency-key'>(value); }
export function requestFingerprint(value: string): RequestFingerprint { return token<'request-fingerprint'>(value); }

/** Representación decimal exacta, sin rangos, escala ni redondeo institucionales. */
export function decimalText(value: string): DecimalText {
  if (typeof value !== 'string' || !/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) throw new InvalidValueError();
  return value as DecimalText;
}

/** ISO UTC canónico con milisegundos; valida representación, no ventanas de reporte. */
export function utcInstant(value: string): UtcInstant {
  if (typeof value !== 'string') throw new InvalidValueError();
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new InvalidValueError();
  return value as UtcInstant;
}
