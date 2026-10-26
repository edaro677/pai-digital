import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import Module from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {HttpRequest} from '@azure/functions';
import {selectPersistence,createPersistence,createLocalQueryHandlers,createApplicationHandlers,createLocalAuthorization} from '../.local-build/composition/queries.js';
import {createLocalSqlUnitOfWork} from '../.local-build/composition/sql.js';
import {MemoryUnitOfWork} from '../.local-build/infrastructure/memory/unitOfWork.js';
import {SqlUnitOfWork} from '../.local-build/infrastructure/sql/unitOfWork.js';
import {reportTools} from '../.local-build/infrastructure/reportTools.js';
import {health} from '../.local-build/http/health.js';
import {entityId} from '../.local-build/domain/types.js';
import {configuration} from './fixtures/identity.mjs';
import {fixtures} from './fixtures/memory.mjs';

let load,fetch,nativeLoads=0;
before(()=>{
  load=Module._load;fetch=globalThis.fetch;
  Module._load=function(name,...args){
    if(name==='mssql/msnodesqlv8.js'||name==='msnodesqlv8'){nativeLoads++;throw new Error('Native loading blocked by test');}
    return load.call(this,name,...args);
  };
  globalThis.fetch=async()=>{throw new Error('Network disabled by test');};
});
after(()=>{Module._load=load;globalThis.fetch=fetch;assert.equal(nativeLoads,0);});

test('fresh process: importing composition and building either mode never loads the native driver',()=>{
  const code=`import Module from 'node:module';
    const original=Module._load;let attempts=0;
    Module._load=function(name,...args){if(name.includes('mssql')||name.includes('msnodesqlv8')){attempts++;throw new Error('Native blocked');}return original.call(this,name,...args);};
    const c=await import('./.local-build/composition/queries.js');
    for(const mode of [undefined,'memory','sql-local'])c.createPersistence(mode);
    const h=await import('./.local-build/http/health.js');
    if(attempts!==0||h.health().status!==200)process.exitCode=1;
    console.log(JSON.stringify({nativeLoads:attempts,health:h.health().status}));`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),encoding:'utf8',windowsHide:true,shell:false,
  });
  assert.equal(result.status,0);assert.equal(result.stderr,'');
  assert.deepEqual(JSON.parse(result.stdout),{nativeLoads:0,health:200});
});

for(const value of [undefined,'memory'])test(`selector ${String(value)} selects memory only`,()=>{
  const memory={},sql={};let memories=0,sqls=0;
  assert.equal(selectPersistence(value),'memory');
  assert.equal(createPersistence(value,{memory:()=>{memories++;return memory;},sqlLocal:()=>{sqls++;return sql;}}),memory);
  assert.equal(memories,1);assert.equal(sqls,0);
  assert.ok(createPersistence(value) instanceof MemoryUnitOfWork);
});

test('sql-local selects exactly the SQL factory, without native loading or connections',()=>{
  const marker={};let sqls=0;
  const selected=createPersistence('sql-local',{memory:()=>{throw new Error('Unexpected memory');},sqlLocal:()=>{sqls++;return marker;}});
  assert.equal(selected,marker);assert.equal(sqls,1);
  assert.ok(createPersistence('sql-local') instanceof SqlUnitOfWork);
  assert.equal(nativeLoads,0);
});

for(const value of ['', 'SQL-LOCAL',' memory','sql-local ','other','password=synthetic'])
  test(`unknown selector fails closed (${JSON.stringify(value)})`,()=>{
    let factories=0;
    assert.throws(()=>createPersistence(value,{memory:()=>{factories++;},sqlLocal:()=>{factories++;}}),e=>{
      assert.equal(e.message,'Configuración de persistencia no válida.');assert.equal(e.stack,undefined);return true;
    });assert.equal(factories,0);
  });

test('SQL factory construction failure never falls back and HTTP errors remain generic',()=>{
  let memories=0,sqls=0;
  const factories={memory:()=>{memories++;return new MemoryUnitOfWork();},sqlLocal:()=>{sqls++;throw new Error('EMPRESA\\usuario C:\\Privado password=synthetic');}};
  const handlers=createLocalQueryHandlers(JSON.stringify(configuration),'sql-local',factories);
  for(const name of ['ficha','actividades','getReport','createReport','updateReport']){
    const r=handlers[name]();assert.equal(r.status,500);assert.equal(r.jsonBody.error.code,'INTERNAL_ERROR');
    assert.doesNotMatch(JSON.stringify(r),/usuario|Privado|password|stack/);
  }
  assert.equal(sqls,1);assert.equal(memories,0);
});

test('invalid selector produces unavailable handlers without constructing either adapter',()=>{
  let calls=0;const build=()=>{calls++;throw new Error('Unexpected construction');};
  const handlers=createLocalQueryHandlers(JSON.stringify(configuration),'invalid',{memory:build,sqlLocal:build});
  assert.equal(handlers.ficha().status,500);assert.equal(calls,0);
});

