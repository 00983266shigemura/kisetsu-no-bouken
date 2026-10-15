// Bounded in-memory integration simulation of the actual Worker orchestrator.
// No real GitHub App, AWS, secret, RuleSet or deployment is invoked.
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {Readable} from 'node:stream';
import {createRequire} from 'node:module';
import {SecretsManagerClient} from '@aws-sdk/client-secrets-manager';
import {S3Client} from '@aws-sdk/client-s3';
import {DynamoDBDocumentClient} from '@aws-sdk/lib-dynamodb';
const require=createRequire(import.meta.url);
const {make,contract,anchor,sha,digest}=require('./test-merge-readiness.cjs');

const repoId=1411339641,installId=1,prNumber=7;
const rsa=generateKeyPairSync('rsa',{modulusLength:2048});
const pk=rsa.privateKey.export({type:'pkcs8',format:'pem'});
const contractText=JSON.stringify(contract),anchorText=JSON.stringify(anchor),evidence=make();
const sha256=s=>createHash('sha256').update(s).digest('hex');
Object.assign(process.env,{
  REPOSITORY_ID:String(repoId), INSTALLATION_ID:String(installId),
  REPOSITORY_OWNER:'00983266shigemura', REPOSITORY_NAME:'kisetsu-no-bouken',
  GITHUB_APP_ID:'99', APP_CHECK_NAME:'completion-contract-l3',
  IDEMPOTENCY_TABLE:'in-memory-only', APP_PRIVATE_KEY_SECRET_ARN:'mock-only',
  CONTRACT_BUCKET:'mock-only', CONTRACT_KEY:'contract.json',
  CONTRACT_VERSION_ID:'v1', CONTRACT_SHA256:sha256(contractText),
  CONTRACT_DIGEST:digest, ANCHOR_BUCKET:'mock-only', ANCHOR_KEY:'anchor.json',
  ANCHOR_VERSION_ID:'v1', ANCHOR_SHA256:sha256(anchorText),
  EVIDENCE_PATH:'.completion/evidence.json', LEASE_MS:'120000',MAX_CI_WAIT_MS:'3600000'
});

const state=new Map(), runs=[], counters={created:0,completed:0,dbWrites:0};
let currentPR=prNumber,prFiles=[],ciChecks=[];
const response=(data,status=200)=>({ok:status>=200&&status<300,status,json:async()=>data});

SecretsManagerClient.prototype.send=async function(_cmd){return {SecretString:JSON.stringify({current:pk})}};
S3Client.prototype.send=async function(cmd){
  const key=cmd.input.Key;
  if(cmd.input.VersionId!=='v1')throw Error('UNPINNED_S3_VERSION');
  const body=key==='contract.json'?contractText:key==='anchor.json'?anchorText:null;
  if(!body)throw Error('NO_OBJECT');
  return {Body:Readable.from([Buffer.from(body)])};
};
DynamoDBDocumentClient.prototype.send=async function(cmd){
  const kind=cmd.constructor.name,inp=cmd.input;
  const key=inp.Key?.pk||inp.Item?.pk,old=state.get(key);
  if(kind==='GetCommand')return {Item:old?{...old}:undefined};
  if(kind==='PutCommand'){
    if(old && !(old.leaseUntil<=inp.ExpressionAttributeValues[':now'])){const e=Error('raced');e.name='ConditionalCheckFailedException';throw e;}
    state.set(key,{...inp.Item});counters.dbWrites++;return {};
  }
  if(kind==='UpdateCommand'){
    const v=inp.ExpressionAttributeValues;
    if(!old||old.state!=='PROCESSING'||old.owner!==v[':owner']||old.fence!==v[':fence']||old.leaseUntil<=v[':at'])
       throw Error('STALE_LEASE_FENCE');
    if(v[':waiting'])state.set(key,{...old,state:'WAITING',leaseUntil:0,updatedAt:v[':at']});
    else state.set(key,{...old,state:'COMPLETED',checkRunId:v[':id'],completedAt:v[':at'],updatedAt:v[':at'],leaseUntil:undefined});
    counters.dbWrites++;return {};
  }
  throw Error('MOCK_COMMAND_'+kind);
};

