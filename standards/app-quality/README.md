# app-quality-contracts — incubation v0.1

Canonical pilot: this repository's `acceptance/contract.json`, `acceptance/evidence.json`, and `scripts/check-acceptance.cjs`.
Owner: 00 ChatGPT Control Plane (governance); authority for live code: GitHub SHA.

## Invocation contract
1. Read the exact target repository HEAD, branch list, release workflow and rulesets.
2. Read the acceptance contract and source evidence. Do not equate a simulated test with real-device proof.
3. For PR: run schema validation, negative tests, original app tests, generated-file integrity.
4. For deployment: require every mandatory gate PASS with proof bound to exact release SHA; otherwise STOP release, preserve public last-known-good.
5. Do not mark change complete before PR/Actions readback and public URL live proof.

## Promotion policy
This v0.1 pilot is NOT a verified cross-repository capability and is NOT yet installed in ChatGPT Project Instructions.
Once this pilot passes E2E, migrate reusable primitives to a dedicated public `app-quality-contracts` repository, pin external workflow dependencies to immutable SHA, maintain release notes and rollback SHA, and audit another repository before claiming general availability.
Avoid copying the extensive contract into Global Instructions.

## Rollback
Keep main at last-known-good SHA until mandatory acceptance and GitHub ruleset gate pass. Any versioned policy supersession requires Control Plane PG-022 semantic non-regression and PG-020 release non-regression.
