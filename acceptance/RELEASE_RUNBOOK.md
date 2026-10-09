# APP-GATE v2: release and rollback instructions

## State
This PR remains a **draft** while main/root GitHub Pages deployment is active. Do not merge until main protection is measured and production migration is safe. Preserve main SHA 8ed8487dcc6585e51ba0385be2554793aec71904 and existing asset-refresh branch.

## Evidence contract (v2)
- Source fingerprint: SHA-256 digest of source.html, build.js, test.js, acceptance/contract.json, and scripts/check-acceptance.cjs, with path separators. `acceptance/evidence.json` is EXCLUDED to prevent unresolvable self-reference.
- Mandatory PREDEPLOY: EDU_240, ART_103, LEGACY_IOS10, OFFLINE_IOS10, GAMEPLAY, CONTENT_RIGHTS.
- Mandatory POSTDEPLOY: PUBLICATION; a publicly read back `release.json` stamped with GitHub SHA and source fingerprint plus verified HTTP and MIME. Postdeploy receipt is a separate Actions artifact. A postdeploy check can never be required before deployment.
- PASS requires full subject digest, valid HTTPS evidence URL, assessor, and timestamp. UNVERIFIED/FAIL blocks the relevant phase. Required N/A is forbidden.
- A signed URL is not independent attestation. Manual evidence needs trustworthy dated capture and reviewer judgment. Static code checks cannot prove an actual iOS10 physical-device test or accuracy of 103 drawings.
- Evidence on a source-edit must be re-verified; evidence-only changes do not invalidate the source fingerprint.

## Safe migration
1. Verify build + app-quality PR jobs; keep this PR DRAFT until protection configured.
2. Admin must create an ACTIVE branch ruleset for `main`: pull request required, unique mandatory job checks `legacy-build` and `acceptance-contract`, no bypass, no force push, no deletion. Test blocked merge in a safe test branch, verify settings readback; do not require a human reviewer for a solo project.
3. Merge after protection is active and PR checks PASS. At this point the build job no longer writes to main, but main/root source may still be active. Confirm old public app is intact.
4. Once genuine physical-device and human content QA is complete, enter verified PASS evidence for all six predeploy gates, bound to source digest.
5. Configure GitHub Pages publication source to `GitHub Actions`, with `github-pages` environment restricted to main. Run `gated-pages` from main; verify that predeploy gate, deployment and postdeploy receipt are PASS.
6. Do NOT claim full release completion until postdeployment evidence and, when environment changes affect legacy offline behavior, a physical-device postdeploy spot check are actually complete.
7. If required device or rights verification is not available, preserve the current live site and stop new release; do not infer PASS.

## Limited tooling
Connected GitHub app has repository content/PR actions but no ruleset mutation, repository creation or Pages publication-setting mutation tools. These settings require UI administration. A pilot shared capability remains in `standards/app-quality/`; cross-repository promotion is not yet guaranteed.

## Rollback
Preserve last-known-good artifact and prior Pages setting before any migration. Revert bad PR changes through normal protected PR workflow; for an outage, recover last known-good release artifact and record incident + verification. Never delete original before recovery E2E.
