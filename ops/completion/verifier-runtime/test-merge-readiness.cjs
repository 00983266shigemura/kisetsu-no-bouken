'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {digestContract,attestPayload,evaluate}=require('../../../scripts/completion-gate.cjs');
const {assessMergeReadiness}=require('./merge-readiness.cjs');
const contract=JSON.parse(fs.readFileSync('ops/completion/contract-v1.json','utf8'));
const sha='a'.repeat(40),digest=digestContract(contract),ctx={contract_digest:digest,target_revision:sha};
const issuers={},keys={};
for(const [id,domains] of Object.entries({authority:['authority'],ci:['acceptance:D:AC-G01','acceptance:D:AC-G02'],qa:['quality','acceptance:E:AC-Q01']})){
 const pair=crypto.generateKeyPairSync('ed25519');keys[id]=pair.privateKey;
 issuers[id]={allowed_domains:domains,public_key_pem:pair.publicKey.export({type:'spki',format:'pem'})};
}
const anchor={contract_id:contract.contract_id,revision:contract.revision,sha256:digest,approval_ref:contract.approval.ref,issuers};
const sign=(domain,p,id)=>{p.attestation={issuer:id,signature:crypto.sign(null,Buffer.from(attestPayload(domain,p,ctx)),keys[id]).toString('base64')};return p};
const acceptance={};
for(const id of ['AC-G01','AC-G02','AC-Q01']){
 const ac=contract.acceptance.find(x=>x.id===id),e={status:'PASS',source:'evidence/test/'+id,target_revision:sha};
 if(ac.type==='E')Object.assign(e,{rubric_ref:ac.rubric_ref,critical_findings:0,counterevidence_reviewed:true,supporting_sources:['primary','independent'],reviewer:'reviewer-A',producer:'producer-B'});
 acceptance[id]=sign('acceptance:'+ac.type+':'+id,e,ac.type==='E'?'qa':'ci');
}
const make=()=>({
 contract_digest:digest,contract_revision:contract.revision,target_revision:sha,acceptance:structuredClone(acceptance),
 authority:sign('authority',{authorized:true,approval_ref:contract.approval.ref},'authority'),
 quality:sign('quality',{critical_findings:0},'qa')
});
const assess=(e,c=contract,a=anchor)=>assessMergeReadiness({contract:c,anchor:a,evidence:e,targetRevision:sha});
let n=0;const check=(name,e,want='BLOCKED',c=contract,a=anchor)=>{const x=assess(e,c,a);assert.equal(x.status,want,name);n++};
const valid=make();check('premerge success without final delivery receipt',valid,'MERGE_READY');
assert.equal(assess(valid).phase,'PREMERGE_ONLY');
assert.equal(evaluate({contract,anchor,evidence:valid,targetRevision:sha}).status,'BLOCKED','must never claim full delivery from premerge');
n++;
let e=make();delete e.acceptance['AC-Q01'];check('missing QA',e);
e=make();e.acceptance['AC-Q01'].critical_findings=1;check('tamper signed QA',e);
e=make();e.authority.approval_ref='fake';check('authority change',e);
e=make();e.target_revision='b'.repeat(40);check('wrong SHA',e);
e=make();e.quality.critical_findings=1;check('critical quality',e);
e=make();e.acceptance['AC-Q01'].reviewer='producer-B';check('QA signer tamper',e);
let c=structuredClone(contract);c.acceptance.find(x=>x.id==='AC-G01').required=false;check('AC relaxed',make(),'BLOCKED',c);
c=structuredClone(contract);c.acceptance=c.acceptance.filter(x=>x.id!=='AC-G02');check('AC removed',make(),'BLOCKED',c);
e=make();e.acceptance['AC-G01'].attestation.signature='ZmFrZQ==';check('forged proof',e);
e=make();delete e.quality.attestation;check('unsigned QA',e);
check('missing anchor',make(),'BLOCKED',contract,{...anchor,sha256:'0'.repeat(64)});
console.log('PASS merge-readiness: '+n+' signed premerge positive/negative tests; full VERIFIED_DELIVERED remains blocked.');

// Expose only synthetic test fixtures for separate runtime simulation (never deployment keys).
module.exports={make,contract,anchor,sha,digest};
