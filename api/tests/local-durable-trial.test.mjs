import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpRequest } from '@azure/functions';
import { createDurableTrial, assertTrialEnvironment, trialScope, assertLocalTrialHost } from '../.local-build/composition/localDurableTrial.js';
import { createApplicationHandlers, createLocalAuthorization, createLocalQueryHandlers } from '../.local-build/composition/queries.js';
import { FichaAuthorizationService } from '../.local-build/application/authorization/service.js';
import { MemoryUnitOfWork } from '../.local-build/infrastructure/memory/unitOfWork.js';
import { reportTools } from '../.local-build/infrastructure/reportTools.js';
import { AuthenticationError } from '../.local-build/infrastructure/identity/errors.js';
import { createEntraIdentityValidator } from '../.local-build/infrastructure/identity/validator.js';
import { validateConfiguration } from '../.local-build/infrastructure/identity/config.js';
import { signedToken, firstKey } from './fixtures/identity.mjs';
import { captureTrialConfiguration, runHttpTrial } from '../scripts/l8e4-http-trial.mjs';
import { readFile } from 'node:fs/promises';

const objectId = '33333333-3333-4333-8333-333333333333'; // Synthetic only.
const at = '2000-01-01T00:10:00.000Z';
const clock = { now: () => at };
const configuration = { enabled: 'L8E4_R01', tenantId: trialScope.tenantId, objectId,
  validFrom: '2000-01-01T00:00:00.000Z', validUntil: '2000-01-01T00:30:00.000Z', mode: 'write' };
const principal = { tenantId: trialScope.tenantId, objectId, audience: trialScope.audience, scopes: ['access_as_user'],
  expiresAt: '2000-01-01T01:00:00.000Z' };
const identity = { async validateAuthorization(value) { if (value !== 'Bearer test') throw new AuthenticationError('INVALID_TOKEN'); return principal; } };
const raw = overrides => JSON.stringify({ ...configuration, ...overrides });
function trial(overrides = {}, guard = () => {}) { return createDurableTrial(raw(overrides), clock, guard); }
function seed(overrides = {}) {
  const version = 'synthetic-version';
  const user = { id: trialScope.userId, tenantId: trialScope.tenantId, directoryObjectId: objectId, alias: 'Sintetico', enabled: true, version };
  const ficha = { id: trialScope.fichaId, dependencyId: 'synthetic-dep', cycleLabel: 'Sintetico', version };
  const assignments = ['read','edit'].map(kind => ({ id: kind === 'read' ? trialScope.readAssignment : trialScope.editAssignment,
    userId: user.id, fichaId: ficha.id, capability: kind === 'read' ? 'poc:read' : 'poc:edit-report', enabled: true,
    validFrom: configuration.validFrom, validUntil: configuration.validUntil, version, ...overrides }));
  return { users: [user], dependencies: [{ id: 'synthetic-dep', label: 'Sintetico', version }], fichas: [ficha], assignments,
    activities: [{ id: trialScope.activityId, fichaId: ficha.id, description: 'Sintetico', version }] };
}
function request(overrides = {}) {
  return new HttpRequest({ method: 'POST', url: 'http://127.0.0.1:7071/api/poc/actividades/' + trialScope.activityId + '/reportes',
    headers: { authorization: 'Bearer test', 'content-type': 'application/json', 'idempotency-key': trialScope.key },
    params: { activityId: trialScope.activityId }, body: { string: JSON.stringify({ period: trialScope.period, quantity: trialScope.quantity, narrative: trialScope.narrative }) }, ...overrides });
}
test('default authorization remains denied even with the exact seeded assignment', async () => {
  const store = new MemoryUnitOfWork(seed());
  const auth = createLocalAuthorization(trialScope.tenantId, clock);
  assert.equal((await store.runAtomic(c => auth.decide(c, principal, trialScope.fichaId, 'poc:edit-report'))).allowed, false);
});
test('exact identity, ficha and enabled assignment use existing authorization service', async () => {
  const t = trial(), auth = new FichaAuthorizationService(trialScope.tenantId, clock, t.validity);
  const store = new MemoryUnitOfWork(seed());
  assert.equal((await store.runAtomic(c => auth.decide(c, principal, trialScope.fichaId, 'poc:edit-report'))).allowed, true);
  assert.equal((await store.runAtomic(c => auth.decide(c, principal, 'another-ficha', 'poc:edit-report'))).allowed, false);
});
for (const [label, overrides] of [ ['disabled',{enabled:false}], ['expired',{validUntil:at}], ['not-yet-valid',{validFrom:at}],
  ['wrong-id',{id:'another-assignment'}], ['wrong-user',{userId:'another-user'}], ['wrong-ficha',{fichaId:'another-ficha'}], ['unbounded',{validUntil:null}] ]) {
  test(`assignment ${label} cannot authorize`, () => {
    const a = seed().assignments[1]; assert.equal(trial().validity.isApplicable({...a,...overrides}, at), false);
  });
}
for (const overrides of [{enabled:'1'},{objectId:'invalid'},{tenantId:'11111111-1111-4111-8111-111111111111'},
  {fichaId:'arbitrary'},{validUntil:'2000-01-02T00:00:00.000Z'},{validUntil:at},{mode:'arbitrary'},{mode:'read'},{reportId:'extra'}]) {
  test('incomplete or widened activation fails with a sanitized error ' + JSON.stringify(overrides), () => {
    assert.throws(() => trial(overrides), error => { assert.equal(error.stack, undefined); assert.doesNotMatch(error.message,/33333333|invalid|arbitrary/); return true; });
  });
}
const environment = { PAI_POC_LOCAL_ONLY: '1', AZURE_FUNCTIONS_ENVIRONMENT:'Development', FUNCTIONS_WORKER_RUNTIME:'node',
  PAI_API_PERSISTENCE:'sql-local', WEBSITE_HOSTNAME:'localhost:7071', AzureWebJobsStorage:'UseDevelopmentStorage=true' };
