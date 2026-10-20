import test from 'node:test';
import assert from 'node:assert/strict';
import {
  entityId, version, utcInstant, decimalText, periodKey,
  correlationId, idempotencyKey, requestFingerprint,
} from '../.local-build/domain/types.js';
import {
  DomainError, NotFoundError, AccessDeniedError, VersionConflictError,
  DuplicateError, IncompatibleStateError, InvalidValueError,
} from '../.local-build/domain/errors.js';

test('los tokens conservan la representación y no deducen códigos institucionales', () => {
  assert.equal(entityId('report', 'synthetic-report'), 'synthetic-report');
  assert.equal(version('opaque-synthetic-token'), 'opaque-synthetic-token');
  assert.equal(periodKey('synthetic-period'), 'synthetic-period');
  assert.equal(correlationId('synthetic-correlation'), 'synthetic-correlation');
  assert.equal(idempotencyKey('synthetic-operation'), 'synthetic-operation');
  assert.equal(requestFingerprint('a'.repeat(64)), 'a'.repeat(64));
  for (const invalid of ['', ' leading', 'trailing ', 'line\nbreak', null, 42]) {
    assert.throws(() => entityId('user', invalid), InvalidValueError);
    assert.throws(() => version(invalid), InvalidValueError);
  }
});

test('los decimales no pierden precisión ni fijan rangos de negocio', () => {
  for (const valid of ['0', '-0.25', '123456789012345678901234567890.0001', '1.200', '120']) {
    assert.equal(decimalText(valid), valid);
  }
  for (const invalid of ['', 'NaN', 'Infinity', '1e3', '1,2', '01.2', '1.', ' 2', 1.2]) {
    assert.throws(() => decimalText(invalid), InvalidValueError);
  }
});

test('el instante valida UTC canónico y rechaza fechas normalizadas silenciosamente', () => {
  assert.equal(utcInstant('2000-02-29T12:00:00.000Z'), '2000-02-29T12:00:00.000Z');
  for (const invalid of ['2001-02-29T12:00:00.000Z', '2000-02-30T12:00:00.000Z', 'invalid', '2000-01-01', '2000-01-01T12:00:00-05:00', null]) {
    assert.throws(() => utcInstant(invalid), InvalidValueError);
  }
});

test('los errores distinguen causa de dominio sin imponer transporte ni infraestructura', () => {
  const cases = [
    [NotFoundError, 'NOT_FOUND'], [AccessDeniedError, 'ACCESS_DENIED'],
    [VersionConflictError, 'VERSION_CONFLICT'], [DuplicateError, 'DUPLICATE'],
    [IncompatibleStateError, 'INCOMPATIBLE_STATE'], [InvalidValueError, 'INVALID_VALUE'],
  ];
  for (const [ErrorType, code] of cases) {
    const error = new ErrorType();
    assert.ok(error instanceof Error);
    assert.ok(error instanceof DomainError);
    assert.equal(error.name, ErrorType.name);
    assert.equal(error.code, code);
    assert.equal('status' in error, false);
    assert.equal('connectionString' in error, false);
  }
});
