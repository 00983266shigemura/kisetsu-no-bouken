# APP-GATE v2 — release contract, proof and rollback

## State
This branch prepares quality controls only. Current GitHub Pages main/root deployment remains unchanged until protection, evidence and production end-to-end verification are complete.
The existence of an Actions test passing does **not** establish iOS 10 physical-device compatibility, human content recognition, rights clearance, or full release readiness.

## Gate policy
- Required gates: EDU_240, ART_103, LEGACY_IOS10, OFFLINE_IOS10, GAMEPLAY, PUBLICATION, CONTENT_RIGHTS.
- All mandatory evidence defaults to UNVERIFIED and **must** stay UNVERIFIED until independently verified. No PASS by inference.
- Each PASS contains a concrete HTTPS proof URL, assessor, verified timestamp, and 40-character SHA of the approved source.
- The release script requires evidence SHA == workflow GITHUB_SHA (strict initial policy); documentation-only revisions currently require new evidence. Future relaxation requires an auditable impacted-component fingerprint.
- Human evidence cannot be authenticated by static JSON alone. A trusted reviewer and original dated records remain necessary. The script verifies completeness and SHA binding, not the truth of real-world observations.

## Safe migration order
1. Review app-quality PR and verify BOTH build and acceptance checks pass.
2. Turn on branch ruleset on main: require PR and both checks; disallow force pushes/deletion and bypass; admin is not exempt. Verify by readback and a blocked test merge.
3. Only after PR protections are operational, merge build-read-only and acceptance controls; confirm existing live Pages main/root still serves the last known-good site.
4. Set up Pages -> Build and deployment -> Source: GitHub Actions. Run gated-pages only after ALL required evidence PASS for exact deploy SHA; capture public HTTP and physical offline checks. If step cannot be fulfilled, do not switch Pages source.
5. Preserve old source and live artifact for rollback. Do not delete existing branch or asset-refresh branch.

## Limits
- GitHub connector cannot create repository rulesets or modify Pages publication source. Such GitHub settings require an admin UI step.
- This branch does NOT assert the seven gates are already passing.
- Existing Pages branch/root will still publish any main mutation until the settings migration. Do not merge content changes until gate protection and deployment path are verified.
