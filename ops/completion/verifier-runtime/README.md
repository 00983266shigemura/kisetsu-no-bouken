# Completion Contract Verifier — AWS implementation package

Status: implementation preparation only. No GitHub App, AWS stack, secret, Ruleset, or product UI has been created or changed. Deploy only after owner-controlled App and AWS access is explicitly available.

## Runtime and trust boundary

- Region: `ap-northeast-1` (Tokyo). API Gateway HTTP API receives the GitHub webhook; a small ingress Lambda verifies the raw-body HMAC and repository/installation IDs, then returns 202 only after SQS accepts the message.
- SQS Standard queue feeds one-record batches to the worker Lambda. AWS documents at-least-once delivery, so the worker uses a DynamoDB conditional lease/fence keyed by repository, PR, head SHA and pinned contract object digest. Lambda timeout is 30 s; the lease is 120 s; queue visibility is 180 s. A retry lists Check Runs by SHA and reuses exactly one run with the deterministic `external_id`. Multiple matches block rather than creating another run.
- Worker uses the GitHub App installation token only for PR read, Contents read, Check Runs read/write. The App must also have `statuses:write` for expected-source association in Rulesets. No Actions, administration, merge, deployment, or code write permission is requested.
- Contract and public-key trust anchor are read by exact S3 object version and raw SHA-256, then the contract's canonical digest/signatures are checked by the existing `scripts/completion-gate.cjs`. Evidence is fetched at the exact PR head SHA. A moved head, wrong digest, missing/invalid signature, missing check, API error, or ambiguous Check Run remains blocked.
- Lambda code signing is `Enforce`. `security-bootstrap.yaml` creates the code-signing config and must be deployed by a security-only role. `template.yaml` accepts that external config ARN; the application-stack deployer must not have `lambda:UpdateCodeSigningConfig`, `lambda:DeleteCodeSigningConfig`, `signer:StartSigningJob`, `lambda:UpdateFunctionCode`, or permission to modify the bootstrap stack. An independent release role signs and deploys the reviewed immutable artifact. No auto-deploy workflow is provided. AWS IAM separation is a deployment prerequisite and has not been verified in a live account.
- App private key and webhook secret are separate Secrets Manager secrets encrypted with a dedicated customer-managed KMS key. Lambda roles can read only their specific secret. Contract/anchor objects are versioned S3 objects; worker has read-only access to the two exact object keys. Logs exclude webhook bodies, credentials, and evidence content.

## Check semantics / false-green protection

GitHub accepts `success`, `skipped`, and `neutral` as successful states for required checks; a skipped Actions job can therefore satisfy a required check. The verifier checks exact same-SHA Actions app ID `15368` and exact run names `app-ci-build` and `completion-contract-qa`; each must have exactly one run with conclusion `success`. Any missing, duplicate, wrong-source, stale-SHA, `neutral`, `skipped`, or other conclusion fails. The App Check Run itself is completed only as `success` after the full contract result is `VERIFIED_DELIVERED`; every other terminal result is `failure`. The check is a webhook-driven App run, not a path-filtered Actions job, and the code never emits `neutral`/`skipped`.

The ID `15368` and names were read from the live check-runs for main SHA `cf0e70376b26b513e2d600cf46835520cf5167ef` on 2026-10-15; confirm them again immediately before deployment. Existing main Ruleset still requires only `app-ci-build`; `completion-contract-qa` and this App check have not been added there.

## Secret rotation and recovery

1. Generate an additional GitHub App private key in GitHub; leave the current key valid.
2. Put the new PEM into the active Secrets Manager version; mint an installation token and verify a staging Check Run on an isolated PR.
3. If any probe fails, restore the previous secret version; do not revoke the old App key.
4. After a green isolated test and expected-source readback, revoke the old GitHub key. Record key fingerprint/rotation time only, never key material.
5. For webhook-secret rotation, accept `current` and `previous` for one delivery retry window, update the GitHub App webhook secret, confirm deliveries, then remove `previous`.
6. SQS retries transient failures three times and then routes to DLQ. A CloudWatch alarm must notify an owner (SNS subscription is an owner-set destination); recovery is inspect delivery/run state, replay only the DLQ message or redeliver the same GitHub delivery, and rely on the same semantic idempotency key. Never force a green result during recovery.

