'use strict';
// Only trusted main workflow runs may perform Git writes. This module never modifies main.
const fs=require('fs'),cp=require('child_process');
const S=require('./execution-state.cjs');
const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
const branch='ops-execution-state';
const sha=process.env.GITHUB_SHA;
const attempt=Number(process.env.GITHUB_RUN_ATTEMPT||1);
if(!process.env.GITHUB_ACTIONS||process.env.GITHUB_REF!=='refs/heads/main'||!repo||!token||!S.SHA.test(sha))throw Error('TRUSTED_MAIN_ONLY');
const job='release_'+sha, file='ops/checkpoints/'+job+'.json';
const prefix='https://api.github.com/repos/'+repo;
async function api(method,path,body,allow404){
 const res=await fetch(prefix+path,{method,headers:{'Authorization':'Bearer '+token,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(res.status===404&&allow404)return null;
 if(!res.ok)throw Error('GITHUB_'+res.status+' '+method+' '+path.split('?')[0]);
 return res.json();
}
async function snapshot(){
 const ref=await api('GET','/git/ref/heads/'+branch);
 const head=ref.object.sha;
 const commit=await api('GET','/git/commits/'+head);
 const content=await api('GET','/contents/'+file+'?ref='+encodeURIComponent(branch),undefined,true);
 if(content&&content.encoding!=='base64')throw Error('STATE_ENCODING_UNSUPPORTED');
 const state=content?S.unwrap(Buffer.from(content.content.replace(/\s/g,''),'base64').toString('utf8')):null;
 return {head,tree:commit.tree.sha,state};
}
async function save(next,previous){
 const blob=await api('POST','/git/blobs',{content:S.wire(next),encoding:'utf-8'});
 const tree=await api('POST','/git/trees',{base_tree:previous.tree,tree:[{path:file,mode:'100644',type:'blob',sha:blob.sha}]});
 const commit=await api('POST','/git/commits',{message:'Checkpoint '+job+' v'+next.version,tree:tree.sha,parents:[previous.head]});
 // Non-fast-forward rejection is the Git branch-level compare-and-swap; do not force.
 await api('PATCH','/git/refs/heads/'+branch,{sha:commit.sha,force:false});
 const check=await S.waitForReadback(snapshot,commit.sha,next);
 console.log('CHECKPOINT_READBACK_OK version='+next.version+' fence='+next.fence+' phase='+next.phase);
 return check;
}
async function main(){
 let snap=await snapshot();
 if(snap.state){
  S.validate(snap.state);
  if(snap.state.input_sha!==sha||snap.state.replay_id!==job+':'+sha)throw Error('JOB_STATE_COLLISION');
  if(snap.state.phase==='VERIFIED'){
   const expected=JSON.parse(fs.readFileSync('release.json','utf8')).releaseId;
   S.recover(snap.state,e=>e&&e.release_id===expected);
   console.log('REPLAY_ALREADY_VERIFIED_NOOP');return;
  }
  if(snap.state.phase==='BLOCKED')throw Error('DETERMINISTIC_BLOCK_NO_RETRY');
  if(attempt<snap.state.attempt)throw Error('STALE_ATTEMPT');
  if(attempt>snap.state.attempt)snap=await save(S.transition(snap.state,'RESTART',{attempt,expectedVersion:snap.state.version,expectedFence:snap.state.fence,now:new Date().toISOString()}),snap);
 } else snap=await save(S.initial(job,sha,attempt,new Date().toISOString()),snap);
 // A previous crashing attempt can only resume after its run is no longer active.
 const lease=snap.state;
 const result=cp.spawnSync(process.execPath,['scripts/verify-build.js'],{stdio:'inherit',timeout:500000});
 if(result.status!==0){
  await save(S.transition(lease,'BLOCK',{attempt,expectedVersion:lease.version,expectedFence:lease.fence,now:new Date().toISOString()}),snap);
  throw Error('DETERMINISTIC_TEST_FAILURE');
 }
 const release=JSON.parse(fs.readFileSync('release.json','utf8'));
 await save(S.transition(lease,'COMPLETE',{attempt,expectedVersion:lease.version,expectedFence:lease.fence,now:new Date().toISOString(),evidence:{release_id:release.releaseId,commit_sha:sha,run_id:process.env.GITHUB_RUN_ID}}),snap);
 console.log('DURABLE_JOB_VERIFIED '+job);
}
main().catch(e=>{console.error('DURABLE_JOB_FAILED '+e.message);process.exitCode=1});
