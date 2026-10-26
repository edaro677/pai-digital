import type { Report, ReportOperationOutcome } from '../../domain/entities.js';
import type { AcceptedEvidence, DeclaredEvidence, EvidenceInput, FileVerification, ProgressOutcome, SubmissionPlan, SubmittedReport } from '../../domain/evidence.js';
import { evidenceInput, targetKey, validateDeclaredEvidence, validateEvidenceInput, validatePlan, validateVerifiedFile } from '../../domain/evidence.js';
import { AccessDeniedError, DuplicateError, IncompatibleStateError, VersionConflictError } from '../../domain/errors.js';
import { idempotencyKey, periodKey, version } from '../../domain/types.js';
import type { IdempotencyKey, IdempotentOperation, PeriodKey, ReportId, Version } from '../../domain/types.js';
import type { FichaAuthorizationService } from '../authorization/service.js';
import type { Clock } from '../ports/clock.js';
import type { AuthenticatedIdentity } from '../ports/identity.js';
import type { ProgressDependencies } from '../ports/progress.js';
import type { TransactionContext, UnitOfWork } from '../ports/unitOfWork.js';
import type { ReportTools } from './service.js';

export interface SubmitCommand { readonly key: IdempotencyKey; readonly expectedVersion: Version; readonly period: PeriodKey }
export interface AssociateEvidenceCommand extends SubmitCommand { readonly evidence: EvidenceInput }
export interface ProgressReceipt { readonly reportId: ReportId; readonly version: Version; readonly result: ProgressOutcome }
// These contracts contain only validated JSON scalars/arrays/records (DecimalText stays a string).
function copy<Value>(value: Value): Value { return JSON.parse(JSON.stringify(value)) as Value; }
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a],[b])=>a<b?-1:a>b?1:0)) : item);
}
function capability(context: TransactionContext) {
  if (!context.progress) throw new IncompatibleStateError();
  return context.progress;
}
function receipt(outcome: ReportOperationOutcome): ProgressReceipt {
  if(!outcome.progress) throw new IncompatibleStateError();
  return copy({reportId:outcome.report.id,version:outcome.report.version,result:outcome.progress});
}

export class ReportProgressService {
  constructor(private readonly work: UnitOfWork, private readonly authorization: FichaAuthorizationService,
    private readonly clock: Clock, private readonly tools: ReportTools, private readonly dependencies: ProgressDependencies = {}) {}

