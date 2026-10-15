import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createRequire } from 'node:module';
import { checkConclusion, checkExternalId, chooseExistingCheckRun, claimLease, completeLease, latestRequiredActionsChecks, ciWaitingState } from './core.mjs';
import { githubRequest, installationToken } from './github-app.mjs';

const require=createRequire(import.meta.url);
const {assessMergeReadiness}=require('./merge-readiness.cjs');
const secretsClient=new SecretsManagerClient({}), s3=new S3Client({});
const db=DynamoDBDocumentClient.from(new DynamoDBClient({}),{marshallOptions:{removeUndefinedValues:true}});
const table=process.env.IDEMPOTENCY_TABLE;
const owner=process.env.AWS_LAMBDA_LOG_STREAM_NAME||`lambda-${Date.now()}-${Math.random()}`;

async function bodyText(stream){const chunks=[];for await(const c of stream)chunks.push(c);return Buffer.concat(chunks).toString('utf8');}
async function getObject(bucket,key,versionId,expectedSha){
  const response=await s3.send(new GetObjectCommand({Bucket:bucket,Key:key,VersionId:versionId}));
  const text=await bodyText(response.Body);
  const got= (await import('node:crypto')).createHash('sha256').update(text).digest('hex');
  if(got!==expectedSha)throw new Error('PINNED_OBJECT_DIGEST_MISMATCH');
  return JSON.parse(text);
}
function repoPath(item,apiPath){return `/repos/${process.env.REPOSITORY_OWNER}/${process.env.REPOSITORY_NAME}${apiPath}`;}
async function accessToken(privateKey){return installationToken({appId:process.env.GITHUB_APP_ID,installationId:process.env.INSTALLATION_ID,privateKey});}
async function api(path,token,options){return githubRequest(path,{token,...options});}
async function listCheckRuns(item,token){
  const res=await api(repoPath(item,`/commits/${item.headSha}/check-runs?per_page=100`),token);
  if(res.total_count>100)throw new Error('CHECK_RUN_LIST_TRUNCATED_FAIL_CLOSED');
  return res.check_runs||[];
}
async function loadEvidence(item,token){
  const path=repoPath(item,`/contents/${process.env.EVIDENCE_PATH||'.completion/evidence.json'}?ref=${item.headSha}`);
  const file=await api(path,token);
  if(file.encoding!=='base64'||typeof file.content!=='string')throw new Error('EVIDENCE_FILE_INVALID');
  return JSON.parse(Buffer.from(file.content.replace(/\n/g,''),'base64').toString('utf8'));
}
async function getPullRequest(item,token){
  const pr=await api(repoPath(item,`/pulls/${item.pullRequest}`),token);
  if(pr.base?.ref!=='main'||pr.base?.repo?.id!==Number(process.env.REPOSITORY_ID)||
     pr.head?.repo?.id!==Number(process.env.REPOSITORY_ID))throw new Error('PR_REPOSITORY_OR_BASE_INVALID');
  return pr.head?.sha?.toLowerCase();
}
async function getLease(pk){return (await db.send(new GetCommand({TableName:table,Key:{pk},ConsistentRead:true}))).Item||null;}
async function acquire(pk,now){
  const previous=await getLease(pk);
  const claim=claimLease(previous,{owner,now,leaseMs:Number(process.env.LEASE_MS||120000)});
  if(claim.completed)return {done:true,item:previous};
  if(claim.busy)throw new Error('IDEMPOTENCY_LEASE_BUSY_RETRY');
  const next={pk,state:'PROCESSING',owner,leaseUntil:claim.leaseUntil,fence:claim.fence,
    createdAt:previous?.createdAt||now,updatedAt:now,ttl:Math.floor(now/1000)+86400*14};
  try{
    await db.send(new PutCommand({TableName:table,Item:next,ConditionExpression:'attribute_not_exists(pk) OR leaseUntil <= :now',ExpressionAttributeValues:{':now':now}}));
  }catch(e){if(e.name==='ConditionalCheckFailedException')throw new Error('IDEMPOTENCY_LEASE_RACE_RETRY');throw e;}
  return {done:false,item:next,claim};
}
async function deferWaiting(pk,lease,now){
  await db.send(new UpdateCommand({TableName:table,Key:{pk},
    UpdateExpression:'SET #s=:waiting,leaseUntil=:zero,updatedAt=:at',
    ConditionExpression:'#s=:processing AND owner=:owner AND fence=:fence AND leaseUntil > :at',
    ExpressionAttributeNames:{'#s':'state'},
    ExpressionAttributeValues:{':waiting':'WAITING',':zero':0,':at':now,':processing':'PROCESSING',':owner':owner,':fence':lease.fence}}));
}
async function complete(pk,lease,claim,checkRunId,now){
  const completed=completeLease(lease,claim,checkRunId,now);
  await db.send(new UpdateCommand({TableName:table,Key:{pk},UpdateExpression:'SET #s=:done,checkRunId=:id,completedAt=:at,updatedAt=:at REMOVE leaseUntil',ConditionExpression:'#s=:processing AND owner=:owner AND fence=:fence AND leaseUntil > :at',ExpressionAttributeNames:{'#s':'state'},ExpressionAttributeValues:{':done':'COMPLETED',':processing':'PROCESSING',':owner':owner,':fence':lease.fence,':id':checkRunId,':at':now}}));
  return completed;
}
async function createOrReuseCheck(item,externalId,token,runs){
  const existing=chooseExistingCheckRun(runs,Number(process.env.GITHUB_APP_ID),externalId);
  if(existing)return existing;
  return api(repoPath(item,'/check-runs'),token,{method:'POST',body:{name:process.env.APP_CHECK_NAME||'completion-contract-l3',head_sha:item.headSha,external_id:externalId,status:'in_progress',output:{title:'Verifying completion contract',summary:'Evidence verification is running.'}}});
}
async function finishCheck(item,checkRun,token,conclusion,errors){
  const safeConclusion=conclusion==='success'?'success':'failure';
  if(checkRun.status==='completed'){
    if(checkRun.conclusion!==safeConclusion)throw new Error('IMMUTABLE_CHECK_RESULT_CONFLICT_NEW_SHA_REQUIRED');
    return checkRun; // Crash after external success: no second PATCH side effect.
  }
  return api(repoPath(item,`/check-runs/${checkRun.id}`),token,{method:'PATCH',body:{status:'completed',conclusion:safeConclusion,completed_at:new Date().toISOString(),output:{title:safeConclusion==='success'?'Premerge evidence verified':'Premerge gate blocked',summary:safeConclusion==='success'?'Premerge readiness only; post-delivery acceptance remains separately required.':`Fail closed. ${errors.slice(0,12).join(', ')||'Required evidence unavailable or invalid.'}`}}});
}

