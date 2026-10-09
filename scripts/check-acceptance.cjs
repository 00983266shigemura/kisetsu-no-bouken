#!/usr/bin/env node
'use strict';
const fs=require('fs'),crypto=require('crypto'),assert=require('assert');
const contract=JSON.parse(fs.readFileSync('acceptance/contract.json','utf8'));
const evidence=JSON.parse(fs.readFileSync('acceptance/evidence.json','utf8'));
const VALID=['PASS','FAIL','UNVERIFIED','NOT_APPLICABLE'];
const HASH=/^[0-9a-f]{64}$/i;
const INPUTS=['source.html','build.js','test.js','acceptance/contract.json','scripts/check-acceptance.cjs'];
function digest(){
 const h=crypto.createHash('sha256');
 for(const file of INPUTS){h.update(file+'\0');h.update(fs.readFileSync(file));h.update('\0');}
 return h.digest('hex');
}
function audit(spec,record,expected,phase){
 const errors=[];
 if(spec.schema_version!==2||record.schema_version!==2||spec.contract_id!==record.contract_id)errors.push('contract/evidence version mismatch');
 if(!Array.isArray(spec.gates)||!spec.gates.length)errors.push('missing contract gates');
 const seen=new Set();
 for(const gate of spec.gates||[]){
  if(!gate.id||seen.has(gate.id))errors.push('duplicate/blank gate ID');
  seen.add(gate.id);
  if(!['predeploy','postdeploy'].includes(gate.phase))errors.push(gate.id+': invalid phase');
  const e=(record.gates||{})[gate.id];
  if(!e){errors.push(gate.id+': missing evidence record');continue;}
  if(!VALID.includes(e.status))errors.push(gate.id+': invalid status');
  if(e.evidence_type!==gate.evidence_type)errors.push(gate.id+': evidence type mismatch');
  if(e.status==='NOT_APPLICABLE'&&gate.required)errors.push(gate.id+': mandatory N/A forbidden');
  if(e.status==='PASS'){
   if(!HASH.test(e.subject_digest||''))errors.push(gate.id+': missing 64-char subject digest');
   if(!/^https:\/\/\S+$/.test(e.proof_url||''))errors.push(gate.id+': missing HTTPS proof');
   if(!e.assessor||!e.checked_at||Number.isNaN(Date.parse(e.checked_at)))errors.push(gate.id+': missing assessor/timestamp');
   if(expected&&e.subject_digest!==expected)errors.push(gate.id+': evidence fingerprint differs from source');
  }
  if(phase&&gate.required&&(phase==='full'||gate.phase===phase)&&e.status!=='PASS') errors.push(gate.id+': RELEASE BLOCKED ('+e.status+')');
 }
 for(const id of Object.keys(record.gates||{}))if(!seen.has(id))errors.push('undocumented gate: '+id);
 return errors;
}
function selfTest(){
 const h=digest(),baseline=JSON.parse(JSON.stringify(evidence));
 assert(audit(contract,baseline,h,'predeploy').some(x=>x.includes('RELEASE BLOCKED')),'unverified must block');
 for(const g of contract.gates)baseline.gates[g.id]={status:'PASS',subject_digest:h,proof_url:'https://example.org/evidence/'+g.id,evidence_type:g.evidence_type,assessor:'reviewer',checked_at:'2026-10-09T00:00:00Z'};
 assert.equal(audit(contract,baseline,h,'full').length,0);
 const id=contract.gates[0].id;
 baseline.gates[id].proof_url=null;
 assert(audit(contract,baseline,h,'predeploy').some(x=>x.includes('missing HTTPS')),'missing reference must block');
 baseline.gates[id].proof_url='https://example.org/evidence';
 baseline.gates[id].subject_digest='b'.repeat(64);
 assert(audit(contract,baseline,h,'predeploy').some(x=>x.includes('fingerprint differs')),'stale subject must block');
 baseline.gates[id].subject_digest=h;
 baseline.gates[id].status='NOT_APPLICABLE';
 assert(audit(contract,baseline,h,'predeploy').some(x=>x.includes('N/A forbidden')),'mandatory N/A must block');
 baseline.gates[id].status='PASS';
 baseline.gates.PUBLICATION.status='UNVERIFIED';
 assert.equal(audit(contract,baseline,h,'predeploy').length,0,'postdeploy evidence must not create predeploy deadlock');
 assert(audit(contract,baseline,h,'full').some(x=>x.includes('PUBLICATION: RELEASE BLOCKED')),'postdeploy gate must block final closure');
 console.log('PASS negative tests: missing, stale, N/A, postdeployment separation, self-reference avoided');
}
const args=process.argv;
if(args.includes('--digest'))console.log(digest());
else if(args.includes('--self-test'))selfTest();
else {
 const phase=args.includes('--predeploy')?'predeploy':args.includes('--full')?'full':null;
 const errors=audit(contract,evidence,digest(),phase);
 if(errors.length){console.error('APP QUALITY '+(phase||'SCHEMA')+' FAIL:\n'+errors.join('\n'));process.exit(1);}
 console.log('PASS contract structure'+(phase?(' and '+phase+' requirements'):'')+'; subject digest='+digest());
}
