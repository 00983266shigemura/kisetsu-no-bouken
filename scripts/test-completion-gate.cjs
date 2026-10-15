'use strict';
const assert = require('node:assert/strict');
const {evaluate,digestContract} = require('./completion-gate.cjs');
const fs = require('node:fs');
const contract = JSON.parse(fs.readFileSync('ops/completion/contract-v1.json','utf8'));
const sha256=digestContract(contract);
const anchor={contract_id:contract.contract_id,revision:contract.revision,sha256,approval_ref:contract.approval.ref};
const targetRevision='PILOT-COMMIT-SHA-001';
const make = () => ({
 contract_digest:sha256, contract_revision:contract.revision,target_revision:targetRevision,
 authority:{authorized:true,approval_ref:contract.approval.ref},
 quality:{critical_findings:0},
 delivery:{verified:true,target_revision:targetRevision,receipt_ref:'evidence/real-delivery-receipt'},
 acceptance:Object.fromEntries(contract.acceptance.filter(x=>x.required).map(x=>[x.id,
  {status:'PASS',source:'evidence/observed-'+x.id,target_revision:targetRevision,
   ...(x.type==='E'?{rubric_ref:x.rubric_ref,critical_findings:0,
     counterevidence_reviewed:true,supporting_sources:['primary/source-a','independent/source-b'],
     reviewer:'assurance-agent',producer:'execution-agent'}:{})}
 ]))
});
const verify=(x,c=contract,a=anchor,t=targetRevision)=>evaluate({contract:c,anchor:a,evidence:x,targetRevision:t});
let n=0;
function check(label,ok,expr){assert.equal(expr.status,ok?'VERIFIED_DELIVERED':'BLOCKED',label);n++;}
check('positive reference',true,verify(make()));
let x=make();delete x.acceptance['AC-G01'];check('gate omission',false,verify(x));
x=make();x.acceptance['AC-G01'].status='FAIL';check('QA fail',false,verify(x));
x=make();x.authority.authorized=false;check('insufficient authority',false,verify(x));
x=make();x.contract_revision='0.0.0';check('stale contract revision',false,verify(x));
x=make();x.target_revision='OTHER';check('wrong target revision',false,verify(x));
x=make();x.quality.critical_findings=1;check('critical findings',false,verify(x));
x=make();x.delivery.verified=false;check('failed delivery',false,verify(x));
x=make();delete x.acceptance['AC-Q01'].rubric_ref;check('unrubricated quality',false,verify(x));
x=make();x.acceptance['AC-Q01'].reviewer=x.acceptance['AC-Q01'].producer;check('self approval',false,verify(x));
x=make();x.acceptance['AC-Q01'].counterevidence_reviewed=false;check('missing counterevidence',false,verify(x));
x=make();x.acceptance['AC-Q01'].supporting_sources=['only-one'];check('weak independent sources',false,verify(x));
let c=structuredClone(contract);c.acceptance=c.acceptance.filter(a=>a.id!=='AC-G02');
check('required AC deleted',false,verify(make(),c));
c=structuredClone(contract);c.acceptance.find(a=>a.id==='AC-G01').required=false;
check('required AC relaxed',false,verify(make(),c));
c=structuredClone(contract);c.acceptance=c.acceptance.filter(a=>a.id!=='AC-G02');
x=make();x.contract_digest=digestContract(c);
check('contract and digest both altered',false,verify(x,c));
c=structuredClone(contract);c.acceptance.find(a=>a.id==='AC-H01').required=true;
check('unauthorized extra human gate',false,verify(make(),c));
c=structuredClone(contract);c.acceptance.push(structuredClone(c.acceptance[0]));
check('duplicate IDs',false,verify(make(),c));
x=make();delete x.delivery.receipt_ref;check('no delivery receipt',false,verify(x));
console.log('COMPLETION_GATE_FAULT_TESTS '+n+'/'+n+' PASS (synthetic verifier behavior only; no live delivery)');
