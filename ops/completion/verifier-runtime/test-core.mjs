import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { verifyWebhookSignature, normalizeWebhook, checkExternalId, chooseExistingCheckRun, checkConclusion, claimLease, completeLease } from './core.mjs';

const secret = 'unit-test-only-not-a-real-secret';
const repoId = 1411339641, installationId = 1;
const sha = 'a'.repeat(40), digest = 'b'.repeat(64);
const rawBody = Buffer.from(JSON.stringify({ action:'synchronize', repository:{id:repoId}, installation:{id:installationId}, number:7, pull_request:{head:{sha},base:{sha:'c'.repeat(40)}} }));
const signature = 'sha256='+createHmac('sha256',secret).update(rawBody).digest('hex');
assert.equal(verifyWebhookSignature(rawBody,signature,[secret]),true);
assert.equal(verifyWebhookSignature(rawBody,signature,['wrong']),false);
assert.throws(()=>normalizeWebhook({rawBody,signature:'sha256='+'0'.repeat(64),secrets:[secret],deliveryId:'12345678-1234-1234-1234-123456789012',eventName:'pull_request',repoId,installationId}),/SIGNATURE_INVALID/);
assert.throws(()=>normalizeWebhook({rawBody,signature,secrets:[secret],deliveryId:'bad',eventName:'pull_request',repoId,installationId}),/DELIVERY_ID_INVALID/);
assert.throws(()=>normalizeWebhook({rawBody,signature,secrets:[secret],deliveryId:'12345678-1234-1234-1234-123456789012',eventName:'pull_request',repoId:repoId+1,installationId}),/SCOPE_INVALID/);
const item=normalizeWebhook({rawBody,signature,secrets:[secret],deliveryId:'12345678-1234-1234-1234-123456789012',eventName:'pull_request',repoId,installationId});
assert.equal(item.headSha,sha);
assert.equal(normalizeWebhook({rawBody,signature,secrets:[secret],deliveryId:'12345678-1234-1234-1234-123456789012',eventName:'issues',repoId,installationId}).ignored,true);
const externalId=checkExternalId(item,digest);
assert.equal(externalId.length,64);
assert.equal(chooseExistingCheckRun([{id:4,app:{id:9},external_id:externalId}],9,externalId).id,4);
assert.equal(chooseExistingCheckRun([{id:4,app:{id:10},external_id:externalId}],9,externalId),null);
assert.throws(()=>chooseExistingCheckRun([{id:4,app:{id:9},external_id:externalId},{id:5,app:{id:9},external_id:externalId}],9,externalId),/DUPLICATE/);
const base={verdict:{status:'VERIFIED_DELIVERED',target_revision:sha,contract_digest:digest},expectedSha:sha,currentSha:sha,expectedDigest:digest,requiredChecks:[{head_sha:sha,conclusion:'success'}]};
assert.equal(checkConclusion(base),'success');
for(const conclusion of ['failure','neutral','skipped','cancelled',undefined]) assert.equal(checkConclusion({...base,requiredChecks:[{head_sha:sha,conclusion}]}),'failure',`must reject ${conclusion}`);
assert.equal(checkConclusion({...base,currentSha:'d'.repeat(40)}),'failure');
assert.equal(checkConclusion({...base,expectedDigest:'e'.repeat(64)}),'failure');
assert.equal(checkConclusion({...base,verdict:{...base.verdict,status:'BLOCKED'}}),'failure');
const first=claimLease(null,{owner:'run-A',now:1000,leaseMs:100});
assert.equal(first.fence,1);
const processing={state:'PROCESSING',owner:'run-A',fence:1,leaseUntil:1100};
assert.equal(claimLease(processing,{owner:'run-B',now:1050,leaseMs:100}).busy,true);
const recovered=claimLease(processing,{owner:'run-B',now:1101,leaseMs:100});
assert.equal(recovered.fence,2);
assert.throws(()=>completeLease({...processing,owner:'run-B',fence:2},first,42,1050),/FENCE/);
assert.equal(completeLease({...processing,owner:'run-B',fence:2,leaseUntil:1201},recovered,42,1150).state,'COMPLETED');
assert.equal(claimLease({state:'COMPLETED',checkRunId:42},{owner:'run-C',now:1300,leaseMs:100}).completed,true);
// Crash after the external check-run side effect but before durable completion.
// Replay must find/reuse the same external_id and produce no second side effect.
const replayItem={...item,headSha:'f'.repeat(40)};
const replayExternalId=checkExternalId(replayItem,digest);
let durable=null, sideEffects=0, externalRuns=[];
const claimA=claimLease(durable,{owner:'run-crash',now:2000,leaseMs:100});
durable={state:'PROCESSING',owner:'run-crash',fence:claimA.fence,leaseUntil:claimA.leaseUntil};
let existing=chooseExistingCheckRun(externalRuns,9,replayExternalId);
if(!existing){sideEffects++;existing={id:77,app:{id:9},external_id:replayExternalId};externalRuns.push(existing);}
// Simulated process death here: checkpoint deliberately remains PROCESSING.
const claimB=claimLease(durable,{owner:'run-resume',now:2101,leaseMs:100});
durable={state:'PROCESSING',owner:'run-resume',fence:claimB.fence,leaseUntil:claimB.leaseUntil};
existing=chooseExistingCheckRun(externalRuns,9,replayExternalId);
if(!existing){sideEffects++;existing={id:78,app:{id:9},external_id:replayExternalId};externalRuns.push(existing);}
durable=completeLease(durable,claimB,existing.id,2150);
assert.equal(sideEffects,1);
assert.equal(externalRuns.length,1);
assert.equal(durable.state,'COMPLETED');
assert.equal(claimLease(durable,{owner:'run-replay',now:2200,leaseMs:100}).completed,true);
console.log('PASS verifier-core: signature/scope; strict success; stale SHA/digest; lease fencing; synthetic crash/replay idempotency (1 side effect). NOT an owner-runner E2E.');
