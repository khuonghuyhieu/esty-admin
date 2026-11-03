# Verification and Setup Handoff: Internal App Foundation

**READY_FOR_OWNER_BE_HANDOFF — scoped BE source/local work complete with the single coordinator-run005 review accepted; code remains frozen.** Current authority is this tiny feature005 documentation-only closeout, not source/setup/publication permission. The dependency window was returned and owned local resources were already stopped; retained failures and teardown evidence remain in research. No FE/BFF/browser/hosted/product-readiness claim. README/STATE and other shared documents remain unleased.

## One remaining manual setup and cross-lane handoff list

1. Supply/verify the actual first-owner Auth identity and workspace inputs through a later approved operator process; no secrets in chat, embedded production identity or public bootstrap.
2. Choose/verify actual sender/SMTP and Auth invite/recovery callback configuration. Real email remains disabled/fail-closed until setup; synthetic local Mailpit capture is not production delivery.
3. Approve retention duration/deletion/anonymization and record its policy identifier before hosted activation; no automatic purge or invented duration.
4. Coordinate future FE generated output, BFF/session/cookie/CSRF/UI work and genuine browser→Auth→Nest→DB acceptance. Do not use BE HTTP/local Auth tests as browser proof.
5. Separately approve/implement feature001 schema-changing migration-before-deploy integration with exact old/target manifest/source/artifact and unknown-outcome fencing. Current-schema-only delivery remains blocking.
6. Separately authorize real Auth/privilege activation, publication/live SQL/deployment and hosted acceptance after scoped review. Provision least-privilege `app_runtime`/`app_operator` before the app migration; verify role memberships, managed Auth compatibility and the approved app-owned boolean session function's definer ownership/visibility/ACL, not direct runtime Auth-table reads. Verify non-NULL session `not_after` expiry under a separately approved timeboxed fixture/hosted process; the current local fixture did not exercise that boundary. Never automatically replay fixture SQL against hosted services. Prior699 hosted/cfd7 CI evidence does not prove this feature.

The approved Owner/Member/workspace/email-password/minimal-settings baseline is not an open question. [spec.md](spec.md) partitions D01–D06; [research.md](research.md) holds exact dependency/resource proposals. The existing live FE session6634 stays running throughout.

## Documentation-only prerequisite check

This helper was inspected for path/pointer/Git behavior. The following check only validates document presence; success does not approve policy or prove application behavior:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/005-app-foundation SPECIFY_FEATURE_NO_PERSIST=1 bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

Do not run create-feature defaults, update-agent-context or implementation helpers. No shared pointer or existing branch is changed. The helper's feature-name `BRANCH` field is not a Git observation.

## Selected backend configuration inventory — names only

The shareable `apps/api/.env.example` and strict parser define these fields. This inventory is not an instruction to read, convert or overwrite owner files, and does not claim any real setting exists.

| Field / boundary | Purpose / exposure |
|---|---|
| `APP_FOUNDATION_ENABLED` | Explicit opt-in; absent/false preserves foundation-only runtime |
| `APP_AUTH_URL` | Fixed reviewed hosted issuer or explicitly approved literal loopback Auth endpoint |
| `APP_AUTH_API_KEY` | Server-held Auth API key; not app authorization |
| `APP_EMAIL_ENABLED`, `APP_AUTH_ADMIN_KEY` | Default-disabled send adapter; separate server-only admin credential accepted only when delivery is enabled |
| `APP_RETENTION_POLICY_ID` | Approved identifier required before hosted app activation; not an invented purge schedule |
| `APP_WORKSPACE_ID` | Exact server-selected workspace UUID, explicitly confirmed by operator |
| `PREVIEW_ACCESS_KEY`, `BROWSER_ORIGIN` | Existing technical bearer and exact caller-origin boundary; app-enabled local mode also requires technical protection |
| `DATABASE_URL`, reviewed `SUPABASE_*` tuple | Existing TLS/pool/timeouts; app mode requires the separately provisioned `app_runtime` identity |
| `APP_OPERATOR_*` | Separate explicit operator target/URL/Auth credential/identity/names/approval/confirmation; never platform runtime variables |
| Future FE server-only Auth/BFF fields | Names and secure cookie/CSRF/callback bindings remain FE-owned; no technical/admin/DB secret may receive a public prefix |

