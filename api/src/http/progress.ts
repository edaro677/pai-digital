import type { HttpRequest, HttpResponseInit } from '@azure/functions';
import type { IdentityValidator } from '../application/ports/identity.js';
import type { ReportProgressService } from '../application/reports/progress.js';
import type { DeclaredEvidence, EvidenceInput, ProgressOutcome, SubmittedReport } from '../domain/evidence.js';
import { validateEvidenceInput } from '../domain/evidence.js';
import { AccessDeniedError, DuplicateError, IncompatibleStateError, InvalidValueError, NotFoundError, VersionConflictError } from '../domain/errors.js';
import { entityId, idempotencyKey, periodKey, version } from '../domain/types.js';
import { AuthenticationError } from '../infrastructure/identity/errors.js';
import { queryResponse, unavailableQuery } from './fichas.js';
import { readJson, RequestError } from './reportes.js';

function declaration(value: DeclaredEvidence) {
  return {id:value.id,target:value.target,storageReference:value.storageReference,name:value.name,
    mediaType:value.mediaType,sizeBytes:value.sizeBytes,reportId:value.reportId,status:value.status,declaredAt:value.declaredAt,version:value.version};
}
function submission(value: SubmittedReport|null) {
  if(!value)return null;
  const {report}=value;
  return {from:value.from,state:value.state,submittedAt:value.submittedAt,policyVersion:value.policyVersion,
    report:{id:report.id,activityId:report.activityId,period:report.period,quantity:report.quantity,narrative:report.narrative,
      state:report.state,version:report.version,createdAt:report.createdAt,updatedAt:report.updatedAt},
    evidence:value.evidence.map(item=>({status:item.status,declaration:declaration(item.declaration),
      file:{status:item.file.status,storageReference:item.file.storageReference,storageVersion:item.file.storageVersion,
        sha256:item.file.sha256,mediaType:item.file.mediaType,sizeBytes:item.file.sizeBytes,verifiedAt:item.file.verifiedAt,
        authorizedForReportId:item.file.authorizedForReportId}}))};
}
function outcome(value: ProgressOutcome) {
  return value.kind==='evidence'?{kind:value.kind,evidence:declaration(value.evidence)}:{kind:value.kind,submission:submission(value.submission)};
}
export function createProgressHandlers(identity: IdentityValidator, service: ReportProgressService) {
  function handler(operation:'associate'|'list'|'submit'|'submission') {
    return async (request: HttpRequest):Promise<HttpResponseInit>=>{
      try{
        const actor=await identity.validateAuthorization(request.headers.get('authorization'));
        const id=entityId('report',request.params.reportId ?? '');
        const write=operation==='associate'||operation==='submit';
        if(request.method!==(write?'POST':'GET') || request.query.size!==0)throw new RequestError(400);
        if(!write){
          if(request.body!==null)throw new RequestError(400);
          return queryResponse(200,{data:operation==='list'?(await service.list(actor,id)).map(declaration):submission(await service.submission(actor,id))});
        }
        const body=await readJson(request);
        const fields=operation==='associate'?['period','expectedVersion','evidence']:['period','expectedVersion'];
        if(Object.keys(body).some(key=>!fields.includes(key)) || !fields.every(key=>Object.hasOwn(body,key)))throw new RequestError(400);
        const command={key:idempotencyKey(request.headers.get('idempotency-key')??''),
          expectedVersion:version(body.expectedVersion as string),period:periodKey(body.period as string)};
        let result;
        if(operation==='associate'){
          const input=body.evidence as EvidenceInput;
          if(!input || typeof input!=='object' || Array.isArray(input)
            || Object.keys(input).some(key=>!['id','target','storageReference','name','mediaType','sizeBytes'].includes(key)))throw new RequestError(400);
          validateEvidenceInput(input);
          result=await service.associate(actor,id,{...command,evidence:input});
        }else result=await service.submit(actor,id,command);
        return queryResponse(operation==='associate'?201:200,{data:{reportId:result.reportId,version:result.version,result:outcome(result.result)}});
      }catch(error){
        if(error instanceof AuthenticationError)return queryResponse(401,{error:{code:'UNAUTHENTICATED',message:'Autenticación requerida.'}});
        if(error instanceof RequestError)return queryResponse(error.status,{error:{code:error.status===413?'PAYLOAD_TOO_LARGE':error.status===415?'UNSUPPORTED_MEDIA_TYPE':'INVALID_REQUEST',message:'Solicitud no válida.'}});
        if(error instanceof InvalidValueError)return queryResponse(400,{error:{code:'INVALID_REQUEST',message:'Solicitud no válida.'}});
        if(error instanceof AccessDeniedError || error instanceof NotFoundError)return queryResponse(404,{error:{code:'NOT_FOUND',message:'Recurso no disponible.'}});
        if(error instanceof IncompatibleStateError || error instanceof VersionConflictError || error instanceof DuplicateError)return queryResponse(409,{error:{code:'CONFLICT',message:'No se cumplen las condiciones de asociación o envío.'}});
        return unavailableQuery();
      }
    };
  }
  return Object.freeze({associateEvidence:handler('associate'),listEvidence:handler('list'),submitReport:handler('submit'),getSubmission:handler('submission')});
}
