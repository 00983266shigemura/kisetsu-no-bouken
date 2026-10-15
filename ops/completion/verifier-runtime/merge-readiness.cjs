'use strict';
// A PR-merge gate is NOT a delivery-completion certificate. This stage only
// checks pre-merge acceptance and provenance; all final ACs and delivery
// receipts remain required by completion-gate.cjs for VERIFIED_DELIVERED.
const {digestContract,verifyAttestation}=require('./completion-gate.cjs');
const PREMERGE_IDS=['AC-G01','AC-G02','AC-Q01'];
function assessMergeReadiness({contract,anchor,evidence,targetRevision}) {
 const errors=[];
 if(!contract||!anchor||!evidence||!targetRevision) return {status:'BLOCKED',errors:['INPUT_MISSING']};
 const digest=digestContract(contract),ctx={contract_digest:digest,target_revision:targetRevision};
 if(anchor.contract_id!==contract.contract_id||anchor.revision!==contract.revision||
    anchor.sha256!==digest||anchor.approval_ref!==contract.approval?.ref) errors.push('CONTRACT_TRUST_FAILED');
 if(evidence.contract_digest!==digest||evidence.contract_revision!==contract.revision||
    evidence.target_revision!==targetRevision)errors.push('EVIDENCE_REVISION_FAILED');
 if(!evidence.authority?.authorized||evidence.authority.approval_ref!==contract.approval?.ref||
    !verifyAttestation('authority',evidence.authority,ctx,anchor))errors.push('AUTHORITY_FAILED');
 if(evidence.quality?.critical_findings!==0||
    !verifyAttestation('quality',evidence.quality,ctx,anchor))errors.push('QUALITY_FAILED');
 if(!Array.isArray(contract.acceptance))errors.push('CONTRACT_ACCEPTANCE_MISSING');
 const acIds=(contract.acceptance||[]).map(x=>x.id);
 if(new Set(acIds).size!==acIds.length)errors.push('DUPLICATE_CONTRACT_AC');
 for(const id of PREMERGE_IDS) {
   const ac=(contract.acceptance||[]).find(x=>x.id===id);
   if(!ac||!ac.required||!['D','E'].includes(ac.type)){errors.push('REQUIRED_PREMERGE_AC_MISSING_'+id);continue;}
   const p=evidence.acceptance?.[id];
   if(!p||p.status!=='PASS'||p.target_revision!==targetRevision||!p.source||
     !verifyAttestation('acceptance:'+ac.type+':'+id,p,ctx,anchor)){
      errors.push('PREMERGE_EVIDENCE_INVALID_'+id);continue;
   }
   if(ac.type==='E'&&(p.rubric_ref!==ac.rubric_ref||p.critical_findings!==0||
      p.counterevidence_reviewed!==true||
      !Array.isArray(p.supporting_sources)||p.supporting_sources.length<2||
      !p.reviewer||!p.producer||p.reviewer===p.producer))errors.push('PREMERGE_QA_INVALID_'+id);
 }
 return {status:errors.length?'BLOCKED':'MERGE_READY',errors,contract_digest:digest,target_revision:targetRevision,phase:'PREMERGE_ONLY'};
}
module.exports={assessMergeReadiness,PREMERGE_IDS};