If standard browser Supabase SDK access is approved, only the project URL/publishable key receive appropriately reviewed public bindings. Never give admin/technical/DB inputs a public prefix. The owner supplies any later secrets through the approved secure workflow, not chat, this feature or a credential-store read. Do not reread, convert or overwrite existing owner files.

## Future evidence levels and acceptance journeys

These are required evidence levels, not blanket completed checks. Actual BE runs and retained failures are recorded below and in research; browser/hosted levels remain future work. Runnable command receipts stay in005 while README is unleased; canonical README handoff requires a fresh lease. Missing runtime/provider evidence is a blocker, not a pass.

| Level | Required observations | What it cannot prove |
|---|---|---|
| Focused functional/config tests | Approved matrix per operation; strict fields, JWT/issuer/audience/algorithm/session rejection; offer/recovery states; cookie/CSRF errors; sanitized dependency failures | Real provider settings, DB permissions or browser behavior |
| Real Nest HTTP + isolated PostgreSQL | Requests through actual Nest guards/services; active/disabled/foreign-object denial; transactional settings/audit; simultaneous last-owner/offer mutations; intended DB grants and cancellation | Real Supabase Auth issuance/revocation if Auth is simulated |
| Local Supabase Auth integration | Actual local Auth session/refresh/signout/recovery, managed-schema/session lookup and email capture; new/existing-identity invitation flows | Production SMTP, cloud privileges, hosted domains or paid-tier controls |
| Coordinated browser E2E | Real browser → approved frontend session/BFF → local Auth → Nest → DB, with data reloaded from DB and observable denial cases | Hosted acceptance or owner visual approval |
| Separately authorized release/hosted acceptance | Exact source/artifact/schema provenance, confirmed migration-before-deploy and real protected hosted caller/Auth/API/DB path | Historical local evidence is not a substitute |

Minimum later browser journeys:

- Sign in with an admitted identity, access its permitted workspace, force a real supported refresh, then explicitly sign out and replay the old session against the real API to observe denial.
- Exercise invalid credentials, signed-in/no-membership and disabled-member access; change a role/status through another authorized session and observe next-request denial without JWT refresh.
- Invite and admit new/existing identities through the approved local email/Auth flow; reject wrong-recipient, expired, revoked and replayed offers. No fixture-only click-through labelled E2E.
- Recover a password through local captured email and the actual Auth callback/update path; expired/reused links fail; disabled membership remains disabled. Prove the approved reset-session scope separately.
- Save self/workspace settings according to capability, reload actual persisted values, reject other-user/foreign-workspace/stale writes and inspect matching redacted audit effects.
- Exercise concurrent tab/SSR refresh, logout with a late response, cache isolation between two users, callback/Origin/CSRF rejection, public-route preservation and narrow-screen/keyboard regressions on affected screens.

Last-owner concurrency and migration uncertainty belong in deterministic real HTTP/DB or release-boundary tests rather than brittle browser timing. A synthetic second workspace may be used solely as a negative isolation fixture; that does not implement a multi-workspace product. Preserve shared local services/volumes, use only newly authorized exact loopback resources and never target production with destructive test cases.

## Future migration-delivery handoff — not execution authority

The existing digest function was executed against the generated manifest, and the unchanged production baseline still equals predecessor digest `243818c0ebe11bc6ea8b12b3224810c88e888b18ec30dd5bfe58394f1f209496`. Its sole original file is `1792972800000-foundation`, SHA256 `c3374f370c42d8543bde5771d4cddd91990e643e8969fcaf4bf1c5ffe3e4e851`. The synthetic delivery regression assembled a valid complete-app-manifest artifact and proved rejection before any provider action. No workflow, `ci-delivery.ts`, `release-core.ts` or production baseline was changed.