test('complete local signals pass environment check, but cannot fabricate OS trust', () => {
  assert.doesNotThrow(() => assertTrialEnvironment(environment));
  // The actual test process is not the verified restricted Functions worker.
  assert.throws(() => assertLocalTrialHost());
});
for (const key of ['WEBSITE_SITE_NAME','WEBSITE_INSTANCE_ID','IDENTITY_ENDPOINT','MSI_ENDPOINT','CONTAINER_APP_NAME','FUNCTIONS_WORKER_RUNTIME_VERSION','NODE_OPTIONS','DOTNET_STARTUP_HOOKS','FUNCTIONS_WORKER_PROCESS_ARGUMENTS'])
  test('hosted/preloaded environment denied: ' + key, () => assert.throws(() => assertTrialEnvironment({...environment,[key]:'present'})));
for (const change of [{NODE_ENV:'production'},{PAI_POC_LOCAL_ONLY:undefined},{PAI_API_PERSISTENCE:'memory'},{WEBSITE_HOSTNAME:'0.0.0.0:7071'},
  {FUNCTIONS_WORKER_RUNTIME:'other'},{AZURE_FUNCTIONS_ENVIRONMENT:'Production'},{AzureWebJobsStorage:'something-else'}])
  test('inconsistent local signals denied: ' + Object.keys(change)[0], () => assert.throws(() => assertTrialEnvironment({...environment,...change})));