test('SQL UoW factory runs only an injected transport double and retains transaction lifecycle',async()=>{
  const events=[];
  const transport={async connect(){events.push('connect');return {
    async begin(level){events.push(level);return {async execute(){return [];},async commit(){events.push('commit');},async rollback(){events.push('rollback');}};},
    async close(){events.push('close');}
  };}};
  const uow=createLocalSqlUnitOfWork(transport);assert.deepEqual(events,[]);
  assert.equal(await uow.runAtomic(async()=>17),17);
  assert.deepEqual(events,['connect','SERIALIZABLE','commit','close']);
});

test('queries and reports use the same selected UoW; local assignment policy still denies',async()=>{
  const f=fixtures(),store=new MemoryUnitOfWork(f.seed),clock={now:()=>f.now};
  let calls=0;
  const work={runAtomic(callback){assert.equal(this,work);calls++;return store.runAtomic(callback);}};
  const principal={tenantId:f.seed.users[0].tenantId,objectId:f.seed.users[0].directoryObjectId,clientId:configuration.allowedClientIds[0]};
  const identity={async validateAuthorization(){return principal;}}; // Test-only injected double.
  const auth=createLocalAuthorization(entityId('tenant',configuration.tenantId),clock);
  const handlers=createApplicationHandlers(identity,work,auth,clock,reportTools);
  const get=params=>new HttpRequest({method:'GET',url:'http://127.0.0.1/api/poc/test',params});
  assert.equal((await handlers.ficha(get({fichaId:f.fichaAlpha}))).status,404);
  assert.equal((await handlers.actividades(get({fichaId:f.fichaAlpha}))).status,404);
  assert.equal((await handlers.getReport(get({reportId:'missing-report'}))).status,404);
  assert.equal(calls,3);
  assert.equal((await store.runAtomic(c=>auth.decide(c,principal,f.fichaAlpha,'poc:read'))).allowed,false);
});

for(const mode of [undefined,'memory','sql-local'])test(`local ${String(mode)} authenticates before persistence and keeps health isolated`,async()=>{
  let calls=0;const work={async runAtomic(){calls++;throw new Error('No persistence before authentication');}};
  const handlers=createLocalQueryHandlers(JSON.stringify(configuration),mode,{memory:()=>work,sqlLocal:()=>work});
  const request=new HttpRequest({method:'GET',url:'http://127.0.0.1/api/poc/test',params:{fichaId:'test'}});
  assert.equal((await handlers.ficha(request)).status,401);assert.equal(calls,0);
  assert.equal(health().status,200);assert.equal(nativeLoads,0);
});

test('local composition failure emits only a fixed stage and presence flags, never private configuration',()=>{
  const saved=process.env.PAI_POC_LOCAL_ONLY,warning=console.warn;const logs=[];
  process.env.PAI_POC_LOCAL_ONLY='1';console.warn=value=>logs.push(JSON.parse(value));
  try{
    createLocalQueryHandlers(undefined,'sql-local',undefined,undefined);
    assert.deepEqual(logs,[{probe:'LOCAL_COMPOSITION_FAILURE',stage:'IDENTITY_CONFIGURATION',identityConfigurationPresent:false,trialConfigurationPresent:false,sqlLocalSelected:true}]);
    logs.length=0;
    createLocalQueryHandlers('private-invalid-token-and-identity','sql-local');
    assert.equal(logs[0].stage,'IDENTITY_CONFIGURATION');
    assert.doesNotMatch(JSON.stringify(logs),/private-invalid|stack|password|message/);
  }finally{console.warn=warning;if(saved===undefined)delete process.env.PAI_POC_LOCAL_ONLY;else process.env.PAI_POC_LOCAL_ONLY=saved;}
});

test('diagnostic headers require local sql-local AND the explicit probe; error contract stays unchanged',()=>{
  const saved=process.env.PAI_POC_LOCAL_ONLY,warn=console.warn;console.warn=()=>{};
  const request=new HttpRequest({method:'GET',url:'http://127.0.0.1/api/poc/fichas/x',headers:{'X-PAI-L8E4-Probe':'1'}});
  try{
    process.env.PAI_POC_LOCAL_ONLY='1';
    const h=createLocalQueryHandlers(undefined,'sql-local');const r=h.ficha(request);
    assert.equal(r.status,500);assert.equal(r.jsonBody.error.code,'INTERNAL_ERROR');
    assert.equal(r.headers['X-PAI-L8E4-Configuration-Stage'],'IDENTITY_CONFIGURATION');
    assert.equal(r.headers['X-PAI-L8E4-Identity-Present'],'0');
    assert.equal(h.ficha().headers['X-PAI-L8E4-Configuration-Stage'],undefined);
    assert.equal(createLocalQueryHandlers(undefined,'memory').ficha(request).headers['X-PAI-L8E4-Configuration-Stage'],undefined);
    delete process.env.PAI_POC_LOCAL_ONLY;
    assert.equal(h.ficha(request).headers['X-PAI-L8E4-Configuration-Stage'],undefined);
  }finally{console.warn=warn;if(saved===undefined)delete process.env.PAI_POC_LOCAL_ONLY;else process.env.PAI_POC_LOCAL_ONLY=saved;}
});