The final local target digest is `149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3`, computed by the existing `manifestDigest` implementation over the three generated entries: unchanged foundation, immutable applied app foundation, and appended app session-check correction. Their exact file hashes appear below. The earlier two-file development target is superseded, not a release artifact.

Future feature001 work must bind the final reviewed target manifest to separately approved clean source/tree and the exact immutable Linux release artifact. This local working-source increment is not that publication/artifact approval. Never update the production baseline merely to make delivery pass; append corrections rather than modifying an already-applied migration.

The still-serving predecessor checks exact history: any app migration addition causes its readiness check to reject the newer history. Additive SQL alone therefore does **not** establish predecessor compatibility. Before live SQL, explicitly design/verify the compatible predecessor or an owner-approved cutover window; do not waive readiness or infer that application rollback reverses schema safely.

Serialize exact-target/credential/role checks, durable migration intent, confirmed migration/history completion and only then provider create/promotion. Known commit followed by reporting/deployment failure must not replay DDL; unknown commit fences retries pending separately approved reconciliation. Preserve reports/artifacts and the single existing history. Destructive down remains refused; real retention/recovery decisions are separate.

## Actual backend verification receipt

All listed executable checks used Node24.22.1. This is local working-source evidence, not a clean Git tree, immutable Linux release artifact or independent review. `NODE24` below denotes the verified installed24.22.1 binary; the completed run's `FIXTURE_DIRECTORY` was `/private/var/folders/4h/l740s8vn7j543mbxnnjwnw200000gn/T/esty005-auth-0cerIi`, with `TMPDIR` its parent. That directory is now removed; these receipts do not authorize a restart.

| Check actually executed | Result / boundary |
|---|---|
| From `apps/api`: `"$NODE24" scripts/migration-manifest.mjs`, `"$NODE24" scripts/clean-build.mjs`, `"$NODE24" ../../node_modules/typescript/bin/tsc -p tsconfig.json` | Passed; three-entry generated manifest and compiled source/tests |
| From `apps/api`: `"$NODE24" scripts/codegen.mjs --check` and `"$NODE24" scripts/migration-manifest.mjs --check` | Passed; canonical0.4.0/BE generation current; FE generation not run |
| From root: `"$NODE24" --test apps/api/build/tests/config.test.js apps/api/build/tests/http.test.js` under empty environment with explicit Node PATH/TMPDIR/owned HOME |28/28 passed; actual HTTP/TLS/timeouts plus explicitly synthetic JWT/provider peers |
| From root: `"$NODE24" --test --test-name-pattern='current-schema-only delivery rejects the app migration manifest' apps/api/build/tests/ci.test.js` under the same isolated environment |1/1 passed; valid exact three-file app artifact rejected before provider action |
| From root: `"$NODE24" --test apps/api/build/tests/app-foundation.integration.test.js`, with `F005_ALLOW_OWNED_DB=true`, exact `F005_FIXTURE_DIRECTORY`, empty environment and explicit PATH/TMPDIR/owned HOME |9/9 passed18.66s after correction; affected rerun9/9 passed20.26s including compilation after adding concurrent acceptance/registry refusals |
| Guarded read-only post-cleanup probes against the same fixed local DB/Auth | Empty five app tables, three history entries/marker intact, both runs' registered identities absent, earlier unregistered identity preserved until fixture teardown |
| Run-bound helper stop, then owned fixture stop; empty-config Docker metadata and bind/close checks | Helper exit0; zero owned containers/networks/volumes;55440–55443 free; owned scratch removed; sanitized reports retained |

The real journey covers controlled bootstrap/replay/conflict, current membership and role denial, function owner/ACL/path and safe503 for a bad definer, session/user mismatch and direct-read denial, actual GoTrue invites for new/existing identities, simultaneous single admission, last-owner demotion races, changed/foreign/revoked/expired offers, profile/workspace revisions, atomic audit rollback, redacted/tied-cursor pagination, actual refresh/logout/recovery/reset/expired recovery and bounded SQL contention. Provider acknowledgement loss is a synthetic transport over real SQL, never real delivery uncertainty. Synthetic expired JWT coverage is not a real non-NULL session-timebox test.

