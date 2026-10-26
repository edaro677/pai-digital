import type { ProgressOutcome, SubmittedReport, DeclaredEvidence } from '../../domain/evidence.js';
import { validateDeclaredEvidence, validateVerifiedFile } from '../../domain/evidence.js';
import { entityId, utcInstant } from '../../domain/types.js';
import { reportSnapshot } from './codecs.js';
import { mapped } from './repositories/shared.js';

export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
}
function exact(value: object, keys: readonly string[]): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) throw new Error();
}
export function declaration(value: DeclaredEvidence): DeclaredEvidence {
  return mapped(() => { const copy = structuredClone(value); validateDeclaredEvidence(copy); return copy; });
}
export function submission(value: SubmittedReport): SubmittedReport {
  return mapped(() => {
    const copy = structuredClone(value);
    exact(copy, ['from','state','report','submittedBy','submittedAt','policyVersion','evidence']);
    reportSnapshot.decode(reportSnapshot.encode(copy.report));
    entityId('user', copy.submittedBy); utcInstant(copy.submittedAt);
    if (copy.from !== 'Abierto' || copy.state !== 'Enviado' || typeof copy.policyVersion !== 'string'
        || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(copy.policyVersion) || !Array.isArray(copy.evidence)) throw new Error();
    const seen = new Set<string>();
    for (const item of copy.evidence) {
      exact(item, ['status','declaration','file']);
      validateDeclaredEvidence(item.declaration); validateVerifiedFile(item.file);
      if (item.status !== 'valid-for-submission' || seen.has(item.declaration.id)
          || item.declaration.reportId !== copy.report.id || item.declaration.target.activityId !== copy.report.activityId
          || item.file.authorizedForReportId !== copy.report.id || item.file.authorizedForUserId !== copy.submittedBy
          || item.file.storageReference !== item.declaration.storageReference || item.file.mediaType !== item.declaration.mediaType
          || item.file.sizeBytes !== item.declaration.sizeBytes || Date.parse(item.file.verifiedAt) > Date.parse(copy.submittedAt)) throw new Error();
      seen.add(item.declaration.id);
    }
    return copy;
  });
}
export const progressSnapshot = {
  encode(value: ProgressOutcome): string {
    return mapped(() => {
      exact(value, value.kind === 'evidence' ? ['kind','evidence'] : ['kind','submission']);
      if (value.kind === 'evidence') return JSON.stringify({ kind: value.kind, evidence: declaration(value.evidence) });
      if (value.kind === 'submission') return JSON.stringify({ kind: value.kind, submission: submission(value.submission) });
      throw new Error();
    });
  },
  decode(value: unknown): ProgressOutcome {
    return mapped(() => {
      if (typeof value !== 'string') throw new Error();
      const parsed = JSON.parse(value) as ProgressOutcome;
      return JSON.parse(this.encode(parsed)) as ProgressOutcome;
    });
  },
};
