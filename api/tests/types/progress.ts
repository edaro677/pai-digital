import type { DeclaredEvidence, EvidenceTarget, VerifiedFile } from '../../src/domain/evidence.js';
import type { SubmitCommand } from '../../src/application/reports/progress.js';
import type { EvidenceVerifier, SubmissionPolicy } from '../../src/application/ports/progress.js';
import type { ActivityId } from '../../src/domain/types.js';
declare const declared: DeclaredEvidence;
declare const activityId: ActivityId;
declare const command: SubmitCommand;
// @ts-expect-error A declared reference is not an independently verified file.
const verified: VerifiedFile = declared;
// @ts-expect-error A goal association requires its own goal identifier.
const goal: EvidenceTarget = { kind: 'goal', activityId };
// @ts-expect-error Sending requires an expected optimistic version.
const noVersion: SubmitCommand = { key: command.key, period: command.period };
const verifier: EvidenceVerifier = { verify: async () => ({status:'unavailable'}) };
const policy: SubmissionPolicy = { describe: async () => null };
void verified; void goal; void noVersion; void verifier; void policy;