Historical startup6/6 and artifact/CI/release143/176 followed by the environment-corrected affected journal33/33 remain distinct recorded runs. The initial25/28 HTTP failure, container namespace/role failures, missing host publication and RLS-induced401 are retained in [research.md](research.md); no first-run/full-suite rewrite. The legacy shared55432 integration suite was not run because this increment authorized only the dedicated55440 fixture. No browser, FE, hosted, actual SMTP or platform enforcement claim.

### Scoped source/configuration manifest

These34 current public file hashes identify the review snapshot, not a Git diff or exclusive ownership of every pre-existing hunk. Root lock/API package edits were limited to the returned exact jose6.2.15 dependency window. Feature005 documentation and the prior narrow001 plan/tasks handoff are review context; no README/STATE/AGENTS/architecture/shared-pointer/FE/workflow/production delivery source was written in this increment. Documentation hashes are excluded from this self-containing source manifest.

```text
76d8d9f4cddf46eb6e4cb334db5211c5ab8c71afddab86c26964212a83e71b9c  apps/api/.env.example
4416736cb809720359dd0d650a3d530e6c3836be683f7c1700a8da8138df9608  apps/api/migrations/1792972800001-app-foundation.mjs
49316100a5c98a852ef28ccb99d6e2a4306da9d5baf9631d4643a26d9d1c82f2  apps/api/migrations/1792972800002-app-session-check.mjs
c28c17d8d81209dabb55d18aef4126ecd091643341fe9ded069b5a9980023321  apps/api/package.json
46c63a04eeeb64d2fb425a12383e35513f569b95f63c5277335c7facba911ce2  apps/api/scripts/app-fixture-diagnostics.mjs
650b91d96836087c4ea7483636e83344f7b5257c77031519ad1927196efb576c  apps/api/scripts/app-fixture-forward.mjs
61a751f236cb3e892b60c15b2944d746ae99949e3f63acbc076a0a00960cd049  apps/api/scripts/app-fixture.mjs
a5f669e1db4de727783804c85d31e26b8c57adb2e9a3161cbe63613f939eaa27  apps/api/scripts/bootstrap-app-owner.ts
fd2042985fb03b8f8d708dec17fb5ef25d38a5d06d271f099d61b458aa1b82c8  apps/api/src/app-foundation/adapters/auth-admin.ts
902161ca29a96ff3d514e15a3bc079f7bd46c20bbd8e2f1b7b40541986abb083  apps/api/src/app-foundation/adapters/auth-http.ts
f47e5e4a528842698751cffce592789e63999f83194004cd91f8702a5b84fa38  apps/api/src/app-foundation/adapters/auth-verifier.ts
cc88094692b293ea86063261d0181533ee0f5f6b2ceceef9290dd5296609d0dc  apps/api/src/app-foundation/adapters/postgres.ts
44e83f355407ea99d14d3f11b622a8a5d4549e7499cee18172e78c5a804e7281  apps/api/src/app-foundation/application/errors.ts
cb910f7e6030953ba7d64f49bf814066b364a248d625dae894f7b4983f91d133  apps/api/src/app-foundation/application/policy.ts
9dc8206737976d2c23bd52cf3c6d766387fce7589f37930ae6312e04ddaa6b87  apps/api/src/app-foundation/application/service.ts
5d71fd7e2b16c965aa491f6a554ebe55e54bb28650af20a84352c87801a75f7d  apps/api/src/app-foundation/application/validation.ts
0ac9a5d96497450b6a35446ec6f79ce3a85700035226681ec22284dab7d115cc  apps/api/src/app-foundation/transport/auth-guard.ts
3e0838a722e149db141650c69a09988ed668e79778e5ed1279b6a28db65085c8  apps/api/src/app-foundation/transport/controller.ts
22c6988f5dbdb8425a838c3c2e9eccba0cb1d51b4fd14fb11fa5b6ec967ce56f  apps/api/src/app-foundation/transport/error-filter.ts
3fe21eb79dbb98bd7a1278ddfbd279184f1380305e920de17adee144f421b829  apps/api/src/app.ts
24562199f35df0e109f3fed1668204f56c78cb81a03d25a67be7c3cf09396193  apps/api/src/config/config.ts
8b034332a1600addef3025fd173f4a016f6d1382486b6119fdfb688fdff6551c  apps/api/src/generated/api.ts
4d7efc2678976bbadc4c0f2ac063bb47cbf260d88596b57c4c6713e014c34c4d  apps/api/src/generated/migrations.ts
bd60f5e9dfaaa857d8014dba53a00416ac3ef9b53ef31968a7d7c24bafb7a534  apps/api/tests/app-auth-fixture.ts
8f2cef5c2ee001832db28a6d37414963081ba80a22082f1f7d7239300d9e91fc  apps/api/tests/app-fixture-lifecycle.ts
b0c36d9f30066aab02dddc171949b59c3a0daa99919ddcd54e9655b426b905bc  apps/api/tests/app-foundation.integration.test.ts
abee5407a8abd32a65f4970058084d017156a471cf766d331456fb7e3cffca8f  apps/api/tests/ci.test.ts
38aee6b492b80481c53cb897935aa654edd579d9682e1516248968816b9fac8b  apps/api/tests/config.test.ts
e25fe62b640551db1649b25166bd315cb91850d27be224b7b108f5f144428a98  apps/api/tests/fixtures/auth-compose.yaml
5b64668c94203629b147d4b4c7630845b1dbd945d179c590eafded49d748479d  apps/api/tests/fixtures/init-auth-db.sh
253c86a1ecc62571a5f5ab878571dd02907d13408b7fb100f5fd314828cbec87  apps/api/tests/http.test.ts
e8fd5a7a3db2ae89526a010f8931af91ad6a4e8e88cb7337c5a38774d68f2ae7  apps/api/tests/integration.test.ts
9adc8ee3cba05ffcfdf85439b804cdf3f70935585cb55c4453b3f217fb63e088  package-lock.json
41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad  specs/001-connectivity-foundation/contracts/openapi.json
```


