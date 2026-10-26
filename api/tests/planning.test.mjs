import test from 'node:test';
import assert from 'node:assert/strict';
import { planningStates, planningState, requireSubmissionEvidence } from '../.local-build/domain/planning.js';

test('Planning vocabulary has seven defined states and no independent approval step',()=>{
  assert.deepEqual(planningStates,['Abierto','Enviado','En revisión','Devuelto con observación','Validado','Socializado','Cierre del informe']);
  for(const name of planningStates)assert.equal(planningState(name),name);
  for(const value of ['Aprobado','En aprobación','validado','poc-draft',''])assert.throws(()=>planningState(value),e=>e.code==='INVALID_VALUE');
  assert.equal(Object.isFrozen(planningStates),true);
});
test('scheduled advance requires evidence before sending; no state transition is implied',()=>{
  assert.throws(()=>requireSubmissionEvidence(true,[]),e=>e.code==='INVALID_VALUE');
  requireSubmissionEvidence(true,['synthetic-evidence-1']);
  requireSubmissionEvidence(false,[]);
});
for(const refs of [[''],['   '],['synthetic\ninvalid'],[null],null])test('malformed evidence references rejected: '+JSON.stringify(refs),()=>{
  assert.throws(()=>requireSubmissionEvidence(true,refs),e=>e.code==='INVALID_VALUE');
});