globalThis.fetch=async (url,opts={})=>{
  const p=new URL(url).pathname,method=opts.method||'GET', body=opts.body?JSON.parse(opts.body):null;
  if(p==='/app/installations/1/access_tokens'&&method==='POST')
    return response({token:'fake-install-token',expires_at:'2099-01-01T00:00:00Z'});
  if(p.includes('/commits/')&&p.endsWith('/check-runs'))
    return response({total_count:ciChecks.length+runs.length,check_runs:[...ciChecks,...runs]});
  if(p.endsWith('/pulls/'+prNumber)||p.endsWith('/pulls/8'))
    return response({head:{sha,repo:{id:repoId}},base:{ref:'main',repo:{id:repoId}}});
  if(p.endsWith('/pulls/'+prNumber+'/files')||p.endsWith('/pulls/8/files'))
    return response(prFiles);
  if(p.endsWith('/contents/.completion/evidence.json'))
    return response({encoding:'base64',content:Buffer.from(JSON.stringify(evidence)).toString('base64')});
  if(p.endsWith('/check-runs')&&method==='POST'){
    const r={id:100+counters.created,external_id:body.external_id,app:{id:99},name:body.name,head_sha:body.head_sha,status:'in_progress',conclusion:null};
    runs.push(r);counters.created++;return response(r,201);
  }
  if(p.match(/\/check-runs\/\d+$/)&&method==='PATCH'){
    const id=Number(p.split('/').at(-1));const r=runs.find(x=>x.id===id);
    if(!r)throw Error('MOCK_UNKNOWN_CHECK_ID');
    Object.assign(r,{status:body.status,conclusion:body.conclusion});
    counters.completed++;return response({...r});
  }
  throw Error('UNEXPECTED_GITHUB_API '+method+' '+p);
};

const {processItem}=await import('./worker.mjs');
const item=n=>({repositoryId:repoId,installationId:installId,pullRequest:n,headSha:sha});
let first=await processItem(item(7),{now:1000});
assert.equal(first.status,'WAITING_CI');
assert.equal(counters.created,1);
assert.equal(counters.completed,0);
ciChecks=[
 {id:10,name:'app-ci-build',head_sha:sha,app:{id:15368},status:'completed',conclusion:'success'},
 {id:11,name:'completion-contract-qa',head_sha:sha,app:{id:15368},status:'completed',conclusion:'failure'}
];
const retry=await processItem(item(7),{now:131001});
assert.equal(retry.status,'WAITING_CI_RETRY','failed CI must allow bounded same-SHA rerun');
ciChecks.push({id:12,name:'completion-contract-qa',head_sha:sha,app:{id:15368},status:'completed',conclusion:'success'});
const recovered=await processItem(item(7),{now:262001});
assert.equal(recovered.status,'MERGE_READY_ONLY','latest corrected CI+signed premerge proofs must pass');
assert.equal(counters.created,1,'retry must not create a second App Check Run');
assert.equal(counters.completed,1,'one external result side effect only');
assert.equal(runs[0].conclusion,'success');
const noop=await processItem(item(7),{now:393001});
assert.equal(noop.status,'IDEMPOTENT_NOOP');
assert.equal(counters.created,1);assert.equal(counters.completed,1);

// Adversarial PR edits protected policy; independent App cannot emit a green check.
prFiles=[{filename:'.github/workflows/fake-gate.yml'}];
const denied=await processItem(item(8),{now:1000});
assert.equal(denied.status,'BLOCKED_PROTECTED_FILES');
assert.equal(runs.find(x=>x.id===101).conclusion,'failure');
assert.equal(counters.created,2);assert.equal(counters.completed,2);

console.log('PASS actual worker orchestration simulated end-to-end: pending CI → failure → same-SHA rerun pass, exactly one App check creation/completion, durable replay NOOP; protected PR edits fail-closed. MOCK AWS/GITHUB ONLY; not a live external E2E.');
