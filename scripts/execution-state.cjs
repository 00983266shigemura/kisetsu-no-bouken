'use strict';
const crypto=require('crypto');
const SHA=/^[0-9a-f]{40,64}$/;
const safeId=/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}$/;
const digest=x=>crypto.createHash('sha256').update(x).digest('hex');
function assert(ok,message){if(!ok)throw Error(message)}
function validate(s) {
 assert(s&&s.schema===1&&safeId.test(s.job_id),'invalid schema/job');
 assert(SHA.test(s.input_sha)&&s.replay_id===s.job_id+':'+s.input_sha,'input/replay mismatch');
 assert(Number.isSafeInteger(s.version)&&s.version>0,'bad version');
 assert(Number.isSafeInteger(s.fence)&&s.fence>0,'bad fence');
 assert(['RUNNING','VERIFIED','BLOCKED'].includes(s.phase),'bad phase');
 assert(Number.isSafeInteger(s.attempt)&&s.attempt>0,'bad attempt');
 assert(Array.isArray(s.completed_units),'bad units');
 assert(typeof s.updated_at==='string','bad time');
 return s;
}
function initial(job_id,input_sha,attempt,now) {
 assert(safeId.test(job_id)&&SHA.test(input_sha),'invalid identifier');
 assert(Number.isSafeInteger(attempt)&&attempt>0,'bad attempt');
 return validate({schema:1,job_id,input_sha,replay_id:job_id+':'+input_sha,version:1,fence:1,phase:'RUNNING',attempt,completed_units:[],evidence:null,updated_at:now});
}
function transition(before,op,opts) {
 const {attempt,expectedVersion,expectedFence,now,evidence}=opts;
 validate(before);
 assert(before.version===expectedVersion,'VERSION_CONFLICT');
 assert(before.fence===expectedFence,'STALE_WRITER');
 assert(attempt>=before.attempt,'STALE_ATTEMPT');
 if(before.phase==='VERIFIED')return before; // replay is read-only and idempotent
 if(before.phase==='BLOCKED')throw Error('BLOCKED_NOT_RETRYABLE');
 assert(['RESTART','COMPLETE','BLOCK'].includes(op),'invalid operation');
 if(op==='RESTART'){
   assert(attempt>before.attempt,'REPLAY_ATTEMPT_NOT_NEW');
   return validate({...before,version:before.version+1,fence:before.fence+1,attempt,updated_at:now});
 }
 assert(attempt===before.attempt,'ATTEMPT_MISMATCH');
 if(op==='COMPLETE') {
   assert(evidence&&SHA.test(evidence.release_id),'missing verified release evidence');
   return validate({...before,version:before.version+1,phase:'VERIFIED',completed_units:['npm_test','independent_build','dom_season_labels'],evidence,updated_at:now});
 }
 return validate({...before,version:before.version+1,phase:'BLOCKED',evidence:{failure_class:'DETERMINISTIC_TEST_FAILURE'},updated_at:now});
}
function wire(s){
 const value=JSON.stringify(validate(s));
 return JSON.stringify({payload:s,payload_sha256:digest(value)},null,2)+'\n';
}
function unwrap(text){
 const v=JSON.parse(text);
 assert(v&&v.payload&&v.payload_sha256===digest(JSON.stringify(v.payload)),'CHECKPOINT_HASH_MISMATCH');
 return validate(v.payload);
}
function recover(s,verifyArtifact){
 validate(s);
 if(s.phase==='VERIFIED')assert(verifyArtifact(s.evidence),'EVIDENCE_NOT_FOUND');
 return s;
}
module.exports={SHA,safeId,digest,validate,initial,transition,wire,unwrap,recover};
