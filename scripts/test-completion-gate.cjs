'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const {evaluate,digestContract,attestPayload} = require('./completion-gate.cjs');
const contract=JSON.parse(fs.readFileSync('ops/completion/contract-v1.json','utf8'));
const sha256=digestContract(contract),targetRevision='PILOT-COMMIT-SHA-001';
const priv={};
const issuers={};
for(const [id,allowed_domains] of Object.entries({
  authority:['authority'], ci:['acceptance:D:AC-G01','acceptance:D:AC-G02','acceptance:D:AC-R01','delivery'],
  qa:['quality','acceptance:E:AC-Q01']
})){
 const {privateKey,publicKey}=crypto.generateKeyPairSync('ed25519');
 priv[id]=privateKey;
 issuers[id]={public_key_pem:publicKey.export({type:'spki',format:'pem'}),allowed_domains};
}
const anchor={contract_id:contract.contract_id,revision:contract.revision,sha256,approval_ref:contract.approval.ref,issuers};
const ctx={contract_digest:sha256,target_revision:targetRevision};
function seal(domain,record,issuer){
 record.attestation={issuer,signature:crypto.sign(null,Buffer.from(attestPayload(domain,record,ctx)),priv[issuer]).toString('base64')};
 return record;
}
const make=()=>{
 const ac={};
 for(const c of contract.acceptance.filter(x=>x.required)){
  const item={status:'PASS',source:'verified/source-'+c.id,target_revision:targetRevision};
  if(c.type==='E')Object.assign(item,{rubric_ref:c.rubric_ref,critical_findings:0,
   counterevidence_reviewed:true,supporting_sources:['primary/evidence','separate/countercheck'],
   reviewer:'assurance-agent',producer:'execution-agent'});
  ac[c.id]=seal('acceptance:'+c.type+':'+c.id,item,c.type==='E'?'qa':'ci');
 }
 return {contract_digest:sha256,contract_revision:contract.revision,target_revision:targetRevision,
  authority:seal('authority',{authorized:true,approval_ref:contract.approval.ref},'authority'),
  quality:seal('quality',{critical_findings:0},'qa'),
  delivery:seal('delivery',{verified:true,target_revision:targetRevision,receipt_ref:'verified/real-delivery'},'ci'),
  acceptance:ac};
};
const verify=(x,c=contract,a=anchor,t=targetRevision)=>evaluate({contract:c,anchor:a,evidence:x,targetRevision:t});
let n=0;
function check(label,ok,v){assert.equal(v.status,ok?'VERIFIED_DELIVERED':'BLOCKED',label);n++;}
check('positive signed fixture',true,verify(make()));
let x=make();delete x.acceptance['AC-G01'];check('gate omitted',false,verify(x));
x=make();x.acceptance['AC-G01'].status='FAIL';check('QA failed',false,verify(x));
x=make();x.authority.authorized=false;seal('authority',x.authority,'authority');check('explicit unauthorized',false,verify(x));
x=make();x.authority.attestation.signature='ZmFrZQ==';check('unauthorized signature',false,verify(x));
x=make();x.contract_revision='0.0.0';check('stale contract revision',false,verify(x));
x=make();x.target_revision='OTHER';check('wrong target revision',false,verify(x));
x=make();x.quality.critical_findings=1;seal('quality',x.quality,'qa');check('critical findings signed',false,verify(x));
x=make();x.delivery.verified=false;seal('delivery',x.delivery,'ci');check('delivery failed signed',false,verify(x));
x=make();delete x.acceptance['AC-Q01'].rubric_ref;seal('acceptance:E:AC-Q01',x.acceptance['AC-Q01'],'qa');check('quality rubric missing',false,verify(x));
x=make();x.acceptance['AC-Q01'].reviewer=x.acceptance['AC-Q01'].producer;seal('acceptance:E:AC-Q01',x.acceptance['AC-Q01'],'qa');check('self review signed',false,verify(x));
x=make();x.acceptance['AC-Q01'].counterevidence_reviewed=false;seal('acceptance:E:AC-Q01',x.acceptance['AC-Q01'],'qa');check('no contradiction check',false,verify(x));
x=make();x.acceptance['AC-Q01'].supporting_sources=['one'];seal('acceptance:E:AC-Q01',x.acceptance['AC-Q01'],'qa');check('one source only',false,verify(x));
let c=structuredClone(contract);c.acceptance=c.acceptance.filter(a=>a.id!=='AC-G02');check('AC deleted',false,verify(make(),c));
c=structuredClone(contract);c.acceptance.find(a=>a.id==='AC-G01').required=false;check('AC relaxed',false,verify(make(),c));
c=structuredClone(contract);c.acceptance=c.acceptance.filter(a=>a.id!=='AC-G02');x=make();x.contract_digest=digestContract(c);check('contract and digest both altered',false,verify(x,c));
c=structuredClone(contract);c.acceptance.find(a=>a.id==='AC-H01').required=true;check('unapproved human condition added',false,verify(make(),c));
c=structuredClone(contract);c.acceptance.push(structuredClone(c.acceptance[0]));check('duplicate AC IDs',false,verify(make(),c));
x=make();delete x.delivery.receipt_ref;seal('delivery',x.delivery,'ci');check('receipt missing',false,verify(x));
x=make();delete x.acceptance['AC-G01'].attestation;check('unsigned D evidence',false,verify(x));
x=make();seal('acceptance:E:AC-Q01',x.acceptance['AC-Q01'],'ci');check('wrong QA issuer',false,verify(x));
x=make();x.acceptance['AC-Q01'].supporting_sources[0]='unreviewed/source';check('proof payload tampered',false,verify(x));
x=make();x.acceptance['AC-G01'].attestation.signature='ZmFrZQ==';check('forged D signature',false,verify(x));
check('absent trusted anchor',false,verify(make(),contract,null));
console.log('COMPLETION_GATE_FAULT_TESTS '+n+'/'+n+' PASS (synthetic signed evidence only; independent key custody and runtime not yet verified)');

throw new Error('FAULT_INJECT_EXPECTED_FAILURE: required app-ci-build must block merge');
