# Completion OS v1.1 quality acceptance rubric

Contract: CP-COMPLETION-OS-20261015-01-R2-PILOT. Owner: 10｜アプリ開発.

## D: deterministic
Accept only a real run/commit/deployment pointer attributable to the target revision. Mere presence of a text label does not establish source authenticity. A failed, missing, stale or mismatched check is BLOCKED.

## E: evidence-based
Evidence must include: (1) a rubric matching the approved contract; (2) two individually traceable, independently derived sources; (3) a documented counterargument / contradictory evidence review; (4) producer and reviewer identities separated; (5) zero critical findings. PASS is a documented evaluation result, not a guarantee of objective truth or a substitute for independent expertise.

Critical faults: unsupported central claim; factual contradiction; causal inference unsupported by evidence; significant alternative ignored; misleading guarantee about product/surface capabilities; privacy or safety regression. Any unknown critical risk => BLOCKED/UNVERIFIED.

## H: human-decision
A proposal can be VERIFIED_DELIVERED without the user's adoption decision when the adoption condition is explicitly marked optional. Irreversible action, widened authority, weakened acceptance or policy deployment needs its own approval where required.

## Enforcement and limits
This repository verifier is **not a trusted anchor by itself**. Run it from a protected source with a protected, pre-approved contract digest, using an independently controlled service identity. A PR may alter workflow/verifier unless the ruleset denies bypass and binds a trusted source. Until those controls have been independently verified, enforcement grade is UNVERIFIED, not L3.

## Fault acceptance
Reject missing/failed gate, unauthorized execution, target revision mismatch, contract/digest tampering, failed quality, missing independent reviewer, deleted AC, missing receipt. Recovery tests must preserve existing durable state and produce zero duplicate side effects. Synthetic unit tests are not production E2E evidence.