test('real OS guard rejects this process even if all environment flags are forged', () => {
  const before = {...process.env};
  try { Object.assign(process.env,environment); assert.throws(() => assertLocalTrialHost()); }
  finally { for(const key of Object.keys(process.env))if(!(key in before))delete process.env[key];Object.assign(process.env,before); }
});
test('invalid/missing Bearer remains 401 and never reaches host guard or handler', async () => {
  let calls=0;const t=trial({},()=>{calls++;});const restricted=t.restrictIdentity(identity);
  const h=t.wrap(()=>{calls++;return {status:201};},restricted,'create');
  const response=await h(request({headers:{authorization:'Bearer invalid'}}));
  assert.equal(response.status,401);assert.equal(response.headers['WWW-Authenticate'],'Bearer');assert.equal(calls,0);
});
test('another validated object ID or tenant is denied', async () => {
  for(const overrides of [{objectId:'44444444-4444-4444-8444-444444444444'},{tenantId:'11111111-1111-4111-8111-111111111111'}]){
    const t=trial();const i=t.restrictIdentity({async validateAuthorization(){return {...principal,...overrides};}});
    assert.equal((await t.wrap(()=>({status:201}),i,'create')(request())).status,404);
  }
});
test('only one handler dispatch, including parallel requests, with exact approved body', async () => {
  let calls=0;const t=trial();const i=t.restrictIdentity(identity);
  const h=t.wrap(async()=>{calls++;return {status:201};},i,'create');
  const results=await Promise.all([h(request()),h(request())]);
  assert.equal(calls,1);assert.deepEqual(results.map(r=>r.status).sort(),[201,404]);
});
for(const overrides of [{params:{activityId:'another-activity'}},{method:'PATCH'},
  {headers:{authorization:'Bearer test','idempotency-key':'another-key'}},
  {url:'http://127.0.0.1:7071/test?fichaId=arbitrary'},
  {body:{string:JSON.stringify({period:'arbitrary',quantity:trialScope.quantity,narrative:trialScope.narrative})}},
  {body:{string:JSON.stringify({period:trialScope.period,quantity:trialScope.quantity,narrative:trialScope.narrative,actorId:'injected'})}}])
  test('HTTP input cannot widen the trial: '+JSON.stringify(overrides),async()=>{
    let calls=0;const t=trial();const result=await t.wrap(()=>{calls++;return {status:201};},t.restrictIdentity(identity),'create')(request(overrides));
    assert.equal(result.status,404);assert.equal(calls,0);
  });
test('read mode only reads the approved receipt and disables creation/PATCH',async()=>{
  const t=trial({mode:'read',reportId:'synthetic-report'});const i=t.restrictIdentity(identity);
  const h=t.wrap(()=>({status:200}),i,'get');
  assert.equal((await h(request({method:'GET',params:{reportId:'synthetic-report'},body:undefined}))).status,200);
  assert.equal((await h(request({method:'GET',params:{reportId:'another-report'},body:undefined}))).status,404);
  assert.equal((await t.wrap(()=>({status:201}),i,'create')(request())).status,404);
  assert.equal((await t.wrap(()=>({status:200}),i,'deny')(request())).status,404);
});
test('host-guard and handler errors never expose originals or private identity',async()=>{
  for(const guardFailed of [true,false]){
    const secret='EMPRESA\\usuario.prueba C:\\Privado password=ficticia';
    const t=trial({},()=>{if(guardFailed)throw new Error(secret);});
    const result=await t.wrap(()=>{throw new Error(secret);},t.restrictIdentity(identity),'create')(request());
    assert.equal(result.status,500);assert.doesNotMatch(JSON.stringify(result),/Privado|EMPRESA|password|33333333|stack/);
  }
});
test('existing application handlers can create only through the scoped policy using a memory double',async()=>{
  const t=trial(),i=t.restrictIdentity(identity),store=new MemoryUnitOfWork(seed());
  const auth=new FichaAuthorizationService(trialScope.tenantId,clock,t.validity);
  const handlers=createApplicationHandlers(i,store,auth,clock,reportTools);
  const result=await t.wrap(handlers.createReport,i,'create')(request());
  assert.equal(result.status,201);assert.equal(result.jsonBody.data.activityId,trialScope.activityId);
});
test('unavailable configuration cannot turn trial on with memory persistence',()=>{
  const handlers=createLocalQueryHandlers('{}','memory',undefined,raw());assert.equal(handlers.createReport().status,500);
});
const actualConfig=validateConfiguration({tenantId:trialScope.tenantId,audience:trialScope.audience,requiredScope:'access_as_user',
  metadataUrl:`https://login.microsoftonline.com/${trialScope.tenantId}/v2.0/.well-known/openid-configuration`,
  jwksUrl:`https://login.microsoftonline.com/${trialScope.tenantId}/discovery/v2.0/keys`,tokenVersion:'2.0',clockToleranceSeconds:30,
  allowedClientIds:['44444444-4444-4444-8444-444444444444']});