  private async load(context: TransactionContext, identity: AuthenticatedIdentity, id: ReportId, write: boolean) {
    const progress=capability(context);
    const report=await context.reports.findById(id);
    if(!report || report.id!==id) throw new AccessDeniedError();
    const activity=await context.activities.findById(report.activityId);
    if(!activity || activity.id!==report.activityId) throw new AccessDeniedError();
    const access=await this.authorization.requireAllowed(context,identity,activity.fichaId,write?'poc:edit-report':'poc:read');
    return {report,progress,access};
  }
  private async plan(report: Report, actor: Report['updatedBy']): Promise<SubmissionPlan> {
    const value=await this.dependencies.policy?.describe(Object.freeze(copy(report)),actor,this.clock.now());
    if(!value) throw new IncompatibleStateError();
    try{validatePlan(value,report);}catch{throw new IncompatibleStateError();}
    const plan=copy(value);
    return {...plan,targets:[...plan.targets].sort((a,b)=>targetKey(a.target)<targetKey(b.target)?-1:targetKey(a.target)>targetKey(b.target)?1:0)};
  }
  private async replay(context: TransactionContext, identity: AuthenticatedIdentity, report: Report, actor: Report['updatedBy'],
    operation: IdempotentOperation, command: SubmitCommand, extra: readonly unknown[]) {
    const scope={actorId:actor,operation,key:idempotencyKey(command.key)};
    const fingerprint=this.tools.fingerprint(canonical(['progress-v1',scope.operation,actor,identity.clientId,report.id,
      command.period,command.expectedVersion,...extra]));
    const previous=await context.idempotency.findByScope(scope);
    if(previous){
      if(previous.requestFingerprint!==fingerprint) throw new DuplicateError();
      if(previous.state!=='poc:completed' || !previous.outcome.progress) throw new IncompatibleStateError();
      const audit=await context.audit.findById(previous.outcome.auditEventId);
      const action=operation==='poc:associate-evidence'?'poc:evidence-declared':'poc:report-submitted';
      if(!audit || audit.id!==previous.outcome.auditEventId || audit.actorId!==actor || audit.change.action!==action || !('progress' in audit.change)
        || canonical(audit.change.progress)!==canonical(previous.outcome.progress)
        || canonical(audit.change.after)!==canonical(previous.outcome.report)
        || previous.outcome.report.id!==report.id || previous.outcome.report.activityId!==report.activityId
        || previous.outcome.report.period!==command.period
        || previous.outcome.progress.kind!==(operation==='poc:associate-evidence'?'evidence':'submission')) throw new IncompatibleStateError();
      return {scope,fingerprint,previous:receipt(previous.outcome)};
    }
    return {scope,fingerprint,previous:null};
  }
  private checkOpen(report: Report, command: SubmitCommand): void {
    periodKey(command.period); version(command.expectedVersion);
    if(report.period!==command.period || report.state!=='poc-draft') throw new IncompatibleStateError();
    if(report.version!==command.expectedVersion) throw new VersionConflictError();
  }
  async list(identity: AuthenticatedIdentity, id: ReportId): Promise<readonly DeclaredEvidence[]> {
    return this.work.runAtomic(async context=>{const {progress}=await this.load(context,identity,id,false);return progress.listEvidence(id);});
  }
  async submission(identity: AuthenticatedIdentity, id: ReportId): Promise<SubmittedReport|null> {
    return this.work.runAtomic(async context=>{const {progress}=await this.load(context,identity,id,false);return progress.findSubmission(id);});
  }
  async associate(identity: AuthenticatedIdentity, id: ReportId, command: AssociateEvidenceCommand): Promise<ProgressReceipt> {
    validateEvidenceInput(command.evidence);
    command=Object.freeze({key:idempotencyKey(command.key),period:periodKey(command.period),
      expectedVersion:version(command.expectedVersion),evidence:copy(command.evidence)});
    return this.work.runAtomic(async context=>{
      const {report:before,progress,access}=await this.load(context,identity,id,true);
      const input=copy(command.evidence);
      const attempt=await this.replay(context,identity,before,access.userId,'poc:associate-evidence',command,
        [input.id,targetKey(input.target),input.storageReference,input.name,input.mediaType,input.sizeBytes]);
      if(attempt.previous) return attempt.previous;
      this.checkOpen(before,command);
      if(await progress.findSubmission(id) || input.target.activityId!==before.activityId) throw new IncompatibleStateError();
      if(input.target.kind==='goal'){
        const plan=await this.plan(before,access.userId);
        if(!plan.targets.some(entry=>targetKey(entry.target)===targetKey(input.target))) throw new IncompatibleStateError();
      }
      const at=this.clock.now();
      const reservation=await context.idempotency.reserve({id:this.tools.id('idempotency-record'),scope:attempt.scope,requestFingerprint:attempt.fingerprint,createdAt:at});
      const after=await context.reports.update(id,command.expectedVersion,{quantity:before.quantity,narrative:before.narrative,state:before.state,updatedBy:access.userId,updatedAt:at});
      const evidence:DeclaredEvidence={...input,reportId:id,status:'declared',declaredBy:access.userId,declaredAt:at,version:after.version};
      await progress.addEvidence(after,evidence);
      const outcome:ProgressOutcome={kind:'evidence',evidence};const auditId=this.tools.id('audit-event');
      await context.audit.append({id:auditId,actorId:access.userId,occurredAt:at,correlationId:this.tools.correlation(),
        change:{action:'poc:evidence-declared',before,after,progress:outcome}});
      await context.idempotency.complete(reservation.id,reservation.version,{report:after,auditEventId:auditId,progress:outcome},at);
      return receipt({report:after,auditEventId:auditId,progress:outcome});
    });
  }
  async submit(identity: AuthenticatedIdentity, id: ReportId, command: SubmitCommand): Promise<ProgressReceipt> {
    command=Object.freeze({key:idempotencyKey(command.key),period:periodKey(command.period),expectedVersion:version(command.expectedVersion)});
    // Missing institutional rules never activates a SQL transaction or a permissive fallback.
    if(!this.dependencies.policy) throw new IncompatibleStateError();
    const initial=await this.work.runAtomic(async context=>{
      const {report,progress,access}=await this.load(context,identity,id,true);
      const attempt=await this.replay(context,identity,report,access.userId,'poc:submit-report',command,[]);
      if(attempt.previous) return {previous:attempt.previous};
      this.checkOpen(report,command);
      if(await progress.findSubmission(id)) throw new IncompatibleStateError();
      const plan=await this.plan(report,access.userId);
      if(!plan.submissionAllowed) throw new IncompatibleStateError();
      const evidence=await progress.listEvidence(id);
      for(const item of evidence){validateDeclaredEvidence(item);if(!plan.targets.some(entry=>targetKey(entry.target)===targetKey(item.target)))throw new IncompatibleStateError();}
      for(const required of plan.targets.filter(entry=>entry.required)){
        if(!evidence.some(item=>targetKey(item.target)===targetKey(required.target))) throw new IncompatibleStateError();
      }
      return {report,plan,evidence,actorId:access.userId};
    });
    if(initial.previous) return initial.previous;
    if(!initial.report || !initial.plan || !initial.evidence) throw new IncompatibleStateError();
    const accepted:AcceptedEvidence[]=[];
    // Read-only storage I/O is outside UnitOfWork. No mutation is made before verification.
    for(const declaration of initial.evidence){
      const input=evidenceInput(declaration);Object.freeze(input.target);
      const proof:FileVerification|undefined=await this.dependencies.verifier?.verify(Object.freeze(input),
        Object.freeze({report:Object.freeze(copy(initial.report)),actorId:initial.actorId}));
      if(!proof || proof.status!=='verified') throw new IncompatibleStateError();
      try{validateVerifiedFile(proof);}catch{throw new IncompatibleStateError();}
      if(proof.storageReference!==declaration.storageReference || proof.mediaType!==declaration.mediaType || proof.sizeBytes!==declaration.sizeBytes
        || proof.authorizedForReportId!==id || proof.authorizedForUserId!==initial.actorId)throw new IncompatibleStateError();
      accepted.push({status:'valid-for-submission',declaration:copy(declaration),file:copy(proof)});
    }
    return this.work.runAtomic(async context=>{
      const {report:before,progress,access}=await this.load(context,identity,id,true);
      const attempt=await this.replay(context,identity,before,access.userId,'poc:submit-report',command,[]);
      if(attempt.previous)return attempt.previous;
      this.checkOpen(before,command);
      if(await progress.findSubmission(id) || before.version!==initial.report.version)throw new VersionConflictError();
      if(access.userId!==initial.actorId)throw new IncompatibleStateError();
      const plan=await this.plan(before,access.userId);
      if(!plan.submissionAllowed || canonical(plan)!==canonical(initial.plan)
        || canonical(await progress.listEvidence(id))!==canonical(initial.evidence))throw new IncompatibleStateError();
      const at=this.clock.now();
      for(const item of accepted){const age=Date.parse(at)-Date.parse(item.file.verifiedAt);if(age<0 || age>plan.verificationMaxAgeMs)throw new IncompatibleStateError();}
      const reservation=await context.idempotency.reserve({id:this.tools.id('idempotency-record'),scope:attempt.scope,requestFingerprint:attempt.fingerprint,createdAt:at});
      const after=await context.reports.update(id,command.expectedVersion,{quantity:before.quantity,narrative:before.narrative,state:before.state,updatedBy:access.userId,updatedAt:at});
      const submission:SubmittedReport={from:'Abierto',state:'Enviado',report:after,submittedBy:access.userId,submittedAt:at,policyVersion:plan.policyVersion,evidence:accepted};
      await progress.submit(submission);
      const outcome:ProgressOutcome={kind:'submission',submission};const auditId=this.tools.id('audit-event');
      await context.audit.append({id:auditId,actorId:access.userId,occurredAt:at,correlationId:this.tools.correlation(),
        change:{action:'poc:report-submitted',before,after,progress:outcome}});
      await context.idempotency.complete(reservation.id,reservation.version,{report:after,auditEventId:auditId,progress:outcome},at);
      return receipt({report:after,auditEventId:auditId,progress:outcome});
    });
  }
}
