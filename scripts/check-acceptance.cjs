#!/usr/bin/env node
'use strict';
const fs = require('fs');
const assert = require('assert');
const contract = JSON.parse(fs.readFileSync('acceptance/contract.json','utf8'));
const evidence = JSON.parse(fs.readFileSync('acceptance/evidence.json','utf8'));
const VALID = ['PASS','FAIL','UNVERIFIED','NOT_APPLICABLE'];
const SHA = /^[a-f0-9]{40}$/i;
function audit(spec, rec, expectedSha, release) {
 const errors=[];
 if(spec.schema_version!==1||rec.schema_version!==1||spec.contract_id!==rec.contract_id) errors.push('contract/evidence version mismatch');
 if(!spec.gates || !Array.isArray(spec.gates)||spec.gates.length===0) errors.push('missing contract gates');
 const seen = new Set();
 for (const g of spec.gates||[]) {
   if(!g.id||seen.has(g.id)) errors.push('duplicate/blank gate ID');
   seen.add(g.id);
   const e=(rec.gates||{})[g.id];
   if(!e){errors.push(g.id+': missing evidence record');continue;}
   if(!VALID.includes(e.status)) errors.push(g.id+': unknown status');
   if(e.evidence_type!==g.evidence_type) errors.push(g.id+': evidence type mismatch');
   if(e.status==='NOT_APPLICABLE' && g.required) errors.push(g.id+': mandatory gate cannot be N/A');
   if(e.status==='PASS') {
     if(!SHA.test(e.source_sha||'')) errors.push(g.id+': PASS without 40-char source SHA');
     if(!/^https:\/\/\S+$/.test(e.proof_url||'')) errors.push(g.id+': PASS without HTTPS evidence reference');
     if(!e.assessor||!e.checked_at||Number.isNaN(Date.parse(e.checked_at))) errors.push(g.id+': PASS without assessor and time');
     if(release && expectedSha && e.source_sha!==expectedSha) errors.push(g.id+': evidence SHA differs from release SHA');
   }
   if(release && g.required && e.status!=='PASS') errors.push(g.id+': RELEASE BLOCKED ('+e.status+')');
 }
 for(const id of Object.keys(rec.gates||{})) if(!seen.has(id)) errors.push('extra undocumented gate: '+id);
 return errors;
}
function selfTest(){
 const sha='a'.repeat(40),base=JSON.parse(JSON.stringify(evidence));
 assert(audit(contract,base,sha,true).some(x=>x.includes('RELEASE BLOCKED')),'UNVERIFIED must block');
 for(const g of contract.gates)base.gates[g.id]={status:'PASS',source_sha:sha,evidence_type:g.evidence_type,proof_url:'https://example.org/evidence/'+g.id,assessor:'reviewer',checked_at:'2026-10-09T00:00:00Z'};
 assert.equal(audit(contract,base,sha,true).length,0,'complete evidence must pass');
 base.gates[contract.gates[0].id].proof_url=null;
 assert(audit(contract,base,sha,true).some(x=>x.includes('without HTTPS')),'missing proof must block');
 base.gates[contract.gates[0].id].proof_url='https://example.org/evidence';
 base.gates[contract.gates[0].id].source_sha='b'.repeat(40);
 assert(audit(contract,base,sha,true).some(x=>x.includes('differs')),'changed SHA must block');
 base.gates[contract.gates[0].id].status='NOT_APPLICABLE';
 assert(audit(contract,base,sha,true).some(x=>x.includes('mandatory gate')),'mandatory N/A must block');
 console.log('PASS: negative cases blocked (unverified, missing proof, changed SHA, mandatory N/A)');
}
if(process.argv.includes('--self-test'))selfTest();
else {
 const release=process.argv.includes('--release');
 const expected=process.env.GITHUB_SHA||process.env.APP_RELEASE_SHA||null;
 const errors=audit(contract,evidence,expected,release);
 if(release&&!expected)errors.push('release SHA unavailable (fail closed)');
 if(errors.length){console.error('APP QUALITY '+(release?'RELEASE':'SCHEMA')+' FAIL:\n'+errors.join('\n'));process.exit(1);}
 console.log('PASS: contract schema and evidence records'+(release?' / mandatory release gates':'')+' validated');
}