## Accepted scoped BE review

The coordinator reported that the single `/root/app_foundation_review` orchestration completed read-only with explicitly requested model `gpt-6-luna` and was accepted: no confirmed actionable correctness, security, regression or test-gap finding. Reviewer and coordinator both verified the reviewed quickstart SHA256 `196b6f33c23be6c11c623b5ff772e61e6ade4f211631625b2f3a86f9ad799b22` and all34 public source/config/contract/lock hashes, with no mismatch. That SHA identifies the pre-closeout packet; this documentation update changes its hash, not the source manifest.

The review covered session/JWT/RLS-definer/migration/concurrency/fixture-helper/cleanup/security boundaries. It ran no tests, builds, Git, provider or private-data actions. Independent model identity and session UUID were not exposed; only the requested model and completed review are recorded, with no invented runtime probe or UUID. No source fix or new test was required. The non-NULL `not_after` boundary remains unexercised; review found the explicit `IS NULL`/`clock_timestamp()` comparison consistent, not experimentally verified.

This resolves only the scoped BE review gate associated with T045. All33 original mixed FE/setup/release parent tasks remain open. The single six-item handoff list above remains authoritative; baseline policy is not re-asked. The current-schema-only pipeline still correctly blocks the new manifest. No publication, cloud SQL/Auth/email/provider/DNS/deployment/private-original/setup action or shared-document lease is authorized.

## Current source/local stopping point

The writer stops **READY_FOR_OWNER_BE_HANDOFF** after documentation-only consistency/preservation checks. Source remains frozen with the accepted review; no new reviewer, test/build/check rerun, fixture startup or resource job. Existing FE preview/shared services/dependencies and old records/artifacts are untouched. FE/BFF/browser/hosted/product readiness and the separately approved migration-delivery/manual gates remain outside this completed BE source/local increment.

