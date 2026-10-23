// Test-only pure orchestration: no child_process, native driver or SQL execution.
import { performance } from 'node:perf_hooks';
import { SqlInfrastructureError, sanitizeWorkError } from '../../.local-build/infrastructure/sql/errors.js';
import { ConnectionObservationError } from './sql-connection-observer.mjs';

const technicalCodes = new Set(['ENOENT', 'EACCES', 'ENOEXEC', 'EPERM', 'ENOMEM',
  'EINVAL', 'EIO', 'ENOBUFS', 'ETIMEDOUT']);
const signals = new Set(['SIGTERM', 'SIGKILL', 'SIGINT', 'SIGABRT', 'SIGBREAK', 'SIGHUP']);
const received = value => typeof value === 'string' ? value.length > 0
  : Buffer.isBuffer(value) ? value.length > 0 : null;
// Inspect only own data properties. Do not invoke accessors supplied by an error.
const data = (value, key) => {
  try { return Object.getOwnPropertyDescriptor(value, key)?.value; }
  catch { return undefined; }
};

export function parseSqlcmdSnapshot(execute, onEvidence) {
  const start = performance.now();
  const evidence = { stage: 'PROCESS', durationMs: 0, exitCode: null, signal: null,
    technicalCode: null, stdoutReceived: null, stderrReceived: null,
    parseReached: false, parseSucceeded: false, category: null };
  function emit() {
    const record = Object.freeze({ ...evidence, durationMs: Math.max(0, performance.now() - start) });
    // Optional diagnostics cannot replace the public failure or change SQL assertions.
    try { onEvidence?.(record); } catch { /* no raw observer error escapes */ }
  }
  let text;
  try {
    text = execute();
    evidence.exitCode = 0;
    evidence.stdoutReceived = received(text);
    // execFileSync returns stdout only on success: stderr presence is unknown.
  } catch (error) {
    const code = data(error, 'code'), status = data(error, 'status');
    const signal = data(error, 'signal');
    evidence.technicalCode = technicalCodes.has(code) ? code : null;
    evidence.exitCode = Number.isInteger(status) ? status : null;
    evidence.signal = signals.has(signal) ? signal : null;
    evidence.stdoutReceived = received(data(error, 'stdout'));
    evidence.stderrReceived = received(data(error, 'stderr'));
    evidence.category = code === 'ETIMEDOUT' ? 'SQLCMD_PROCESS_TIMEOUT'
      : code === 'ENOBUFS' ? 'SQLCMD_OUTPUT_FAILED'
      : ['ENOENT', 'EACCES', 'ENOEXEC'].includes(code)
        && evidence.exitCode === null && !signal && !data(error, 'pid') ? 'SQLCMD_SPAWN_FAILED'
      : evidence.exitCode !== null && evidence.exitCode !== 0 || evidence.signal !== null
        ? 'SQLCMD_PROCESS_FAILED' : 'SQLCMD_DIAGNOSTIC_UNKNOWN';
    emit();
    throw new SqlInfrastructureError('SQL_QUERY_FAILED');
  }
  evidence.stage = 'JSON';
  evidence.parseReached = true;
  let result;
  try {
    result = JSON.parse(text.trim());
  } catch {
    evidence.category = 'SQLCMD_JSON_INVALID';
    emit();
    throw new SqlInfrastructureError('SQL_QUERY_FAILED');
  }
  evidence.parseSucceeded = true;
  emit();
  return result;
}

function safeFailure(error) {
  // Preserve only known diagnostic categories, never messages/stacks or originals.
  if (error instanceof ConnectionObservationError) {
    const safe = new ConnectionObservationError(error.code);
    if (error.cleanupCode === 'NATIVE_CLOSE_FAILED') safe.cleanupCode = 'NATIVE_CLOSE_FAILED';
    return safe;
  }
  return sanitizeWorkError(error);
}
// The work owns/awaits its cleanup (SqlSessionRunner and the DMV observer).
// Always attempt the independent final check, even if work/cleanup already failed.
export async function withFinalSnapshot(work, finalCheck, onEvidence) {
  let result, primary, finalFailure;
  try { result = await work(); }
  catch (error) { primary = safeFailure(error); }
  finally {
    try { await finalCheck(); }
    catch (error) { finalFailure = safeFailure(error); }
    const evidence = Object.freeze({ finalIntegrityVerified: !finalFailure,
      priorFailureCode: primary?.code ?? null, finalFailureCode: finalFailure?.code ?? null });
    try { onEvidence?.(evidence); } catch { /* never replace independent failures */ }
  }
  if (primary) {
    if (finalFailure) primary.finalSnapshotCode = finalFailure.code;
    throw primary;
  }
  if (finalFailure) throw finalFailure;
  return result;
}