## Safe staged rollout / rollback

1. Security administrator deploys `security-bootstrap.yaml` using a distinct role, reviews the Signer trust policy, then application deployer deploys `template.yaml` with the bootstrap output ARN. Deploy only to an isolated AWS stack and a private/draft test PR; do not change main Ruleset.
2. Prove invalid HMAC, wrong repository/install, wrong SHA, absent evidence, bad contract digest/signature, missing Actions check, failed QA, `neutral`, and `skipped` all end blocked. Prove valid synthetic signed evidence produces success only in an isolated test fixture.
3. Read back the App ID on the Check Run and verify source selection in a temporary/staging Ruleset if available. If no isolated Ruleset is available, do not modify main yet.
4. For production cutover, first generate a real App Check on a draft PR. Add the App check as an additional main required check pinned to that App; retain `app-ci-build` and all existing rules. Verify merge blocking under failure and passing only after independent App success.
5. If failure/timeout occurs, do not bypass or remove the existing `app-ci-build`. Rollback is to disable the App webhook/worker and remove only the newly-added App check requirement after the owner confirms; existing required check and branch protections remain. No direct pushes or forced merges.

## Monthly cost estimate (planning, not an AWS quote)

Assumption: Tokyo region, 1,000 webhook deliveries/month, average ingress 128 MB/200 ms and worker 512 MB/1.5 s, about 1 GB log ingestion, one standard queue, one on-demand table, two secrets, one customer-managed KMS key, two standard alarms, no NAT Gateway, no provisioned concurrency, no cross-region replication. Excludes tax, data transfer outside AWS, existing AWS credits, and one-time engineer time.

| Item | Planning estimate / month | Basis |
|---|---:|---|
| Secrets Manager | $0.80 + small API-call charge | 2 secrets at $0.40 each |
| KMS | about $1.00 | 1 customer-managed key |
| API Gateway HTTP API | under $0.01 | 1,000 requests; published US region baseline $1/M, confirm Tokyo calculator before provisioning |
| SQS | under $0.01 | a few thousand send/receive/delete calls |
| Lambda | under $0.05 | assumed low volume and execution durations |
| DynamoDB + CloudWatch | about $0.10–$1.00 | on-demand read/write, 1 GB logs and two alarms; varies by actual region and retention |
| **Total** | **roughly $2–$3/month** | expected low volume; verify in AWS Pricing Calculator before deployment |

AWS's Secrets Manager and KMS published rates form most of the fixed cost; Lambda, SQS, API Gateway and DynamoDB are usage-priced at this volume. No always-on server or NAT Gateway is used.

## Setup / operating effort

- Initial owner + engineering setup: estimated 4–8 engineer-hours after AWS account/region and App install are available; includes secret provisioning, Signer profile, stack deployment, one isolated negative/positive suite, Ruleset source readback, and rollback rehearsal.
- Recurring: estimated 30–60 minutes/month for alarm/DLQ review, evidence aging review and cost glance; key rotation roughly 15–30 minutes per rotation after the first tested runbook. These are estimates, not measured service operations.
- There is no independently configured evaluator provider in the current connected tools, so the blind strategy suite is packaged but not graded here.
- Deployment artifacts currently pin direct AWS SDK versions, but a package lock could not be generated in this restricted workspace because npm registry access is unavailable. Generate and review `package-lock.json` in the approved build environment before signing; do not sign an install resolved without a lockfile.

## Rollback boundaries

Rollback never rewrites main, never deletes checkpoints or evidence, and never removes `app-ci-build`. Revert only the App-specific Ruleset requirement after disabling the App endpoint; retain stack artifacts and readback evidence for audit. If the verifier is down, the App check stays absent/pending/failed and merge remains blocked.