Final read-only documentation check passed:27 local file links resolved,45 unique task IDs retained,33 historical mixed parents remained open,12 current BE subtasks carried evidence, and all34 documented source hashes matched the captured review snapshot. This check validates handoff integrity, not application behavior or independent review.

## Current pre-source consistency receipt

The scoped read-only Spec Kit pass ran the command-local prerequisite helper with `--json --require-spec --require-tasks --include-tasks`: exit0, all required artifacts present. Automated reference inventory found23 FR/SC requirements,45 unique tasks, zero uncovered requirements and zero unmapped tasks. No extension configuration was present. Current approved scope, historical supersession, sole contract/history, separated BE versus future FE/browser/release tasks and constitution were checked; no blocking inconsistency or constitution violation was identified. This is planning analysis, not independent review or source/runtime verification.

Fresh FE p0 NO-INFLIGHT/PAUSE allowed only additive005 handoff hunks in001 plan/tasks; both leases were returned directly to p0. The initial p13 prompt returned `agent_blocked`; later explicit receipts separately granted the dependency install and bounded resource starts. Those later receipts do not authorize further001 plan/tasks, README or STATE edits. Canonical contract/BE-generation ownership is separate; FE generation remains untouched.

## Historical planning verification receipt

The initial plan-only author completed the following read-only consistency pass before the later owner approval. Its POLICY_UNAPPROVED findings/status are historical, not current blanket source blockers. This was not an independent review or application verification.

- The complete prerequisite command above exited0 and returned `research.md`, `data-model.md`, `contracts/`, `quickstart.md` and `tasks.md`; required spec/plan/tasks were present.
- Eight Markdown artifacts were created only under `specs/005-app-foundation/`. No second OpenAPI JSON/YAML was created.
- Structural coverage found16 functional requirements and7 success criteria mapped to tasks; none unmapped. All33 task IDs are unique/sequential, all33 are unchecked, and every task references a requirement. All four user stories have implementation and meaningful verification work.
- Three clarification groups contain six open decisions D01–D06. All eight artifacts retain `POLICY_UNAPPROVED`. No owner answer, source permission or setup completion was inferred.
- Local Markdown file links resolved. This checks file targets, not external-link availability or every Markdown heading anchor.
- Thirteen scoped public-file hashes were compared around planning. Twelve were unchanged, including README, PROJECT_STATE, AGENTS, architecture, the shared feature pointer, root package/lock, feature001 plan/canonical contract and BE workflow. `specs/004-workspace-foundation/tasks.md` changed between snapshots; this writer did not write it and preserved the concurrent change. There is no claim that all existing repository bytes remained identical.
- No source edit, Git command, dependency install, application build/test/runtime, SQL, Auth/account/credential-store read, provider setup, deployment or new agent/reviewer was performed.

### Read-only consistency findings

| Finding | Severity for future execution | Evidence and required gate |
|---|---|---|
| A01: Team policy unresolved | High / blocks implementation | D01/D02 and the candidate matrix remain unapproved; T001/T004 must settle policy and authority before source. |
| A02: Admission/session/caller flows unresolved | High / blocks implementation | D03/D04 include bootstrap, real email delivery, recovery, cookie exposure, refresh/revocation and technical-header transition; T002/T004 gate execution. |
| A03: Persistent data and schema delivery unresolved | High / blocks implementation | D05/D06 include retention, privileges/dependencies and current-schema-only incompatibility; T003/T004 and the separately owned T027 handoff gate implementation/release. |

No uncovered requirement, unmapped task or additional structural contradiction was identified in this pass. These intentionally open choices are acceptable for **READY_FOR_OWNER_POLICY_REVIEW**, not for a resolved implementation plan. No current planning-scope constitution violation was identified; attempting source/setup before the stated gates would violate the scope.
