import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createEntraIdentityValidator } from '../.local-build/infrastructure/identity/validator.js';
import { validateConfiguration } from '../.local-build/infrastructure/identity/config.js';
import { trialScope, validateTrialConfiguration } from '../.local-build/composition/localDurableTrial.js';

const clock = { now: () => new Date().toISOString() };
const browserPort = 5174; // Keep Vite/5173 untouched; Entra's documented localhost port equivalence applies.
const failed = () => ({ status: 'FAILED', category: 'L8E4_HTTP_TRIAL_FAILED' });
export async function captureTrialConfiguration(validator, bearer, now = Date.now()) {
  const identity = await validator.validateAuthorization(bearer);
  if (identity.tenantId !== trialScope.tenantId || identity.audience !== trialScope.audience
    || !identity.scopes.includes('access_as_user')) throw new Error('L8E4_IDENTITY_REJECTED');
  // Only the output of the unchanged JWT validator supplies the personal object ID.
  return validateTrialConfiguration({ enabled: 'L8E4_R01', tenantId: identity.tenantId, objectId: identity.objectId,
    validFrom: new Date(now - 60000).toISOString(),
    validUntil: new Date(Math.min(now + 29 * 60000, Date.parse(identity.expiresAt) - 30000)).toISOString(),
    mode: 'write' }, { now: () => new Date(now).toISOString() });
}
export async function runHttpTrial(validator, bearer, configuration, request = fetch, preflight = false) {
  let dispatched = false;
  try {
    const config = validateTrialConfiguration(configuration, clock);
    const identity = await validator.validateAuthorization(bearer);
    if (identity.tenantId !== config.tenantId || identity.objectId !== config.objectId
      || identity.audience !== trialScope.audience || !identity.scopes.includes('access_as_user')) return failed();
    const write = !preflight && config.mode === 'write';
    const route = preflight ? '/api/poc/fichas/' + trialScope.fichaId
      : write ? '/api/poc/actividades/' + trialScope.activityId + '/reportes' : '/api/poc/reportes/' + config.reportId;
    dispatched = true;
    const response = await request('http://127.0.0.1:7071' + route, { method: write ? 'POST' : 'GET',
      redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: bearer,
        ...(preflight ? { 'X-PAI-L8E4-Probe': '1' } : {}),
        ...(write ? { 'Content-Type': 'application/json', 'Idempotency-Key': trialScope.key } : {}) },
      ...(write ? { body: JSON.stringify({ period: trialScope.period, quantity: trialScope.quantity, narrative: trialScope.narrative }) } : {}) });
    const body = await response.json();
    if (preflight) return response.status === 404 && response.headers.get('x-pai-l8e4-guard') === 'verified'
      && body?.error?.code === 'NOT_FOUND'
      ? { status: 'OK', httpStatus: 404, guardPositive: true, identityMatch: true, writes: 0 }
      : { ...failed(), httpStatus: response.status, guardPositive: false, writes: 0 };
    const data = body?.data;
    if (response.status !== (write ? 201 : 200) || !data || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(data.id)
      || data.activityId !== trialScope.activityId || data.period !== trialScope.period
      || !/^rv1:[0-9a-f]{16}$/.test(data.version)
      || (!write && (data.id !== config.reportId || data.quantity !== trialScope.quantity || data.narrative !== trialScope.narrative
        || data.state !== 'poc-draft' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(data.createdAt)
        || data.createdAt !== data.updatedAt))) return { ...failed(), dispatched, httpStatus: response.status };
    return { status: 'OK', dispatched, httpStatus: response.status, reportId: data.id,
      activityId: data.activityId, period: data.period, version: data.version };
  } catch { return { ...failed(), dispatched }; }
}
async function publicConfiguration() {
  const lines = (await readFile(new URL('../../.env.local', import.meta.url), 'utf8')).split(/\r?\n/);
  const clientLines = lines.filter(line => line.startsWith('VITE_ENTRA_CLIENT_ID='));
  if (clientLines.length !== 1) throw new Error();
  const clientId = clientLines[0].slice('VITE_ENTRA_CLIENT_ID='.length).trim().replace(/^['"]|['"]$/g, '').toLowerCase();
  const tenantId = trialScope.tenantId;
  return validateConfiguration({ tenantId, audience: trialScope.audience, requiredScope: 'access_as_user',
    metadataUrl: `https://login.microsoftonline.com/${tenantId}/v2.0/.well-known/openid-configuration`,
    jwksUrl: `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`, tokenVersion: '2.0',
    clockToleranceSeconds: 30, allowedClientIds: [clientId] });
}
const browserScript = `(async()=>{
 if(window.opener)return;
 const button=document.querySelector('button'),out=document.querySelector('pre');
 try{
 const c=await(await fetch('/config')).json();
 const ms=new msal.PublicClientApplication({auth:{clientId:c.clientId,authority:c.authority,redirectUri:c.redirectUri},cache:{cacheLocation:'memoryStorage',temporaryCacheLocation:'memoryStorage'},system:{loggerOptions:{piiLoggingEnabled:false,loggerCallback:()=>{}}}});
 await ms.initialize();button.disabled=false;
 button.onclick=async()=>{button.disabled=true;let token=null,result=null;
 try{result=await ms.acquireTokenPopup({scopes:[c.scope],prompt:'select_account'});token=result.accessToken;
 const response=await fetch('/capture',{method:'GET',headers:{Authorization:'Bearer '+token,'X-PAI-Trial':'1'},cache:'no-store'});
 out.textContent=JSON.stringify(await response.json());}
 catch{out.textContent='{"status":"FAILED","category":"INTERACTIVE_TRIAL_FAILED"}';}
 finally{token=null;result=null;try{await ms.clearCache();}catch{}out.textContent+=' Token descartado. Cierra esta pestaña.';}};
 }catch{out.textContent='{"status":"FAILED","category":"HARNESS_CONFIG_FAILED"}';}
})();`;
async function main() {
  const mode = process.argv[2];
  if (!['--capture-private-pipe','--preflight','--post-approved','--read-approved'].includes(mode) || process.argv.length !== 3
    || process.platform !== 'win32' || process.env.NODE_ENV === 'production'
    || ['WEBSITE_SITE_NAME','WEBSITE_INSTANCE_ID','IDENTITY_ENDPOINT','MSI_ENDPOINT','CONTAINER_APP_NAME'].some(k => !!process.env[k])) throw new Error();
  const config = await publicConfiguration();
  const validator = createEntraIdentityValidator(config);
  const privateTrial = mode === '--capture-private-pipe' ? null : validateTrialConfiguration(JSON.parse(process.env.PAI_L8E4_TRIAL ?? ''), clock);
  if (privateTrial && mode !== '--preflight' && privateTrial.mode !== (mode === '--post-approved' ? 'write' : 'read')) throw new Error();
  let used = false;
  let done;
  const finished = new Promise(resolve => { done = resolve; });
  const json = (res, status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' }); res.end(JSON.stringify(data)); };
  const server = createServer(async (req, res) => {
    let bearer = null;
    let terminal = false;
    try {
      if (!['localhost:' + browserPort,'127.0.0.1:' + browserPort].includes(req.headers.host) || req.method !== 'GET'
        || req.url?.includes('?') || req.headers.origin && req.headers.origin !== 'http://localhost:' + browserPort) { json(res,403,failed()); return; }
      if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; connect-src 'self' https://login.microsoftonline.com; frame-src https://login.microsoftonline.com; object-src 'none'; base-uri 'none'" });
        res.end('<!doctype html><meta charset="utf-8"><title>PAI — ensayo local</title><h1>Ensayo local L8-E4</h1><p>Inicia sesión solo en Microsoft; cancela si solicita consentimiento nuevo. No copies tokens.</p><button disabled>Continuar una sola vez</button><pre>Preparando…</pre><script src="/msal.js"></script><script src="/browser.js"></script>'); return;
      }
      if (req.url === '/config') { json(res,200,{ clientId: config.allowedClientIds[0], authority: 'https://login.microsoftonline.com/' + config.tenantId, scope: 'api://' + config.audience + '/access_as_user', redirectUri: 'http://localhost:' + browserPort + '/' }); return; }
      if (req.url === '/msal.js' || req.url === '/browser.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        res.end(req.url === '/browser.js' ? browserScript : await readFile(new URL('../../node_modules/@azure/msal-browser/lib/msal-browser.min.js', import.meta.url))); return;
      }
      if (req.url !== '/capture' || req.headers['x-pai-trial'] !== '1' || used) { json(res,409,failed()); return; }
      used = true;
      terminal = true;
      bearer = req.headers.authorization;
      if (typeof bearer !== 'string' || bearer.length > 32768) throw new Error();
      if (!privateTrial) {
        const captured = await captureTrialConfiguration(validator, bearer);
        // PRIVATE child->parent pipe; the PowerShell launcher captures this, never displays or saves it.
        process.stdout.write(JSON.stringify(captured));
        json(res,200,{status:'OK',validatedIdentityCaptured:true,personalIdentifiersDisplayed:false});
      } else {
        const result = await runHttpTrial(validator,bearer,privateTrial,fetch,mode === '--preflight');
        process.stdout.write(JSON.stringify(result)); json(res,200,result);
        if (result.status !== 'OK') process.exitCode = 1;
      }
    } catch { terminal = true; used = true; process.stdout.write(JSON.stringify(failed())); json(res,500,failed()); process.exitCode = 1; }
    finally {
      bearer = null;
      if (terminal) { if (res.writableFinished) done(); else res.once('finish', done); }
    }
  });
  server.on('error', () => { process.exitCode = 1; done(); });
  const deadline = setTimeout(() => { process.exitCode = 1; done(); }, 600000);
  server.listen(browserPort, '127.0.0.1');
  try { await finished; } finally { clearTimeout(deadline); server.close(); server.closeAllConnections(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.log(JSON.stringify(failed())); process.exitCode = 1; });
}
