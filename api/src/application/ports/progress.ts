import type { Report } from '../../domain/entities.js';
import type { DeclaredEvidence, EvidenceInput, FileVerification, SubmissionPlan, SubmittedReport } from '../../domain/evidence.js';
import type { ReportId, UtcInstant, UserId } from '../../domain/types.js';

/** Optional transactional capability. Missing in SQL until a reviewed schema exists. */
export interface ProgressRepository {
  listEvidence(reportId: ReportId): Promise<readonly DeclaredEvidence[]>;
  findSubmission(reportId: ReportId): Promise<SubmittedReport | null>;
  addEvidence(report: Report, evidence: DeclaredEvidence): Promise<void>;
  submit(submission: SubmittedReport): Promise<void>;
}
export interface SubmissionPolicy {
  /** Must describe the complete activity/goal scope, approved period and actor permission.
   * null means missing institutional rules. No default draft->Abierto mapping. */
  describe(report: Readonly<Report>, actorId: UserId, at: UtcInstant): Promise<SubmissionPlan | null>;
}
export interface EvidenceVerifier {
  /** Read-only trusted adapter; must bind an immutable storage version and digest.
   * Must attest the actor's right to use this immutable object for this report.
   * HTTP input is never accepted as a verification result. */
  verify(evidence: Readonly<EvidenceInput>, context: Readonly<{report: Readonly<Report>;actorId: UserId}>): Promise<FileVerification>;
}
export interface ProgressDependencies {
  readonly policy?: SubmissionPolicy;
  readonly verifier?: EvidenceVerifier;
}
