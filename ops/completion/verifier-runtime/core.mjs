import { createHmac, timingSafeEqual, createHash } from 'node:crypto';

const SHA = /^[a-f0-9]{40,64}$/i;
const safeInt = n => Number.isSafeInteger(n) && n > 0;

export function verifyWebhookSignature(rawBody, signature, secrets) {
  if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !signature.startsWith('sha256=')) return false;
  const supplied = Buffer.from(signature.slice(7), 'hex');
  if (supplied.length !== 32) return false;
  return secrets.filter(Boolean).some(secret => {
    const expected = createHmac('sha256', secret).update(rawBody).digest();
    return expected.length === supplied.length && timingSafeEqual(expected, supplied);
  });
}

export function normalizeWebhook({ rawBody, signature, secrets, deliveryId, eventName, repoId, installationId }) {
  if (!verifyWebhookSignature(rawBody, signature, secrets)) throw new Error('WEBHOOK_SIGNATURE_INVALID');
  if (typeof deliveryId !== 'string' || !/^[0-9a-f-]{16,64}$/i.test(deliveryId)) throw new Error('DELIVERY_ID_INVALID');
  let payload;
  try { payload = JSON.parse(rawBody.toString('utf8')); } catch { throw new Error('WEBHOOK_JSON_INVALID'); }
  if (eventName !== 'pull_request' || !['opened', 'synchronize', 'reopened', 'ready_for_review', 'edited'].includes(payload.action)) {
    return { ignored: true, deliveryId };
  }
  if (payload.repository?.id !== repoId || payload.installation?.id !== installationId ||
      !safeInt(payload.number) || !SHA.test(payload.pull_request?.head?.sha || '') ||
      !SHA.test(payload.pull_request?.base?.sha || '')) throw new Error('WEBHOOK_SCOPE_INVALID');
  return {
    ignored: false,
    deliveryId,
    repositoryId: repoId,
    installationId,
    pullRequest: payload.number,
    action: payload.action,
    headSha: payload.pull_request.head.sha.toLowerCase(),
    baseSha: payload.pull_request.base.sha.toLowerCase(),
    eventKey: createHash('sha256').update(`${repoId}:${payload.number}:${payload.pull_request.head.sha}:${payload.action}`).digest('hex')
  };
}

export function checkExternalId(item, contractDigest) {
  if (!item || !safeInt(item.repositoryId) || !safeInt(item.pullRequest) || !SHA.test(item.headSha || '') || !/^[a-f0-9]{64}$/i.test(contractDigest || '')) {
    throw new Error('CHECK_IDENTITY_INVALID');
  }
  return createHash('sha256').update(`${item.repositoryId}:${item.pullRequest}:${item.headSha}:${contractDigest}`).digest('hex');
}

export function chooseExistingCheckRun(runs, appId, externalId) {
  if (!Array.isArray(runs)) throw new Error('CHECK_RUN_LIST_INVALID');
  const exact = runs.filter(r => r?.app?.id === appId && r?.external_id === externalId);
  if (exact.length > 1) throw new Error('DUPLICATE_CHECK_RUNS_FAIL_CLOSED');
  return exact[0] || null;
}

// Only an exact, current, fully verified result can be green. GitHub treats skipped/neutral as success
// for required checks, so this service never emits either conclusion.
export function checkConclusion({ verdict, expectedSha, currentSha, expectedDigest, requiredChecks = [] }) {
  const valid = verdict?.status === 'VERIFIED_DELIVERED' &&
    SHA.test(expectedSha || '') && currentSha === expectedSha && verdict.target_revision === expectedSha &&
    /^[a-f0-9]{64}$/i.test(expectedDigest || '') && verdict.contract_digest?.toLowerCase() === expectedDigest.toLowerCase() &&
    Array.isArray(requiredChecks) && requiredChecks.length > 0 &&
    requiredChecks.every(c => c?.head_sha === expectedSha && c?.conclusion === 'success');
  return valid ? 'success' : 'failure';
}

// Lease semantics mirror the DynamoDB conditional-write implementation. The bounded worker timeout
// must be shorter than leaseMs; a retry reconciles by external_id before creating any Check Run.
export function claimLease(snapshot, { owner, now, leaseMs }) {
  if (!owner || !Number.isSafeInteger(now) || !Number.isSafeInteger(leaseMs) || leaseMs <= 0) throw new Error('LEASE_INPUT_INVALID');
  if (snapshot?.state === 'COMPLETED') return { acquired: false, completed: true, snapshot };
  if (snapshot?.state === 'PROCESSING' && snapshot.leaseUntil > now) return { acquired: false, busy: true, snapshot };
  return { acquired: true, completed: false, fence: (snapshot?.fence || 0) + 1, owner, leaseUntil: now + leaseMs };
}

export function completeLease(snapshot, claim, checkRunId, now) {
  if (!claim?.acquired || snapshot?.fence !== claim.fence || snapshot?.owner !== claim.owner ||
      snapshot?.state !== 'PROCESSING' || snapshot.leaseUntil <= now || !safeInt(checkRunId)) {
    throw new Error('LEASE_FENCE_OR_STATE_MISMATCH');
  }
  return { ...snapshot, state: 'COMPLETED', checkRunId, completedAt: now };
}
