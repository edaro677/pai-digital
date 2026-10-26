import type { Report } from './entities.js';
import type { ActivityId, EntityId, PeriodKey, ReportId, UserId, UtcInstant, Version } from './types.js';
import { entityId, periodKey, utcInstant, version } from './types.js';
import { InvalidValueError } from './errors.js';

export type EvidenceTarget =
  | Readonly<{ kind: 'activity'; activityId: ActivityId }>
  | Readonly<{ kind: 'goal'; activityId: ActivityId; goalId: EntityId<'goal'> }>;
export interface EvidenceInput {
  readonly id: EntityId<'evidence'>;
  readonly target: EvidenceTarget;
  /** Opaque storage handle. Never a URL, local path, SAS or proof of existence. */
  readonly storageReference: string;
  readonly name: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
}
export interface DeclaredEvidence extends EvidenceInput {
  readonly reportId: ReportId;
  readonly status: 'declared';
  readonly declaredBy: UserId;
  readonly declaredAt: UtcInstant;
  readonly version: Version;
}
export interface VerifiedFile {
  readonly status: 'verified';
  readonly storageReference: string;
  readonly storageVersion: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly sizeBytes: number;
  readonly verifiedAt: UtcInstant;
  readonly authorizedForReportId: ReportId;
  readonly authorizedForUserId: UserId;
}
export type FileVerification = VerifiedFile | Readonly<{ status: 'unavailable' | 'not-found' | 'rejected' }>;
export interface AcceptedEvidence {
  readonly status: 'valid-for-submission';
  readonly declaration: DeclaredEvidence;
  readonly file: VerifiedFile;
}
export interface SubmissionPlan {
  readonly complete: true;
  readonly policyVersion: string;
  readonly reportId: ReportId;
  readonly activityId: ActivityId;
  readonly period: PeriodKey;
  /** Institutional interpretation supplied by trusted policy, never inferred from poc-draft. */
  readonly sourceState: 'Abierto';
  readonly submissionAllowed: boolean;
  readonly verificationMaxAgeMs: number;
  readonly targets: readonly Readonly<{ target: EvidenceTarget; required: boolean }>[];
}
export interface SubmittedReport {
  readonly from: 'Abierto';
  readonly state: 'Enviado';
  readonly report: Report;
  readonly submittedBy: UserId;
  readonly submittedAt: UtcInstant;
  readonly policyVersion: string;
  readonly evidence: readonly AcceptedEvidence[];
}
export type ProgressOutcome =
  | Readonly<{ kind: 'evidence'; evidence: DeclaredEvidence }>
  | Readonly<{ kind: 'submission'; submission: SubmittedReport }>;

function keys(value: object, allowed: readonly string[]): void {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new InvalidValueError();
}
export function validateTarget(target: EvidenceTarget): void {
  if (!target || typeof target !== 'object' || Array.isArray(target)) throw new InvalidValueError();
  keys(target, target.kind === 'goal' ? ['kind','activityId','goalId'] : ['kind','activityId']);
  entityId('activity', target.activityId);
  if (target.kind === 'goal') entityId('goal', target.goalId);
  else if (target.kind !== 'activity') throw new InvalidValueError();
}
function handle(value: string, max = 256): void {
  if (typeof value !== 'string' || value.length > max || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new InvalidValueError();
}
function validateFields(input: EvidenceInput): void {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new InvalidValueError();
  entityId('evidence', input.id); validateTarget(input.target); handle(input.storageReference);
  if (typeof input.name !== 'string' || input.name.trim() !== input.name || ['.','..'].includes(input.name) || /[/\\]/.test(input.name)) throw new InvalidValueError();
  periodKey(input.name); // bounded well-formed Unicode, no control characters
  if (typeof input.mediaType !== 'string' || input.mediaType.length > 127
      || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(input.mediaType)
      || !Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 0) throw new InvalidValueError();
}
export function validateEvidenceInput(input: EvidenceInput): void {
  validateFields(input);keys(input,['id','target','storageReference','name','mediaType','sizeBytes']);
}
export function evidenceInput(input: EvidenceInput): EvidenceInput {
  const target:EvidenceTarget=input.target.kind==='goal'
    ?{kind:'goal',activityId:input.target.activityId,goalId:input.target.goalId}:{kind:'activity',activityId:input.target.activityId};
  return {id:input.id,target,storageReference:input.storageReference,name:input.name,mediaType:input.mediaType,sizeBytes:input.sizeBytes};
}
export function validateDeclaredEvidence(input: DeclaredEvidence): void {
  validateFields(input);keys(input,['id','target','storageReference','name','mediaType','sizeBytes','reportId','status','declaredBy','declaredAt','version']);
  entityId('report', input.reportId); entityId('user', input.declaredBy);
  utcInstant(input.declaredAt); version(input.version);
  if (input.status !== 'declared') throw new InvalidValueError();
}
export const targetKey = (target: EvidenceTarget): string => JSON.stringify([
  target.kind, target.activityId, target.kind === 'goal' ? target.goalId : null,
]);
export function validatePlan(plan: SubmissionPlan, report: Report): void {
  if (!plan || plan.complete !== true || plan.reportId !== report.id || plan.activityId !== report.activityId
      || plan.period !== report.period || plan.sourceState !== 'Abierto' || typeof plan.submissionAllowed !== 'boolean'
      || !Number.isSafeInteger(plan.verificationMaxAgeMs) || plan.verificationMaxAgeMs < 0
      || !Array.isArray(plan.targets) || plan.targets.length === 0) throw new InvalidValueError();
  handle(plan.policyVersion,128);
  const seen = new Set<string>(); let activities = 0;
  for (const entry of plan.targets) {
    validateTarget(entry.target);
    if (entry.target.activityId !== report.activityId || typeof entry.required !== 'boolean' || seen.has(targetKey(entry.target))) throw new InvalidValueError();
    seen.add(targetKey(entry.target)); if (entry.target.kind === 'activity') activities++;
  }
  if (activities !== 1) throw new InvalidValueError();
}
export function validateVerifiedFile(file: VerifiedFile): void {
  if (!file || file.status !== 'verified') throw new InvalidValueError();
  keys(file,['status','storageReference','storageVersion','sha256','mediaType','sizeBytes','verifiedAt','authorizedForReportId','authorizedForUserId']);
  handle(file.storageReference); handle(file.storageVersion);
  if (!/^[0-9a-f]{64}$/.test(file.sha256) || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0
      || typeof file.mediaType !== 'string' || !/^[a-z0-9][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/.test(file.mediaType)) throw new InvalidValueError();
  utcInstant(file.verifiedAt);
  entityId('report',file.authorizedForReportId);entityId('user',file.authorizedForUserId);
}
