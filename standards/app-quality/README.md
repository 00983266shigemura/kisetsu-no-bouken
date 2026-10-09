# app-quality-contracts — pilot v0.2 (NOT production-wide)

This repository incubates the shared acceptance contract and checker for possible later reuse by other small web applications.

**Canonical source for pilot**: `acceptance/contract.json`, `acceptance/evidence.json`, `scripts/check-acceptance.cjs`, `acceptance/RELEASE_RUNBOOK.md`. Contract v2 separates predeploy evidence from postdeploy live receipts and excludes evidence.json from its source fingerprint.

## Invocation and provenance
1. Inspect exact current repository main head, pending branches, rulesets and Pages source.
2. Fetch contract + verifier from the same immutable commit. Refs copied into other projects must be pinned to a full 40-digit SHA, not `main`.
3. Run `node scripts/check-acceptance.cjs --validate` and `--self-test` before PR. Check `--predeploy` during deployment.
4. Use real browser/device and human educational/image review evidence where automation is insufficient. Unavailable evidence remains UNVERIFIED.
5. Never claim a deployment is complete without live HTTP, release.json SHA, offline MIME and the actual target-device testing required by contract.

## Rollout limits
Cross-app adoption requires a dedicated public repository containing a generic schema and reusable workflow, a real second-repository caller E2E, Control Plane version registry, rollback SHA, and compatible Project router. This pilot **does not fulfill those tasks yet**, and no Project Instructions have been updated.
Keep Global Instructions unchanged and avoid duplicate long instructions across Projects.
