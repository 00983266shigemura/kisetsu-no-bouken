'use strict';
// Completion OS R2 - fail-closed evidence verifier. Read-only; no side effects.
// IMPORTANT: anchor, signing identities and this verifier must be protected outside
// the executor/PR's writable scope. No local test establishes that provider control.
const fs = require('node:fs');
const crypto = require('node:crypto');
function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k)+':'+canonical(v[k])).join(',') + '}';
  return JSON.stringify(v);
}
function digestContract(contract) {
  return crypto.createHash('sha256').update(canonical(contract), 'utf8').digest('hex');
}
function attestPayload(domain, record, context) {
  const copy={...record}; delete copy.attestation;
  return canonical({domain,contract_digest:context.contract_digest,
    target_revision:context.target_revision,record:copy});
}
function verifyAttestation(domain, record, context, anchor) {
  if (!record || typeof record !== 'object' || !record.attestation ||
      typeof record.attestation.issuer !== 'string' ||
      typeof record.attestation.signature !== 'string') return false;
  const issuer = anchor.issuers?.[record.attestation.issuer];
  if (!issuer || !Array.isArray(issuer.allowed_domains) ||
      !issuer.allowed_domains.includes(domain) || !issuer.public_key_pem) return false;
  try {
    const message=Buffer.from(attestPayload(domain,record,context),'utf8');
    const sig=Buffer.from(record.attestation.signature,'base64');
    return sig.length===64 && crypto.verify(null,message,issuer.public_key_pem,sig);
  } catch (_) { return false; }
}
function evaluate({contract, anchor, evidence, targetRevision}) {
  const errors = [];
  if (!contract || !anchor || !evidence || typeof targetRevision !== 'string' || !targetRevision) {
    return {status:'BLOCKED',errors:['MISSING_REQUIRED_INPUT']};
  }
  const hash = digestContract(contract);
  if (anchor.contract_id !== contract.contract_id || anchor.revision !== contract.revision ||
      anchor.sha256 !== hash || anchor.approval_ref !== contract.approval?.ref) errors.push('UNTRUSTED_CONTRACT');
  const ctx={contract_digest:hash,target_revision:targetRevision};
  if (evidence.contract_digest !== hash || evidence.contract_revision !== contract.revision) errors.push('EVIDENCE_CONTRACT_MISMATCH');
  if (evidence.target_revision !== targetRevision || evidence.target_revision === 'UNKNOWN') errors.push('TARGET_REVISION_MISMATCH');
  if (evidence.authority?.approval_ref !== contract.approval?.ref || evidence.authority?.authorized !== true ||
      !verifyAttestation('authority',evidence.authority,ctx,anchor)) errors.push('UNAUTHORIZED_EXECUTION');
  if (evidence.quality?.critical_findings !== 0 ||
      !verifyAttestation('quality',evidence.quality,ctx,anchor)) errors.push('CRITICAL_QUALITY_UNVERIFIED_OR_FAILED');
  if (!Array.isArray(contract.acceptance) || !contract.acceptance.length) errors.push('NO_ACCEPTANCE_CONDITIONS');
  const ids = new Set();
  for (const ac of (contract.acceptance || [])) {
    if (!ac.id || ids.has(ac.id) || !['D','E','H'].includes(ac.type) || typeof ac.required !== 'boolean') {
      errors.push('INVALID_ACCEPTANCE_SCHEMA');continue;
    }
    ids.add(ac.id);
    if (!ac.required) continue;
    const proof = evidence.acceptance?.[ac.id];
    if (!proof || proof.status !== 'PASS' || proof.target_revision !== targetRevision ||
        typeof proof.source !== 'string' || !proof.source.trim()) {
      errors.push('MISSING_OR_FAILED_'+ac.id);continue;
    }
    if (!verifyAttestation('acceptance:'+ac.type+':'+ac.id,proof,ctx,anchor)) errors.push('UNTRUSTED_EVIDENCE_'+ac.id);
    if (ac.type === 'E' && (proof.rubric_ref !== ac.rubric_ref ||
        proof.critical_findings !== 0 || proof.counterevidence_reviewed !== true ||
        !Array.isArray(proof.supporting_sources) || proof.supporting_sources.length < 2 ||
        !proof.reviewer || !proof.producer || proof.reviewer === proof.producer)) errors.push('INVALID_EVIDENCE_BASED_QA_'+ac.id);
    if (ac.type === 'H' && (proof.explicit_human_approval !== true ||
        !proof.approval_ref)) errors.push('HUMAN_DECISION_MISSING_'+ac.id);
  }
  if (contract.delivery?.required && (evidence.delivery?.verified !== true ||
      evidence.delivery?.target_revision !== targetRevision ||
      !evidence.delivery?.receipt_ref || !verifyAttestation('delivery',evidence.delivery,ctx,anchor))) {
    errors.push('DELIVERY_UNVERIFIED');
  }
  return {status:errors.length?'BLOCKED':'VERIFIED_DELIVERED',errors,contract_digest:hash,target_revision:targetRevision};
}
if (require.main === module) {
  try {
    if (process.argv.length !== 6) throw new Error('Usage: node completion-gate.cjs CONTRACT TRUST_ANCHOR EVIDENCE TARGET_REVISION');
    const [,,contractFile,anchorFile,evidenceFile,targetRevision] = process.argv;
    const verdict=evaluate({
      contract:JSON.parse(fs.readFileSync(contractFile,'utf8')),
      anchor:JSON.parse(fs.readFileSync(anchorFile,'utf8')),
      evidence:JSON.parse(fs.readFileSync(evidenceFile,'utf8')),
      targetRevision
    });
    console.log(JSON.stringify(verdict));
    if (verdict.status !== 'VERIFIED_DELIVERED') process.exitCode=1;
  } catch (err) {
    console.error(JSON.stringify({status:'BLOCKED',errors:['VERIFICATION_ERROR'],detail:String(err.message)}));
    process.exitCode=1;
  }
}
module.exports={canonical,digestContract,attestPayload,verifyAttestation,evaluate};
