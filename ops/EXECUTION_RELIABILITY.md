# CP-EXECUTION-RESILIENCE-20261010-02 — Execution and recovery contract

Owner: 10｜アプリ開発 / kisetsu-no-bouken. Cross-project policy authority is in Control Plane SSOT. This is a repository-specific implementation contract, not a replacement Global Instruction.

## Safety baseline
- Preserve main Ruleset, Pages publishing source, release.json identity inputs, source.html, index.html, assets, questions, storage formats, and iOS 10.3.3 requirements.
- No direct writes to main except via protected PR. Unverified physical iOS 10.3.3 is NEVER considered PASS.
- Required app-ci-build tests the actual compiled homepage DOM season labels with negative controls, existing content/history tests, and checkpoint fault injection.
- Only the trusted default-branch durable workflow receives contents:write, strictly for ops-execution-state. CI and live readback have read-only permissions.
- Controller uses only GitHub run metadata, never checks out untrusted pull-request code/artifacts and never modifies application production files.

## Execution vs conversation
The GitHub Actions runner is responsible for deterministic builds/tests and checkpoint transitions, independently of an active ChatGPT session. It does NOT infer new tasks or perform additional AI reasoning after chat disconnect. ChatGPT determines the work contract and checks evidence from authoritative GitHub state.

## Durable state
Each input commit maps to release_<full_sha>. The state branch ops-execution-state stores ops/checkpoints/release_<sha>.json.
Every state transition creates one Git commit against the observed state HEAD and uses non-force fast-forward ref update; rejected concurrent attempts fail closed. State payloads include version, fence, attempt, replay ID, progress, evidence SHA and integrity hash. GitHub Actions concurrency additionally serializes workers.
Readback after every state write checks the newly committed HEAD and exact checkpoint payload. Production release evidence is tied to the same source SHA. Deterministic test failures are BLOCKED; transient or interrupted RUNNING attempts can be safely re-run once under a higher fence. State branch must never hold secrets or family information.

## Release gates
1. Pre-merge: existing Ruleset + app-ci-build, DOM month labels, all legacy tests, exact build identity, checkpoint negative tests.
2. Post-merge: trusted durable job confirms npm build/test and state readback, independent published-content checker confirms release.json and all hashed deployed files on live Pages. Each run records its triggering SHA.
3. If public validation fails: mark failed, never claim completion. Recovery Controller may rerun eligible safe jobs once, also scanning hourly for lost events.
4. If the live version is defective, halt additional promotion and use a normal revert/fix PR with required CI to restore the last verified known-good revision. Existing GitHub Pages delivery may temporarily expose the bad release; this design does not guarantee pre-exposure rollback.

## Review, fault injection and non-regression
- Reject altered checkpoint hashes, stale versions, stale fences, same-attempt restart, deterministic BLOCKED retry, missing release evidence, and malformed identifiers.
- Reject displayed ordinal prefixes (1·3・4・5がつ) or a wrong winter month.
- Verify real GitHub Actions PR run and protected-main deployment readback. Synthetic success is not production E2E success.
- Preserve 103 themes, 352 questions, 110 images, storage history and iOS10 static/AppCache compatibility.
- Do not replace existing versioned Control Plane regulations. PG-011/012/013/014/016/020/022 remain authoritative.

## Recovery from unexpected implementation behavior
Review the last successful Actions run, the exact deployment SHA, and the checkpoint on ops-execution-state. Create a revert PR for the relevant workflow/code change. Validate via app-ci-build before merge. Do not force push main, delete image assets, or overwrite completed progress. State preservation and rollback readback are mandatory.