const jwtValidator=createEntraIdentityValidator(actualConfig,{clock,keyProvider:{async resolve(){return firstKey.publicKey;}}});
test('capture uses a cryptographically validated JWT, rejects forged JWT and never writes a token',async()=>{
  const token=await signedToken({iss:actualConfig.issuer,aud:trialScope.audience,tid:trialScope.tenantId,oid:objectId,scp:'access_as_user',exp:Date.parse(at)/1000+1800,nbf:Date.parse(at)/1000-60});
  const captured=await captureTrialConfiguration(jwtValidator,'Bearer '+token,Date.parse(at));
  assert.equal(captured.objectId,objectId);assert.equal(captured.tenantId,trialScope.tenantId);
  assert.equal(captured.mode,'write');assert.doesNotMatch(JSON.stringify(captured),new RegExp(token.slice(0,30)));
  await assert.rejects(captureTrialConfiguration(jwtValidator,'Bearer invalid',Date.parse(at)));
});
test('prepared HTTP client sends one fixed POST with no caller-selected scope, projects only receipt',async()=>{
  const now=Date.now();const cfg={...configuration,validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+600000).toISOString()};
  let calls=0;
  const result=await runHttpTrial(identity,'Bearer test',cfg,async(url,options)=>{
    calls++;assert.equal(url,'http://127.0.0.1:7071/api/poc/actividades/'+trialScope.activityId+'/reportes');
    assert.equal(options.method,'POST');assert.equal(options.headers['Idempotency-Key'],trialScope.key);
    assert.equal(JSON.parse(options.body).quantity,trialScope.quantity);
    return new Response(JSON.stringify({data:{id:'synthetic-report',activityId:trialScope.activityId,period:trialScope.period,version:'rv1:0000000000000001',secret:'do-not-project'}}),{status:201});
  });
  assert.equal(calls,1);assert.equal(result.status,'OK');assert.doesNotMatch(JSON.stringify(result),/secret|33333333|Bearer/);
});
test('prepared HTTP client neither retries nor exposes driver/network messages after ambiguity',async()=>{
  const now=Date.now();const cfg={...configuration,validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+600000).toISOString()};
  let calls=0;const result=await runHttpTrial(identity,'Bearer test',cfg,async()=>{calls++;throw new Error('C:\\Privado token=synthetic');});
  assert.equal(calls,1);assert.equal(result.status,'FAILED');assert.equal(result.dispatched,true);
  assert.doesNotMatch(JSON.stringify(result),/Privado|synthetic|token/);
});
test('OS guard checks actual identity, pinned binaries, owning PID and loopback, not just environment',async()=>{
  const source=await readFile(new URL('../scripts/check-l8e4-host.ps1',import.meta.url),'utf8');
  for(const required of ['WindowsIdentity]::GetCurrent','IsInRole','GetOwnerSid','Get-FileHash','Get-NetTCPConnection','127.0.0.1','OwningProcess'])assert.ok(source.includes(required));
  const ignore=await readFile(new URL('../.funcignore',import.meta.url),'utf8');assert.ok(ignore.split(/\r?\n/).includes('**'));
});