export async function processItem(item,{now=Date.now()}={}){
  if(item.repositoryId!==Number(process.env.REPOSITORY_ID)||item.installationId!==Number(process.env.INSTALLATION_ID))throw new Error('QUEUE_ITEM_SCOPE_INVALID');
  const externalId=checkExternalId(item,process.env.CONTRACT_DIGEST);
  const pk=`${item.repositoryId}#${item.pullRequest}#${item.headSha}#${externalId}`;
  const lease=await acquire(pk,now);
  if(lease.done)return {status:'IDEMPOTENT_NOOP',checkRunId:lease.item.checkRunId};
  let checkRun=null,token=null;
  try{
    const appSecret=JSON.parse((await secretsClient.send(new GetSecretValueCommand({SecretId:process.env.APP_PRIVATE_KEY_SECRET_ARN}))).SecretString||'{}');
    if(!appSecret.current)throw new Error('APP_PRIVATE_KEY_MISSING');
    token=await accessToken(appSecret.current);
    const runs=await listCheckRuns(item,token);
    checkRun=await createOrReuseCheck(item,externalId,token,runs);
    const currentSha=await getPullRequest(item,token);
    if(currentSha!==item.headSha)throw new Error('STALE_HEAD_SHA');
    const required=latestRequiredActionsChecks(runs,item.headSha);
    const ciState=ciWaitingState(required,now,lease.item.createdAt,Number(process.env.MAX_CI_WAIT_MS||3600000));
    if(ciState==='WAITING_CI'){
      await deferWaiting(pk,lease.item,now);
      return {status:'WAITING_CI',checkRunId:checkRun.id};
    }
    const contract=await getObject(process.env.CONTRACT_BUCKET,process.env.CONTRACT_KEY,process.env.CONTRACT_VERSION_ID,process.env.CONTRACT_SHA256);
    const anchor=await getObject(process.env.ANCHOR_BUCKET,process.env.ANCHOR_KEY,process.env.ANCHOR_VERSION_ID,process.env.ANCHOR_SHA256);
    const evidence=await loadEvidence(item,token);
    const verdict=assessMergeReadiness({contract,anchor,evidence,targetRevision:item.headSha});
    const confirmedSha=await getPullRequest(item,token);
    const conclusion=checkConclusion({verdict,expectedSha:item.headSha,currentSha:confirmedSha,expectedDigest:process.env.CONTRACT_DIGEST,requiredChecks:required});
    const savedCheck=await finishCheck(item,checkRun,token,conclusion,verdict.errors||[]);
    await complete(pk,lease.item,lease.claim,savedCheck.id,now);
    return {status:conclusion==='success'?'MERGE_READY_ONLY':'BLOCKED',checkRunId:savedCheck.id,errors:verdict.errors||[]};
  }catch(error){
    // Transient network/secret/S3/readback faults must NOT permanently fail a
    // check for this SHA. Leave it in_progress; SQS/DLQ + scheduled reconciliation
    // retry after the lease expires. The protected merge remains blocked.
    console.error('VERIFIER_RETRY_REQUIRED '+String(error?.message||error));
    throw error;
  }
}

export async function reconcileOpenPullRequests(){
  const appSecret=JSON.parse((await secretsClient.send(new GetSecretValueCommand({SecretId:process.env.APP_PRIVATE_KEY_SECRET_ARN}))).SecretString||'{}');
  if(!appSecret.current)throw new Error('APP_PRIVATE_KEY_MISSING');
  const token=await accessToken(appSecret.current);
  const res=await api(`/repos/${process.env.REPOSITORY_OWNER}/${process.env.REPOSITORY_NAME}/pulls?state=open&per_page=100`,token);
  if(!Array.isArray(res)||res.length>=100)throw new Error('RECONCILE_PR_LIST_TRUNCATED');
  let checked=0;
  const failures=[];
  for(const pr of res){
    if(pr.base?.ref!=='main'||pr.head?.repo?.id!==Number(process.env.REPOSITORY_ID))continue;
    const item={repositoryId:Number(process.env.REPOSITORY_ID),installationId:Number(process.env.INSTALLATION_ID),pullRequest:pr.number,headSha:pr.head.sha};
    try{await processItem(item);checked++;}
    catch(error){failures.push({pr:pr.number,error:String(error?.message||error)});}
  }
  if(failures.length){console.error('RECONCILE_ERRORS '+JSON.stringify(failures));throw Error('RECONCILE_PARTIAL_FAILURE');}
  return {status:'RECONCILED',checked};
}
export async function handler(event){
  if(event?.reconcile===true)return reconcileOpenPullRequests();
  for(const record of event.Records||[]){
    const item=JSON.parse(record.body);
    await processItem(item);
  }
  return {batchItemFailures:[]};
}