test('PowerShell launcher captures identity privately, restores env, rejects repeat POST and gates SQL (all doubles)', async()=>{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const child=spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('./l8e4-session.synthetic.ps1',import.meta.url))],
    {encoding:'utf8',windowsHide:true,shell:false,timeout:10000,
      env:{...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'}});
  assert.equal(child.status,0,child.stderr);assert.equal(child.stderr,'');
  assert.doesNotMatch(child.stdout,/33333333-3333|synthetic-password|synthetic-account|objectId/);
  const result=JSON.parse(child.stdout.trim().split(/\r?\n/).at(-1));
  assert.deepEqual(result,{status:'OK',syntheticChecks:32,realChildren:0,sqlConnections:0,httpRequests:0,writes:0});
});

test('read-only preflight proves validated identity and guard without calling the application',async()=>{
  let calls=0;const t=trial();const i=t.restrictIdentity(identity);
  const handler=t.wrap(()=>{calls++;throw new Error('Application must not run');},i,'deny');
  const good=new HttpRequest({method:'GET',url:'http://127.0.0.1:7071/api/poc/fichas/'+trialScope.fichaId,
    headers:{authorization:'Bearer test','x-pai-l8e4-probe':'1'},params:{fichaId:trialScope.fichaId}});
  const response=await handler(good);assert.equal(response.status,404);
  assert.equal(response.headers['X-PAI-L8E4-Guard'],'verified');assert.equal(calls,0);
  const bad=await handler(new HttpRequest({method:'GET',url:good.url,headers:{authorization:'Bearer invalid','x-pai-l8e4-probe':'1'}}));
  assert.equal(bad.status,401);assert.equal(bad.headers['X-PAI-L8E4-Guard'],undefined);
});
test('preflight client only uses fixed GET and rejects a plain 404 without guard proof',async()=>{
  const now=Date.now();const cfg={...configuration,validFrom:new Date(now-1000).toISOString(),validUntil:new Date(now+600000).toISOString()};
  for(const proof of [true,false]){
    let calls=0;
    const result=await runHttpTrial(identity,'Bearer test',cfg,async(url,options)=>{
      calls++;assert.equal(options.method,'GET');assert.equal(options.body,undefined);
      assert.equal(url,'http://127.0.0.1:7071/api/poc/fichas/'+trialScope.fichaId);
      return new Response(JSON.stringify({error:{code:'NOT_FOUND'}}),{status:404,headers:proof?{'X-PAI-L8E4-Guard':'verified'}:{}});
    },true);
    assert.equal(calls,1);assert.equal(result.status,proof?'OK':'FAILED');assert.equal(result.writes,0);
  }
});
test('interactive harness keeps Vite untouched and uses a fixed independent loopback port',async()=>{
  const source=await readFile(new URL('../scripts/l8e4-http-trial.mjs',import.meta.url),'utf8');
  assert.match(source,/const browserPort = 5174/);assert.match(source,/server.listen\(browserPort, '127.0.0.1'\)/);
  assert.match(source,/redirectUri:c.redirectUri/);assert.doesNotMatch(source,/localhost:5173|127\.0\.0\.1:5173/);
});

test('restricted bootstrap without its private environment fails before opening any host',async()=>{
  const {spawnSync}=await import('node:child_process');
  const {fileURLToPath}=await import('node:url');
  const env={...process.env,PSModulePath:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\Modules'};
  delete env.PAI_API_IDENTITY_CONFIG;delete env.PAI_L8E4_TRIAL;
  const child=spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',fileURLToPath(new URL('../scripts/start-l8e4-restricted-child.ps1',import.meta.url))],
    {env,encoding:'utf8',windowsHide:true,shell:false,timeout:5000});
  assert.equal(child.status,1);assert.equal(child.stderr,'');
  assert.deepEqual(JSON.parse(child.stdout),{status:'FAILED',category:'RESTRICTED_CHILD_START_FAILED'});
});
