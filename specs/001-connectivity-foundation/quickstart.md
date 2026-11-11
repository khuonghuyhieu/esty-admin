# Connectivity foundation validation guide

## Retained-artifact manual workflow — READY_FOR_REVIEW

The bounded source/local correction now separates explicit manual activation from ordinary delivery. This section supersedes the older missing-channel continuation below only as a source implementation/status record; it does not authorize real input consumption. Coordinator t11c independently resolved the earlier default-profile403 through the approved gh-lovora profile and reported repository admin/maintain/push plus the names-only be-production inventory: `BE_PREVIEW_ACCESS_KEY`, `VERCEL_AUTOMATION_BYPASS_SECRET` and `VERCEL_TOKEN` already exist; the six intended new activation destinations were absent. OMP did not repeat that account inspection or transfer any value.

The existing workflow accepts explicit `mode=activation` with `activation_artifact_id=13587251015`. `BE_ACTIVATION_ENABLED=true`, canonical approved packet JSON/hash and `BE_ACTIVATION_WORKFLOW_SHA` matching the actual reviewed workflow/main commit are separate prerequisites. They do not require or change GitHub's broad `BE_DELIVERY_ENABLED` variable. Ordinary PR/push/current-schema/versioned checks/build/delivery retain their existing broad gate; only the explicit manual lane skips a fresh build.

`activation-retained.mjs` validates retained run42404748672/attempt1, successful checks128499919011, artifact ownership/name/source/tree/digests/expiry, actual current workflow identity and full sealed packet/bundle. Retrieval uses contents:read/actions:read. Its current-run relay contains only the unchanged original tar and an independently hashed nonsecret selection receipt; it is transport, not a new release. The separate contents:read/deployments:write job revalidates both before executing helpers. Protected be-production, noncancel production serialization, ordered phase credentials, durable unknown-state fences and the final external FE hold remain.

The workflow-owned `manual-activation.mjs` uses unchanged sealed exports for provider/journal/delivery and the original sealed CLI for private phases and pre/postflight. Workflow run/head remain real; release source stays f162/tree181b2c01/artifact82419e36. Its real current-main check validates the reviewed workflow head and separately checks the fixed source commit/tree; it never forges GitHub responses or overwrites `GITHUB_SHA`. Fresh private operator children use the retained build identity and process-local compatibility markers, not a repository-variable toggle.

### Future read-only pre-dispatch validation contract

After coordinator review acceptance and separately authorized publication, the supported metadata/full-public-bundle preflight is:

```sh
GH_CONFIG_DIR="$APPROVED_GH_CONFIG_DIR" node apps/api/scripts/activation-retained.mjs preflight \
  "$APPROVED_PUBLIC_PACKET_PATH" "$APPROVED_PACKET_SHA256" "$REVIEWED_WORKFLOW_SHA" "$VERIFIED_PUBLIC_RETAINED_BUNDLE"
```

Use the already approved GitHub profile and existing public packet/bundle; do not reopen prepared phase inputs, extract credentials or repeat setup. This command checks canonical packet/hash, actual main and retained metadata/expiry, then the complete sealed bundle/packet. It neither dispatches nor approves activation. The new workflow SHA must identify the reviewed, published workflow source, not f162. Actual secret/variable transfer, publication and dispatch remain separately authorized coordinator operations; README's existing owner checklist is unchanged.

### Actual source/local verification

- Isolated TypeScript compilation: exit0. Network-denied affected `ci.test.js`: **66/66 PASS**, no skips, including the opt-in actual retained bundle and real sealed provider/journal functions with synthetic transport.
- Existing pinned OrbStack Linux/x64 Node24.22.1, network none: actual selector CLI → fixed archive verification → tar extraction → full bundle validation → pre-dispatch preflight → unchanged sealed `prepare` → manual CLI/sealed-provider `reserve` all exited0. Exactly one synthetic durable reservation was acknowledged; a repeated reservation exited1 before another POST. Journal next phase remained `bridge-config`, with zero phase effects. New focused tests on Linux: **9/9 PASS**, including lost-acknowledgement, changed-main and changed-predecessor fences.
- Existing js-yaml4.3.2 parsed the workflow; all41 actual shell blocks passed syntax checks. All480 local workflow-expression cases and96 executions of the actual completion shell passed. The25 phase steps retain exact order and credential isolation; retrieval/provider permissions remain disjoint. Python PyYAML was unavailable; no parser/dependency was installed.
- Evidence: `.openai/reports/retained-manual-ci5o5yfc/verification.json`, `linux-evidence/smoke-result.json`, test logs, workflow reports and the exact eight-path `handoff.json` manifest. Owned build/harness/public transport fixtures are removed; original f162 bytes, prior evidence and synthetic receipt evidence remain.

These are OMP local results, not a GitHub Actions service run, independent review, cloud/SQL/deployment proof or real input transfer. Synthetic metadata deliberately uses a workflow head/run distinct from f162; no live GitHub response was altered. No new image pull, installation, source publication, secret/variable write, workflow dispatch or real phase occurred. Existing inputs and UNKNOWN81d4/454 remain untouched.

**READY_FOR_REVIEW / NOT_READY_TO_CONSUME_EXISTING_INPUTS / NO_INFLIGHT / STOP WRITES.** Coordinator t11c owns ONE new scoped gpt-6-luna review against the frozen manifest. Earlier helper reviews below do not cover this new control path.

## Hidden-TTY activation input helper

### Current continuation — review accepted; real dispatch proved; provider execution context gated

Coordinator t11c reports the **ONE scoped gpt-6-luna review ACCEPTED, no actionable findings**: all nine manifest paths/hashes matched, and the reviewer ran no tests. Its explicit limit remains: the reviewed Linux E2E exercised `check-handoff`, not production worker/CLI execution. No review rerun or source fix followed.

Static inspection confirmed the real adapter already exists: `activation-input-helper.ts:408–410` invokes the unchanged sealed `operator/apps/api/build/scripts/activation.js`; `isolatedInputWorker` spawns the pinned Node with seven positional arguments and a fresh phase-scoped environment/cwd, suppressing child output. The actual f162 entry implements the same seven-argument contract and `run` dispatch. No adapter, launcher, test or production artifact was edited.

A separate network-none synthetic probe now exercised **`handoff`, not `check-handoff`**, against unchanged f162/artifact82419e36. For each of the five phases, an event-triggered observer read only its owned child command line and confirmed actual Node → sealed entry → `run PHASE` with seven arguments. **All five children exited1/fenced; zero successful phase effects are claimed.** No reservation/authorization/journal was fabricated. The generic suppressed worker refusal does not identify its exact internal failing check; a reserved synthetic journal was deliberately absent. Changed token bytes and bound phase both refused before child creation, and synthetic values were absent from captured output. No provider, database or production CLI effect occurred.

The observer retained the actual OrbStack command prefix (`/usr/local/bin/node /usr/local/bin/node --no-opt -r /proc/.p`) rather than assuming the entry immediately follows the executable. This is proof on the authorized existing OrbStack Linux/x64 runtime, not a pristine non-interposed Linux-host claim. Initial harness digest-newline, predecessor syntax and observer-prefix failures remain recorded; only disposable probe code changed. The immutable helper/runtime guards were not changed or bypassed.

**Concrete continuation gate: `PROVIDER_EXECUTION_CONTEXT_MISSING`.** A names-only current-process check found no `GITHUB_TOKEN`, `VERCEL_TOKEN` or `BE_PREVIEW_ACCESS_KEY`; no complete packet environment was supplied either. The existing five prepared phase envelopes deliberately do not provide the separate provider context required by sealed `reserve`, `authorize` and `confirm`. Existing public real-execution metadata records no complete activation packet/reservation, and no later approved packet/provider-context path was supplied. This does not mean owner secrets or the five prepared inputs are missing globally; authenticated CLI/storage availability is not credential delivery to the isolated worker.

Continue only with a supported approved isolated provider channel and complete approved packet/fresh journal binding. Do not extract auth stores, repurpose a configuration token into provider credentials, enable broad delivery, fabricate a reservation, replay/unlock81d4/454 or ask for values in chat. Existing owner phase inputs remain entirely unread/unhashed/unmounted and must not be re-prepared. No real phase was attempted.

Evidence: `cross-platform-resume-bhwcyrpm/sealed-invoke-1a_vurm3/verification.json` under the existing helper report directory, SHA256 `5b016dab0b2a64ac5b443b9ee56328d64c824ab27ac701d4729b2a7a312d6811`; `result.json` and five `invocation-*.json` records distinguish observed dispatch from phase success. Adjacent `handoff.json` freezes this additive four-document closeout and unchanged source/executable identities. Owned probes/fixtures were cleaned; failure evidence, helper, image and f162 remain preserved.

**REVIEW_ACCEPTED / ACTUAL_DISPATCH_PROVED / NOT_READY_TO_CONSUME_EXISTING_INPUTS / NO_INFLIGHT / STOP WRITES.** No new application source merits fix-only inspection, no independent test rerun occurred and no new review starts. The older READY_FOR_REVIEW sections below retain their original check-only evidence, not current pending-review or production-readiness claims.

### Current continuation — portable helper READY_FOR_REVIEW; existing inputs remain held

The owner/t4y separately authorized acquisition of exactly `docker.io/library/node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea` for linux/amd64 on existing OrbStack. Acquisition, selected child/config verification and actual Node24.22.1 Linux/x64 identity checks passed. This supersedes only the earlier unavailable-runtime prerequisite below; all failed availability and preparation evidence remains historical. **Do not rerun prepare, re-enter fields, mount or consume the existing real prepared directory.**

The new helper uses a version2 manifest with the same exact code/dependency inventory on both platforms and separately pinned Darwin/arm64 and Linux/x64 Node24.22.1 hashes. The Linux image's Node binary is root-owned0755; only that runtime read expects UID0. The helper tree, manifest and private inputs still require caller ownership, unchanged modes and exact inventory/hash checks. No wildcard, platform bypass or legacy-manifest compatibility path was added.

The guarded interface is now:

- Darwin `bind-handoff PLAN_PATH PLAN_DIGEST BINDING_PATH`: the independently approved metadata plan binds the executable/request/complete activation packet, phase/action, and exact canonical source/destination paths. The source validates all five existing phase schemas, sealed artifact/source/tree, seven private files and receipt; it creates a new0600 `handoff-binding.json` beside `handoff-plan.json`, without changing prepared inputs. Its digest covers every input file's exact bytes, including configuration tokens, and the selected CLI file identity. No input values enter command arguments, output or the binding.
- Linux `check-handoff BINDING_PATH BINDING_DIGEST`: use the same approved portable executable through its hash-checking launcher and explicitly read-only mapped paths. It revalidates the bound runtime, destination paths, request/packet/artifact/inventory, input hashes, selected phase schema/receipt and CLI file before reporting validation. It invokes no production worker.
- Linux `handoff BINDING_PATH BINDING_DIGEST`: the same validation precedes the unchanged isolated sealed-worker dispatch. The old nine-argument interface described in historical sections is retired, not an alternate route. Only `roles` accepts `preflight`/`postflight`; other phases require `run`. Inputs persist until separately authorized reconciliation/discard.

These are interface contracts, **not commands authorized against real inputs**. A later independently approved complete activation packet and source/destination plan, coordinator review acceptance and explicit real-consumption authority remain required. This increment generated only synthetic test packets; it did not approve a real packet or change the f162 production artifact.

Actual checks: corrected isolated compilation0; network-denied affected helper/launcher/private-conversion tests **32 PASS, 1 opt-in Linux skip**; separate actual guarded Darwin PTY preparation/source binding to bounded Linux check-only consumption **1 PASS**, accepting all five synthetic phases. Seven Linux refusal cases passed: changed configuration-token bytes, sealed artifact, runtime hash, input destination path, bound phase, unsafe mode and symlink. Synthetic values were absent from guarded output/binding; worker/CLI execution sentinels were not reached. After the runtime-owner correction, the affected launcher suite passed **7/7**. These are OMP results, not independent reviewer results or actual provider/SQL/activation proof.

The first fixture compile failure and first actual Linux runtime-owner refusal are retained. The latter exposed the root-owned pinned Node versus caller-owned payload distinction; the corrected snapshot passed actual Linux execution without relaxing payload/manifest ownership. Containers used `--pull never`, network none, read-only root, UID501:GID20, dropped capabilities, no-new-privileges, pids64,512MiB,1CPU and bounded tmpfs, with only owned public/synthetic read-only mounts and no socket/repository-root mount. One-shot containers removed themselves; only owned build scratch is removed. The acquired image and immutable failure/final snapshots remain.

Evidence directory: `.openai/reports/activation-input-helper-d9qdx0wc/cross-platform-resume-bhwcyrpm/`. Final `portable-helper-02` is bound by `portable-executable-02.json`, SHA256 `266ea68900938214e08e9a5050659a144097b893eff17b67d5e11f8b3ebcb577`; launcher SHA256 `8ccf71a9d2035ecaa155bf81b94000aba92bad9119b5b9789e848e3f992504df`. Inventory:6321 files/683 directories, including6248 unchanged dependency files. `verification.json` SHA256 `50edd32ecb1ecc058d5dbd120bff9731ac6d0dc5f13c07916cd769589f6542ae` records actual checks, pins and retained failures; adjacent `handoff.json` freezes the exact source/docs review scope.

**READY_FOR_REVIEW / NO_INFLIGHT / STOP WRITES.** Coordinator t11c owns the single scoped gpt-6-luna review. New review: NOT RUN. Ready to consume existing real inputs: NO. No real private-input access, f162 rebuild, shared dependency changes, provider/config/SQL/bootstrap/deploy, Git, FE/shared-documentation work or new reviewer occurred.

The following unavailable-runtime and one-prepare sections are retained historical receipts, not the current instruction or permission to repeat preparation:

### Current continuation — Linux runtime dependency blocked; preserve existing inputs

The owner subsequently reported INPUTS_READY; the separately authorized supplied-directory metadata verification passed, but activation did not start because the accepted Darwin/arm64 executable's handoff requires Linux/x64. That prior verification opened no phase payload. The one owner prepare authorization below is historical, not permission to prepare again.

The new narrow source/local continuation is synthetic-only and conditional on an already-authorized isolated Linux/x64 runtime. Actual read-only availability checks found no cached approved Node24.22.1 image/index/child/config alias on the active local Docker daemon, no existing isolated Node container, and no socket at the historical `/var/run/docker.sock` endpoint. No pull/install/container/service start or use of unrelated services was performed.

**BLOCKED_DEPENDENCY — implementation: NO; cross-platform runtime exercised: NO; new review: NO; ready to consume existing inputs: NO.** No source/tests were changed, no Darwin-to-Linux synthetic transfer or new tamper suite ran, and old Darwin checks are not cross-platform proof. Existing owner inputs remain unread/unhashed/untouched during this increment; no prepare retry, input mount/use, provider/config/SQL/bootstrap/deploy or DISCARD.

Required prerequisite: an already-authorized isolated Node24.22.1 Linux/x64 runtime, or separate authorization to acquire the previously pinned official image `docker.io/library/node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea`. This guide does not authorize acquisition. Actual synthetic transfer/refusal proof and the coordinator's scoped gpt-6-luna review must precede consumption. Evidence: `.openai/reports/activation-input-helper-d9qdx0wc/cross-platform-dkm72ojd/runtime-availability.json`, SHA256 `2a676168a38d03d201e09c632c429aca96da5a1bdc1f3d6d7046bd31c347401c`; adjacent `handoff.json` freezes this docs-only gate and source hashes. **NO_INFLIGHT / STOP WRITES.**

### Current authorization — inspection accepted; one owner-operated prepare

Coordinator t11c accepted the targeted diagnostic-fix inspection: handoff/verification/executable hashes and all seven changed-path hashes matched, with no actionable finding. The22/22 tests, compilation and synthetic smokes remain OMP results; the coordinator did not rerun or independently verify them. The actual owner's original failure cause remains **UNPROVEN**.

Owner/t4y's subsequent decision lifts REAL_INPUT_HOLD for **exactly ONE owner-operated corrected `prepare`**, using the unchanged first command block below and only the accepted `guarded-diagnosis-wixzokt9` executable. This current receipt supersedes the historical "awaiting inspection", "held candidate" and HOLD wording below only for that single attempt. No second attempt after failure/cancellation, agent-operated helper run, output polling/collection or provider/SQL/config/activation is authorized. Successful preparation does not authorize continuation into activation. This closeout asserts authorization, not an observed owner execution or result.

Accepted helper source SHA256: `431d067328251a0e18a89dbb617b3f5f04e8d5481ee13c6162d9a49712d0a11b`. Accepted immutable `handoff.json`: `169519fa2d4b3af3e52f2b8643dcb7168f6cbb528f592f15e97c3abcfc74533d`; `verification.json`: `048896093e5273f70885be64a6bbb50dc4aa954c15838908c731d4ec9abb52f0`; `final-executable.json`: `2b6107e526fb3b847ce3ca8c217f2d83fabd0e50392deb6da5de76415086c22c`, all under `.openai/reports/activation-input-helper-d9qdx0wc/guarded-diagnosis-wixzokt9/`. The original request canonical digest remains `cc9a1904622e814685e1539d6148ceb73d9d90b2658c15fed1b8f24bf2131970`; no identity is regenerated. Adjacent `review-closeout.json` records only this additive documentation/status closeout; earlier receipts and source/executable bytes remain unchanged.

**FIX_INSPECTION_ACCEPTED / ONE_OWNER_PREPARE_AUTHORIZED / NO_INFLIGHT / STOP WRITES.** No source/test/build/reviewer/helper/secret/provider/SQL/config/activation work occurred in this closeout.

### Historical diagnostic HOLD — superseded only by the one-attempt authorization above

**HOLD — corrected diagnostics await targeted coordinator inspection.** Do not run another real-input prepare or any activation phase. Synthetic checks pass, but the owner's original private-input cause remains unproven. The corrected command below is a held candidate, not retry authorization.

Historical acceptance before the current HOLD:

The original T139 two-finding P2/P3 review and accepted fixes remain intact. Coordinator t11c has also **accepted the automatic-composition requirement correction through read-only fix-only inspection**, with no additional actionable finding, and confirmed all11 handoff hashes matched. No new reviewer or check rerun occurred; reported20/20 tests and smoke remain OMP evidence, not independently rerun verification. **READY_FOR_OWNER_MANUAL_INPUTS**: the owner no longer authors JSON envelopes. This docs-only closeout collects no real inputs and performs no activation. Existing f162/Linux artifact `82419e360517389f1e20c23d43f0e5948518ad659f0f8a87b9f41abcb8d302d2`, original private identities and prior evidence remain unchanged; the helper is external local tooling, not a rebuilt release.

### Exact corrected owner command — HOLD pending inspection

This corrected command replaces prior helper commands only after coordinator acceptance. Before executing Node or the launcher, the empty-environment shell checks their exact SHA256 values. The standalone launcher verifies the approved manifest, exact Node24.22.1/Darwin/arm64 runtime, and all6320 files/683 directories in the frozen helper/dependency snapshot before importing helper code or prompting. ESM/CJS imports cannot fall back outside that tree. Each validation child is checked again before receiving its isolated input and starts through the verified launcher.

The existing0600 request in its0700 owner directory preserves the previously generated run/workspace, approved Hieu/Lovora/manual-retention-v1 binding, exact f162 source/tree/artifact and CI run42404748672. The final argument is the **canonical request digest**, not the pretty-printed file checksum. No UUID or credential is placed in the command:

```sh
env -i PATH=/usr/bin:/bin /bin/sh -c 'printf '\''%s  %s\n'\'' '\''6f32069480ec14d52b6d7b1f3c7124cfbbc46203abf5ddf5c65b127435f3f329'\'' '\''/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin/node'\'' '\''ad679ec0860dd733bfd9a9da0d46f4c7c8c39e5818c634f9ecba0db29fbad9ab'\'' '\''/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports/activation-input-helper-d9qdx0wc/guarded-diagnosis-wixzokt9/final-helper/launch.mjs'\'' | /usr/bin/shasum -a 256 -c -s || exit 1; exec '\''/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin/node'\'' '\''/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports/activation-input-helper-d9qdx0wc/guarded-diagnosis-wixzokt9/final-helper/launch.mjs'\'' '\''/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports/activation-input-helper-d9qdx0wc/guarded-diagnosis-wixzokt9/final-executable.json'\'' '\''2b6107e526fb3b847ce3ca8c217f2d83fabd0e50392deb6da5de76415086c22c'\'' '\''prepare'\'' '\''/Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/reports/activation-input-helper-d9qdx0wc/owner/input-request.json'\'' '\''cc9a1904622e814685e1539d6148ceb73d9d90b2658c15fed1b8f24bf2131970'\'''
```

Run only in the owner's private interactive terminal, not chat, a pipe, CI log or recorded shell here-document. The helper lists missing nonsecret field names separately, collects each required value once without echo, then constructs all five phase maps internally and validates the entire composition before any validation child. **No JSON object or full database URL is requested.** Missing/empty fields, invalid UTF-8, changed bindings, credential reuse across DB roles and invalid phase configuration refuse without secret output; Ctrl+C cancels and cleans owned partial output. Inputs are bounded to65536 UTF-8 bytes/16384 characters, configuration token512; existing validators apply tighter field and65536-byte envelope limits.

### Minimal distinct human inputs

The unchanged identity-only request lacks exactly two required nonsecret values: **`APP_OPERATOR_USER_ID`** (existing Auth user UUID) and **`APP_AUTH_API_KEY`** (existing publishable/legacy-anon key). The helper prints those names, then prompts for them individually before credentials. They are not new identity or infrastructure; no Auth-user creation, password reset, saved-value decryption or owner-original/auth-store read is performed.

The remaining six hidden prompts, in order:

1. `VERCEL_CONFIGURATION_TOKEN` — one compatible existing Vercel token, entered once and reused for both configuration phases. No second token or provider `VERCEL_TOKEN` injection into configuration workers.
2. `MIGRATION_DATABASE_PASSWORD` — existing migration-authority raw password.
3. `APP_RUNTIME_DATABASE_PASSWORD` — distinct intended `app_runtime` raw password.
4. `APP_OPERATOR_DATABASE_PASSWORD` — distinct intended `app_operator` raw password.
5. `PREVIEW_ACCESS_KEY` — existing technical bearer, reused internally for bridge/app configuration.
6. `APP_OPERATOR_AUTH_KEY` — separate existing bootstrap Auth-admin credential, routed only to bootstrap.

Enter raw passwords, **not URLs or URL-encoded passwords**. The helper derives the reviewed Session host/port/database and fixed role usernames, escaping passwords itself. Application roles remain absent until their separately authorized phase; do not precreate roles, reset credentials, repeat setup or generate new identities.

An explicitly approved request may optionally bind `publicInputs.APP_OPERATOR_USER_ID`, `publicInputs.APP_AUTH_API_KEY` and `publicInputs.DATABASE_CA_PEM`. Already-bound fields are reused without prompting and cannot be overridden; a supplied CA propagates to every phase. With no CA bound, existing certificate/hostname-verified system-root TLS remains in effect. Do not place privileged credentials in `publicInputs` or rewrite the existing owner request for this increment.

Target/project/scope/source/tree/artifact/build run, Session metadata, browser/Auth origins, bridge/strict modes, disabled email, workspace/run UUIDs, Hieu/Lovora and manual retention are derived from the protected request and approved contracts. None is re-entered or regenerated. [Existing field contracts](production-activation-handoff.md#secure-input-names-destinations-and-formats--no-values) document internally constructed maps, not owner-authored JSON.

### Protected output and cleanup

Preparation creates only an owner-only temporary `esty-activation-inputs-*` directory: five0600 phase files, the unchanged approved request (including any bound public metadata) and a digest-only receipt. Each fixed validation child receives only its matching envelope; configuration children additionally receive the configuration token. Each child has a fresh empty HOME/TMPDIR/cwd, no inherited credential/Node flags, and suppressed stdout/stderr. No provider/config/SQL/bootstrap/activation worker runs during preparation.

On success the helper prints `INPUTS_PREPARED` with the private directory path and a fully quoted **`DISCARD:` command**. Run that exact command when the inputs are no longer needed. Cancellation/failure attempts guarded cleanup of owned partial output; unrelated files, symlinks, wrong ownership/modes or a changed request digest are refused rather than deleted. A cleanup refusal preserves the primary diagnostic and reports `cleanup=refused`; do not assume deletion or authorize a broad search/retry. Do not paste phase files into chat, journals or reports. Successful output persists until explicit discard;0700/0600 and environment separation are not a separate OS principal or cryptographic memory erasure.

The later `handoff` interface accepts `PREPARED_DIRECTORY REQUEST_DIGEST PHASE ACTION PACKET_PATH PACKET_DIGEST ARTIFACT_ROOT REPORT_DIRECTORY OFFICIAL_CLI_PATH`. `PHASE` is one of the five names above; `ACTION` is `run`, or `preflight`/`postflight` for roles only. It verifies a complete independently approved activation packet, matching request/phase digests, exact sealed Linux/x64 artifact and Node24.22.1, then invokes only that artifact's unchanged activation worker. Paths are normalized before the isolated child changes cwd. Existing journal/authorization/unknown-outcome guards still apply; no retry or promotion is implied. Process-local enable markers required by that worker do **not** change the broad GitHub `BE_DELIVERY_ENABLED` setting. This production handoff has not been executed.

### Corrected diagnostic evidence — awaiting targeted inspection

Confirmed defects: the outer launcher labeled configuration failures as `HELPER_EXECUTABLE_REFUSED`, and cleanup could mask the primary failure. The exact prior command succeeded with synthetic fields and the unchanged request; invalid bearer/shared-password probes reproduced the misleading label after all eight fields. An owned-copy drift probe also refused. None identifies the owner's actual private-input cause or proves historical tree drift.

The corrected helper reports only bounded stage/phase/field/reason/cleanup codes, never values, raw errors or private paths. `stage=validation` identifies pre-child input validation; `field=APP_ROLES_CREDENTIALS` means the existing independent-credentials invariant, not a disclosed password or inferred owner mistake. `stage=pre_child_guard reason=executable_mismatch` identifies a failed parent recheck. `stage=child_worker reason=worker_refused` preserves suppressed child output and does not claim its underlying cause. Bootstrap/import failures retain the original executable-refused label. No validators, accepted inputs or executable guards were weakened.

Actual checks: isolated compilation0; network-denied helper16 + launcher6 = **22/22 PASS**, including actual PTY invalid bearer/token/reused-password boundaries, cleanup masking, terminal restoration, unknown-error redaction and suppressed failed-worker output. Separate corrected guarded-command smoke accepted eight synthetic fields, produced five guarded phases and explicitly discarded its own output, exits0. Three invalid-input guarded runs failed after eight fields with the correct bounded validation field and `cleanup=complete`; a post-import mutation of an owned copy failed with `pre_child_guard` and complete cleanup. Original snapshots and real prepared inputs were not mutated or searched.

Receipt: `.openai/reports/activation-input-helper-d9qdx0wc/guarded-diagnosis-wixzokt9/verification.json`, SHA256 `048896093e5273f70885be64a6bbb50dc4aa954c15838908c731d4ec9abb52f0`. Adjacent `final-executable.json` SHA256 `2b6107e526fb3b847ce3ca8c217f2d83fabd0e50392deb6da5de76415086c22c` binds the held candidate; Node hash is unchanged, launcher SHA256 `ad679ec0860dd733bfd9a9da0d46f4c7c8c39e5818c634f9ecba0db29fbad9ab`. Only generated helper/test and launcher bytes differ from the accepted snapshot; dependencies are unchanged. This is local Darwin tooling, not a rebuilt f162/Linux artifact or production acceptance. **FIX_READY_FOR_INSPECTION / REAL_INPUT_HOLD / STOP WRITES.**

### Prior accepted automatic-composition evidence

The following acceptance and executable selection predate the diagnostic correction; they remain historical evidence, not the current held command or permission to retry.

Final isolated compilation0; network-denied helper14 + launcher6 = **20/20 PASS**. Coverage includes all five role-specific maps, missing/empty/extra fields, independent DB passwords, escaped Unicode/delimiter passwords, bound public metadata/CA preservation, existing Auth UUID version/case semantics, actual PTY collection with and without prebound metadata, redaction, cancellation/cleanup and accepted executable/runtime refusal guards.

Separate actual guarded-command PTY smoke0: two named nonsecret prompts + six credential prompts, each once, zero JSON prompts, five internally composed phase files and five guarded isolated children. Role/identity/password round trips,0700/0600, terminal restoration and no input value in transcript/receipt passed; printed guarded discard exited0 and removed synthetic output. No actual owner inputs or provider/SQL/activation effects.

Initial TypeScript record-inference errors were corrected; an initial synthetic smoke used the scope name instead of required team ID and was correctly refused before a prompt. Those attempts and the earlier passing19-test/interim snapshot remain recorded. The final implementation reuses the existing Auth UUID validator rather than imposing run/workspace UUIDv4 restrictions. Final tests and smoke followed that correction.

Accepted receipt: `.openai/reports/activation-input-helper-d9qdx0wc/auto-compose-rf6i4l2j/verification.json`, SHA256 `2fc920a0050f7d508846111bf6c154181fab2b4f42343a99ec63f43b54878c3a`; adjacent `handoff.json` retains the accepted pre-closeout source/docs manifest. Only `final-helper/` and `final-executable.json` are the current owner executable; manifest SHA256 `ab11d184f79d41bd38c65f13bc504b04b1230bc40cd739ad84d96b0bc02b9a54`,6320 files/683 directories, unchanged Node/launcher hashes. Adjacent `review-closeout.json` records only this four-document acceptance update; prior receipts, interim and p2-fix01 snapshots remain unchanged historical evidence. **REVIEW_ACCEPTED / READY_FOR_OWNER_MANUAL_INPUTS / NO_INFLIGHT / STOP WRITES.** Actual owner input, a complete independently approved packet and separately authorized sealed-worker execution/strict BE/FE acceptance remain gates; helper acceptance is not production acceptance.

### Original T136–T138 evidence

Existing Node24/TypeScript isolated compilation exits0. Final helper tests **9/9 PASS**; the existing hidden-TTY/private-file/conversion suite **8/8 PASS** was exercised in the earlier combined15/15 run. Final helper cases include actual PTY success/cancellation, restored terminal flags, phase separation, redacted output, request/packet drift refusal, UTF-8/byte/field limits and guarded cleanup. A separate network-denied actual CLI PTY smoke prepared all five synthetic phase files and explicitly discarded them, exit0; no synthetic input/output or worker home remains. Initial compilation failed only on a synthetic TTY fixture type cast; an initial import-only request-validation harness accidentally matched the CLI entry guard, then the corrected harness validated the real identity-only request without emitting values. Both failures are retained.

Original receipt: `.openai/reports/activation-input-helper-d9qdx0wc/verification.json`, SHA256 `cd62c12065e5dba32a8720cf92f6665dba6cd5595e038ebde17cf45666ad425b`. The adjacent `handoff.json` is the immutable **pre-review** source/docs manifest, not the corrected executable inventory. No actual credentials, owner-original/auth-store read, production handoff, provider/SQL/config/bootstrap/deploy, f162 audit/rebuild, Git/shared-document/dependency change or FE/manual006/3000/010 action. All16 historical records remain unchanged;81d4/454 remain UNKNOWN.

### Original accepted T139 P2/P3 evidence

The original review reported P2 and P3; the reviewer did not independently rerun checks. P2 is addressed by the guarded command and full executable/import/runtime inventory above. P3 is addressed by labeling the former no-collector statement as historical T135, superseded by T136–T138. No new full review was started.

Actual affected verification: isolated TypeScript compilation0; helper9 plus new launcher6 = **15/15 PASS**, network denied. The launcher tests reject modified entry/generated/package imports/package metadata, missing/extra/symlinked files, changed manifest/runtime hash/version/platform/architecture, modified bootstrap launcher/runtime, and external-resolution fallback before helper code or a prompt. The unaffected legacy8 and full/native suites were not rerun.

A separate actual guarded-command PTY smoke completed hidden collection and all five guarded validation children, verified isolated0600 phase files/0700 directory and terminal restoration, then executed the printed guarded discard command; both exits0, network denied, no secret transcript or production effects. The first smoke harness waited without draining the long cleanup command and hit PTY backpressure; its process was killed and only the matching synthetic output was explicitly discarded through the verified launcher. The corrected continuously draining harness passed; this failure remains recorded, not hidden.

Fix receipt: `.openai/reports/activation-input-helper-d9qdx0wc/p2-fix01/verification.json`, SHA256 `9439f33641f204c45d6f7f365acf5a8741d6b42babd9f3a4c0528a9f6cadf818`; adjacent `handoff.json` owns the accepted fix manifest and `executable.json` owns the runtime inventory, SHA256 `3f901d26e733a8ab6aa8e3729ba1f855c32a136eefcc646c1edcbe4fc0af37c7`. These pre-closeout receipts remain unchanged; adjacent `review-closeout.json` records the subsequent docs-only status changes. This Darwin helper snapshot uses157 existing installed public dependency packages without installation; it is not the Linux production release. Inventory checks do not isolate a hostile same-UID filesystem actor. **REVIEW_ACCEPTED / READY_FOR_OWNER_MANUAL_INPUTS / STOP WRITES.** Remaining gates: owner-only hidden preparation of the required phase inputs, independently approved complete activation packet, then separately authorized sealed-worker execution and actual strict BE/FE acceptance. No production handoff or real execution is implied by helper acceptance.

## Secret-compatible activation — affected source/local validation

Root accepted the [minimal Secret proof-order amendment](plan.md#secret-protocol-amendment--design-only-owner-disposition-pending); the implementation and actual checks are [recorded separately](plan.md#actual-secret-protocol-sourcelocal-evidence--ready_for_review). Configuration ACK/metadata is not value proof. A private durable pending-runtime receipt gates the single held candidate; same-candidate file/source/artifact and protected computed-runtime/final-origin acceptance still gate promotion and later effects. Unknown/partial configuration writes cannot be reconciled from metadata or repeated.

Executed with existing Node24.22.1 and TypeScript, no install, isolated output `$OUTPUT=.openai/reports/secret-protocol-dbx3mt02/work/apps/api/build`, an empty HOME/environment and read-only links to existing dependencies/public fixture assets:

```sh
"$NODE24" node_modules/typescript/bin/tsc -p apps/api/tsconfig.json --outDir "$OUTPUT" --incremental false
sandbox-exec -p '(version 1)(allow default)(deny network*)' "$NODE24" --test "$OUTPUT/tests/ci.test.js"
sandbox-exec -p '(version 1)(allow default)(deny network*)' "$NODE24" --test \
  --test-name-pattern='runtime attestation rejects changed private configuration' "$OUTPUT/tests/config.test.js"
```

Actual compilation0, CI57/57 and focused startup1/1 PASS. The new one-way201 regression failed before the fix with `not_started`; retain that failure. Separate emitted-operation smoke0 used the actual configuration/journal/startup-digest functions with synthetic transport, one write/two metadata reads/zero decryptions and a single held synthetic candidate; missing runtime/file proof blocked promotion/roles/replay. No real application socket, provider upload/configuration, SQL, bootstrap or native Linux release was exercised. Test-owned journal and throwaway smoke source were removed.

Full commands/results and preservation: `.openai/reports/secret-protocol-dbx3mt02/verification.json`, SHA256 `a0ceefcb2a0d7c6d95b2906ec55d7b8608785a23bc960725cb35a863bea01bb7`. These are recorded scoped checks, not permission to rerun shared/native/browser suites or overwrite the normal API build. README remains unchanged without a shared-doc lease. See the [names/formats-only owner packet](production-activation-handoff.md#current-secret-protocol-action-packet--sourcelocal-only). **READY_FOR_REVIEW; T135 belongs to the coordinator.** Publication, corrected clean Linux artifact/packet approval, historical-fence disposition and production/FE acceptance remain separate.

**T135 review closeout:** the preceding READY_FOR_REVIEW status is superseded by coordinator t4v's receipt of one scoped read-only gpt-6-luna review, no actionable findings and all8 reviewed hashes matched. The reviewer did not run tests or independently verify the OMP results above. No source fixes, check/build/runtime reruns or additional review occurred. The original handoff/verification receipts remain unchanged; current documentation hashes and attributed review evidence are in `.openai/reports/secret-protocol-dbx3mt02/review-closeout.json`. **REVIEW_COMPLETE — ACTIVATION_GATED; STOP WRITES.** All publication/Linux artifact/packet,81d4/454, secure-input, hosted and FE gates remain separate.



## Issue #5 — routine delivery validation and owner configuration boundary

Source/local work follows T124–T130. Actual baseline [run42164746470](https://github.com/khuonghuyhieu/esty-admin/actions/runs/42164746470) has successful BE checks and skipped production, not a deployed application. Do not rerun or enable it from this guide without authorization.

Routine current-only delivery requires `BE_DELIVERY_ENABLED=true`, `be-production`, the existing three provider/application secret names and explicit `BE_DELIVERY_SCHEMA_SHA256`. After separately accepted activation, TARGET is `149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3`; setting this digest does not migrate OLD or bootstrap an Owner. The runtime candidate must still prove current history. `BE_DELIVERY_MODE` selects `current-schema-only` or `versioned-migration` for pushes; explicit dispatch mode takes precedence. One-time `activation` remains a separate explicit workflow mode.

For a later routine schema change, `BE_MIGRATION_PACKET_JSON` plus its canonical SHA256 in `BE_MIGRATION_PACKET_SHA256` approves version1, exact `revision`/`tree`, `target`, full `previous` and `migrations` name/SHA256 arrays, `migrationInputDigest`, `predecessor` (`id`, `revision`, `artifact`, `configDigest`), `compatibilityApproval` and `recoveryApproval` evidence hashes. The same-run tested artifact digest is independently bound in the durable authorization, not guessed before CI builds it. Prior history must include the unchanged activated three-file manifest and be a proper target prefix. A genuinely compatible predecessor must already serve; approval hashes are prerequisites, not generated proof of compatibility.

`BE_MIGRATION_INPUTS` is the SQL-only secret name. Its JSON uses the existing separately approved migration input contract/verified Session TLS; never copy values into chat/docs or expose them to build/CREATE/bootstrap. Provider authorization → one SQL worker → provider continuation share one durable production fence. Any failed/unknown outcome requires separately authorized read-only reconciliation; a repeated run, new directory, rollback button or success-only receipt is not recovery.

Local checks must exercise changed boundaries using existing dependencies, synthetic provider transports and explicitly owned loopback fixtures. Preserve T108 UNPROVEN and historical T110503 NOT REPRODUCED / CAUSE UNPROVEN; no new timebox/expiry run is authorized by this increment. Shared README commands/settings changes need a fresh lease. Actual provider enablement, compatible-predecessor verification, cloud SQL and final Owner acceptance remain unexecuted here.

Actual local result: TypeScript exit0; CI/release/artifact189/189, focused real migration integration8/8, config/HTTP/startup39/39; operator staging157 packages and isolated imports pass; YAML plus35 shell blocks parse. Separate real Nest/owned PostgreSQL smoke proves401, pending503→current200, history3→4, unchanged runner0 and one synthetic create/promotion after confirmed SQL, with worker/continuation replay refused. The initial wrong-runtime smoke harness failure is retained, not rewritten as a product fix. See [the exact execution receipt and source hashes](plan.md#actual-sourcelocal-execution-and-retained-failures). This is Darwin/arm64 source/local proof, not a new Linux/native/hosted release; actionlint was unavailable. Own55532 tmpfs fixture/network/relay and throwaway drivers were removed, zero random DBs remained, and55532 is free.

FE's coordinator-selected authority is native Vercel Git; FE build gates and optional secret-free post-deploy smoke do not by themselves wait for BE delivery. At the observed main SHA, FE aliasing preceded BE check completion. The exact separately authorized Vercel Deployment Check prerequisite is **BE delivery accepted**, not **BE required checks** and not the optionally skipped production job. This always-run completion context requires successful checks, successful production and a successful actual exact-artifact delivery-confirmation step; skipped/failed/cancelled or missing acceptance fails. Provider selection and actual hold/promotion behavior still need authorized verification; no setting changed here. Do not gate a deployment on its own post-deploy FE smoke. Keep PR checks separate: production is not authorized on PRs, so this completion context fails there rather than claiming delivery. T121 first activation remains a held-candidate/final-origin journey. Owner-selected workspace is Lovora; retention365d remains proposed.

Status: **P1 FIX READY FOR COORDINATOR INSPECTION**, source/docs paused and no owned runtime in flight. The single consolidated review found one BE completion-gate P1; the narrow correction passed64 actual shell outcome cases, missing-input refusal,16 acceptance-step outcome cases and36 shell syntax checks. See [the scoped correction receipt](plan.md#confirmed-completion-gate-p1--scoped-correction) for the four changed hashes/full updated18-path manifest and retained baseline. No broad suite/build/new reviewer or actual GitHub/provider run occurred; actionlint remains unavailable. Shared README/PROJECT_STATE still require a fresh lease before canonical operating-instruction alignment. No Git/publication, provider enablement, real migration or Owner acceptance is authorized by this result.

### Consolidated review closeout — both fixes accepted

The preceding inspection-pending status is historical. Coordinator t4v accepted both original findings through separate fix-only inspections: BE P1 (artifact-check success could mask skipped delivery) and FE P2 (successful native status could precede alias assignment without a later event). Preserve the original consolidated27-path review as a **two-finding review**. No new independent review or coordinator test/build rerun occurred.

BE's accepted always-run **BE delivery accepted** context requires checks success, production success and successful existing exact-artifact delivery confirmation; production enablement/commands/concurrency are unchanged. Its affected evidence remains64 actual completion-shell cases, missing-input refusal,16 producer cases and36 shell syntax checks. Accepted18-path manifest: `/private/var/folders/4h/l740s8vn7j543mbxnnjwnw200000gn/T/esty001-completion-p1-avzwro8g/fix-manifest.json`, SHA256 `f23ab176da79c0fc568701d9d12f7b5f038ee69bdab81c37b4bc301e948d0818`. It remains the immutable correction receipt; only plan/quickstart/tasks change in this subsequent closeout.

FE's accepted post-deploy smoke now tolerates bounded alias propagation: at most six attempts per fixed path,500ms delay, same20s deadline; only404 or200 HTML with missing/mismatched exact identity retries. Other failures still reject. Final9-path receipt: `apps/web/.openai/app-session-88dc2425164b4c8546a89b450e23951e/p2-alias-final-handoff.json`, SHA256 `3dcffee6854ffeceb11c10854577458f84b7c000c616b32e980b2905de0e1f68`. The plan records all three corrected FE hashes and six unchanged paths. Attributed affected results:17/17 functional, two-file lint0/syntax0; actual synthetic-metadata loopback CLI propagation exit0/1853ms, stale-alias exhaustion exit1/2573ms/six attempts,503 exit1/64ms/one attempt. The actual CLI did not measure a20s provider timeout; shared-deadline cancellation is a focused functional test. Earlier80/80 and4/4/build evidence is pre-P2, not rerun.

See [the accepted two-finding receipt](plan.md#consolidated-two-finding-review--coordinator-acceptances-and-docs-only-closeout). No actual Actions/Vercel scheduler or required-check selection was exercised. Owner/provider configuration and later verification of **BE delivery accepted** remain mandatory; **BE required checks**, production SKIPPED and FE post-deploy smoke cannot satisfy combined delivery acceptance. Do not configure post-deploy smoke as its own predeploy gate. T108 remains UNPROVEN/unchecked, historical T110503 NOT REPRODUCED / CAUSE UNPROVEN, and T121 first activation remains separate. **SOURCE/DOCS PAUSED — NO_INFLIGHT.** No source, tests/build/runtime, shared-doc, provider, Git or reviewer action is authorized by this documentation closeout.



## Current BE automation validation

Follow [the current delivery plan](plan.md#current-be-delivery-automation-addon--plan-before-source) and [README's canonical commands and single activation list](../../README.md#remaining-actions--single-current-list). T085–T091 source/local evidence is retained and T092 [BE orchestration review is accepted](plan.md#be-automation-review-accepted--orchestration-receipt), with no confirmed actionable findings and no fixes/reruns. Independent reviewer model identity/session UUID are unavailable;15/19 original hashes matched at review, with four current FE-amended documents considered separately. Final native0619 remains Darwin/arm64 development only. Fresh scoped Git/docs grant and FE pause precede a current BE-hunk manifest/publication; actual Actions/environment settings and same-artifact production-health acceptance remain unverified.

1. Secret-free PR/main checks must fail on generated-contract/migration drift, build/functional/API integration failures and absence of mandatory exact-native HTTP→test DB proof. Use only the guarded BE55432 fixture; no FE/shared/cloud DB.
2. Verify event commit/tree/repository and one Linux sealed artifact before testing, after mode-preserving transfer and before deployment. A wrong digest/source/platform/manifest or failed prerequisite must stop without provider creation.
3. Synthetic delivery checks exercise main/environment/first-attempt guards, durable previous-intent refusal, known/unknown create acknowledgement, exact archive evidence and candidate failure preventing promotion. No real provider transport fallback or migration runner.
4. Actual automation acceptance, only after reviewed publication and owner activation, requires the wired Actions run URL, exact artifact/known ID/icn1, candidate current-schema pass before promotion and same-ID api.lovora.us TLS/eight-case proof afterward. Existing699 hosted PASS is not that run.
5. Local checks precede coordinator ONE BE Luna review, separately leased publication and owner activation. Do not substitute ad hoc deployment or request/copy secrets.

## Current FE local connectivity receipt

Assigned FE p0's17-path `final-handoff.json` manifest `721474b470e010d3bec62ccffd5aa985fde088863bf8d35ddda6b4248cca6357` reports source/local T014–T016 READY_FOR_REVIEW. Functional40/40, default production46PASS/12mode skips and10 distinct enabled cases across affected runs include the real browser→canonical Nest→owned Supabase55433 ready/degraded/unreachable/recovery journey. Initial failures/fixes and no-final-full-rerun limit remain in [the attributed plan receipt](plan.md#subsequent-fe-sourcelocal-receipt--ready_for_review). Coordinator FE review/new-screen owner acceptance remain separate; Feature003 T013 is already owner-accepted. [README owns all supplied FE commands](../../README.md#current-fe-local-connectivity--sourcelocal-ready_for_review). No hosted enablement/authentication or BE review of FE behavior is implied.

Subsequent owner/coordinator evidence closes the FE scoped-review gate: **COMPLETE/ACCEPTED**, verified gpt-6-luna runtime, ONE read-only/ephemeral CLI session `01a1981b-b54f-7f33-a10c-97c1de543d17`, exit0, no actionable findings; all17 hashes matched independently by the coordinator. See [the accepted review receipt](plan.md#accepted-fe-scoped-review--ownercoordinator-receipt) for the exact report, earlier orchestration-only distinction and omitted network fetch. No reviewer/coordinator runtime checks or new full enabled-suite run occurred. The review-pending source handoff above is historical; new-screen owner visual acceptance remains pending, and hosted UI→API→DB remains unestablished. Shared-doc status awaits a fresh README/PROJECT_STATE lease; only feature001 is amended here.

The following dated validation sections retain prior outcomes rather than current automation authority.

Updated:2026-11-01. Accepted startup repair c75d000 was published, serial HOLD explicitly returned, and a new clean Linux artifact666ab1cf stored durably/verified before one controlled archive deploy. Actual same-ID live200/access401/unknown404/OPTIONS204-401 and TLS pass on dpl_4U98EbGBC4QzrknVLq7Kdh2ojXiw; authorized ready503/database_timeout repeated twice. Full hosted readiness is blocked, not complete. No full-suite rerun, migration replay, duplicate create or shared-doc write after handback; see plan and `.openai/reports/startup-release-v1guduvp/` for exact evidence.

## Current targeted readiness diagnostics validation — 2026-11-01

Actual hosted BE acceptance now passes on reviewed0d9d305/durable Linux699/final deployment `dpl_E7FELzuA6Ymt9mW8B3NE7mA4oQH3`: exact1014 uploaded files, same-ID alias/TLS and all eight protected live/ready/access/unknown/CORS cases. Actual readiness completes in126ms in icn1, with database up and migrations current. [Actual phase comparison and limits](plan.md#actual-same-artifact-locality-repair-and-hosted-success--2026-11-01) supersede the dated summary above. No source/timer/TLS/credential/schema change: retain the supported `--regions icn1` option on future separately authorized official prebuilt archive deployments. It is not a source/project-default pin. No extra setup, migration or owner login is required. Shared current status and the [single remaining list](../../README.md#remaining-actions--single-current-list) are aligned under the fresh final owner grant and NEW FE p0 pause receipt; [docs-only preservation/return evidence](plan.md#final-docs-only-closeout) closes the lease without new runtime checks or publication.

Production observation after review/publication must consume runtime log JSON in process and output only the fixed readiness event fields/allowlisted phases, codes, classes, timings and observed TLS boolean. Never dump raw logs then redact. `tls_verified_this_attempt=false` on pooled reuse does not mean an insecure connection. Compare cumulative phase entries to the final elapsed time; no phase or timer value by itself proves a password/region/schema cause. Preserve the existing private-reader-only bearer path, exact same-deployment uploaded input/alias/TLS acceptance and one bounded unchanged FE public-host check. No SQL migration/DDL or credential setup replay.

## Managed startup repair validation

Use the [canonical affected commands](../../README.md#managed-startup-repair--review-accepted) with existing Node24/dependencies. Startup tests exercise real child-process import/capture/bind behavior, initializer error/hang, transitive import failure, bind/config rejection and non-disclosing diagnostics. HTTP/config tests preserve access-before-DB, resource bounds and local behavior. No database or provider setup is needed for these checks. Accepted checks are not rerun for this documentation-only closeout.

The separate unchanged official managed bridge smoke and pinned Nest entrypoint detection ran in an isolated Linux/x64 network-none container; exact harness/results live in `.openai/reports/runtime-startup-cvh4ccl3/`. It is a declared development overlay, not a new sealed release or proof of Vercel's production launcher. Keep the e7 bundle unchanged. Coordinator alone runs the one scoped Luna review; no repeated full suite, cloud probe or new artifact/deploy before the review/publication gates.


## Current-schema-only repair validation

1. Run installed feature001 prerequisite → existing-plan/task setup → read-only consistency using command-local feature/no-persist values. Preserve existing docs, root lock/dependencies/pointer and all other lanes; no new tracker/spec.
2. In a public temporary source copy with existing dependencies/Node24 and empty auth, compile the affected operator/tests. Synthetic provider transport has no real-fetch fallback. Database tests accept only documented standalone55432 and create/drop only owned random databases.
3. Exercise current-schema-only with initialized/current history: spy zero runner calls, observe zero DDL and unchanged history. Reject fresh/uninitialized, pending, unexpected, unordered, altered checksum/manifest/revision states before create. Retain ordinary migration-failure/deploy-block and successful migration regressions.
4. Exercise durable exclusive intent/receipt/run lock/create intent/acknowledgement and every critical fsync boundary with failed/interrupted/delayed writes and process termination. The historical lock/report remains identical; valid ID must exist durably before first inspect. Crash after create intent without durable ID stays unknown and blocks repeat create.
5. Reconcile known-ID and unknown runs using only the read-only entrypoint. Prove no migration/trigger/second create, no lock/report mutation, and refusal of stale/tampered/substituted receipt/journal/lock/artifact. Keep cancelled/late acknowledgement conservative without discarding a valid known ID.
6. Run the actual changed driver smoke, record distinct checks/failures/results and source hashes, and return scoped docs with FE/history preservation evidence. STOP READY_FOR_REVIEW; only coordinator starts the one independent review.
7. After review and a fresh serial Git receipt, publish exact reviewed source and build a NEW clean Linux/x64 artifact through the existing approved public pipeline. Return new commit/tree/artifact/source/platform and the supported operation for owner binding. Existing Decision B names oldea/0ed and has consumed0 creates; external access remains paused.

Current local result: compilation0, release121/121, affected integration39/39 and separate actual-driver/offline-CLI smoke passed. The smoke observed16 read-only SQL statements, one synthetic create, six durable-ID-before-inspect observations and no extra create during reconciliation/repeated execution. Competing-run and synchronous-deadline regressions failed before the fix and passed afterward; exact intermediate failures, hashes and limits are in [the plan](plan.md#actual-source-local-verification--ready_for_review). [Canonical commands and exact approval fields](../../README.md#current-schema-only-supersession-repair--ready_for_review) are reference-only until the review/new-publication/new-Linux-artifact/owner-binding gates. No private or external operation is authorized by this local result.

Scoped review is now accepted: ONE `/root/current_schema_review`, requested gpt-6-luna through orchestration, completed all14 manifest paths/relevant contracts without confirmed findings; independent runtime model identity is unavailable. No reviewer edits/tests/build/Git/provider operations or additional coordinator finding. Existing actual checks are retained without reruns. The fresh exact14-path serial grant permits publication and narrow review closeout, followed by explicit lease return and a NEW clean published Linux artifact. External operations remain paused until concrete NEW source/artifact owner binding; no additional abstract START or duplicate review is needed.

## Latest owner hosting preference — Vercel, 2026-10-29

Use existing Vercel BE metadata only: esty-admin-api/prj_uITHKLUGGE98VxrEcs5FoktBbcls, scope khuonghuyhieu0705s-projects, apps/api/Node24. No Render onboarding. The prior source/local review is complete, but it does not cover the new native-build blocker. Do not deploy the no-functions diagnostic output or treat old Render startup/review as genuine native Vercel acceptance.

A personal account does not by itself establish non-commercial use. Official Vercel fair-use guidance defines commercial use by intended financial gain; using an internal tool for one's own shop may still fall within that definition. No provider classification/enforcement method or project-specific eligibility is known, and no paid upgrade/payment method/trial is authorized. Document this unresolved eligibility limit without forcing a new provider or presenting it as verified compliance.

Owner-prepared runtime/operator files are forbidden agent input. Later owner TTY conversion creates separate Vercel outputs, preserving originals; default OWNER_INPUT_PENDING reads/writes nothing private. No real provider/SQL/deploy/DNS/private entry or source publication.

Current [Vercel execution evidence](plan.md#vercel-adaptation-execution--2026-10-29) records initial API26/27 and its synthetic counter correction, corrected provider/offline14/14, isolated release/package14/14, safe CLI defaults and independent protected HTTP200→503→200 smoke. Initial smoke-history assumption and script syntax failures are disclosed. Copied Vercel-mode package is not native proof; T054 still needs genuine settings and later authorization.

The coordinator verified REVIEW_MODEL_READY and completed one new read-only gpt-6-luna review, session01a186d0-f5ff-7a80-9210-aaf9cb2a8d40, exit0: no confirmed actionable findings. The reviewer made no edits and ran no tests/build/provider calls. This closeout preserves current source and does not repeat affected/full suites; real settings/native/Supabase-cloud/api.lovora.us binding remain unverified.

## Expanded native artifact validation

1. Run feature001 prerequisites before existing-plan/task setup with command-local feature/no-persist values; preserve templates/pointer and all60 prior task checkboxes. Read-only consistency must cover FR-017–020 and SC-010–012 before code.
2. Use cached Node24.22.1 and pinned public CLI/builders in a new public temp source/work directory, empty auth/HOME/npm configuration and zero-byte production env. No install in the repository or --yes/pull/env pull. Build source is a declared development overlay until the future exact clean published revision is approved.
3. Run the application-owned artifact build entrypoint (commands belong in README). Preserve raw upstream output separately; inspect the final single function/handler/routes, duration10/cancellation, generated migration metadata, operator assets, dependency closure and sealed file/tool/source/target provenance.
4. Boot the final emitted handler from outside source/dependency roots under fail-closed loopback-only networking. Exercise real guard/live/unknown/preflight/readiness, silent-peer timeout/disconnect, graceful shutdown and test-owned55432 disposable DB recovery. No shared stack stop/reset or cloud/Supabase-local-main destructive suite.
5. Run focused packaging/integrity and existing release tests: missing/extra/tampered/stale/private/path/symlink/config/tool/platform inputs, mutation during consumption, exact prebuilt files/no gitSource, migration-before-upload/create, queued/failed/cancelled/uncertain identity/domain outcomes and retained locks. Synthetic transport never falls through to real fetch.
6. Record distinct commands/failures/results and clean only owned scaffolds/processes/disposable DBs. Raw build success or local disconnect does not prove a Vercel worker abort/10-second enforcement. Do not invoke real release/upload or mark T054/external gates complete.
7. Pause source at actual passing native/functional/packaging/release evidence and send READY_FOR_REVIEW. Coordinator alone starts one new available Luna review; confirmed fixes get affected rechecks, then separately authorized docs-only closeout and lease return.



## Historical A+C evidence — 2026-10-28

Current [execution evidence](plan.md#source-local-execution--2026-10-28) records actual Supabase-local, status/report, offline-helper, Render artifact and release checks, including failures/corrections. Historical checks/reviews remain separately preserved. The exact destructive TEST_DATABASE_URL still accepts only standalone fixture55432; never redirect it to Supabase main/cloud. Historical T026 does not replace the new combined review.

## Increment A — Local Supabase and migration visibility

Verified under the owner's explicit T037–T044 source/local handoff:

1. Installed CLI2.122.0/Docker29.4.0, unique esty-admin-local config and actual127.0.0.1:54322 publication were checked. No remote login/link/profile change or reinstall.
2. Minimum DB-only PostgreSQL17.11.0.006 started, stopped and restarted with history/volumes preserved. Gateway/Studio are disabled. Use README API-workspace lifecycle commands, never raw credential-bearing status.
3. Explicit synthetic local process settings avoid overwriting .env. API defaults127.0.0.1:3001 and local browser origin127.0.0.1:3000 remain; no cloud marker/key needed.
4. Read-only status never initializes history; explicit node-pg-migrate applied1 then0 and stayed current after restart. Unexpected history stops, never resets/adopts.
5. Actual Nest/Supabase-local live/ready200, client-only failure503 and restored-config recovery200 passed. Destructive action/SQL/rollback fixtures stay on standalone55432.
6. Version/stage/commit/unknown/report-write boundaries and copied status/migration closure outside cwd passed. Reports never substitute attempted actions for committed DB history.
7. Coordinator completed one independent read-only gpt-6-luna combined review, session01a181cd-ca5d-7771-b349-34c0801402ca: no confirmed actionable findings. T035/T044 are complete; no source fix or redundant test/build rerun. No commit/push/cloud/FE action is implied.

## Increment B — Local browser connectivity

Separate FE ownership/handoff for T014–T016. Default-disabled proposed /connectivity screen uses the one generated API contract and approved loopback origin, no browser DB secret. Explicit check distinguishes process health and DB/migration readiness; retry checks fresh state. Production browser journeys must reach actual Nest/Supabase local for success; API/DB failure simulation changes only isolated test-owned API processes/configuration. Existing home/privacy/redirect/404/sample Application remain regressions. Local success is not hosted proof.

## Historical increment C — offline and Render source/tooling

Offline helper defaults to OWNER_INPUT_PENDING without creating real private files. Synthetic encoding/permissions/no-overwrite/partial-cleanup and real PTY restoration passed. Render config/preview guard, sole BE contract regeneration, compiled TLS/readiness/shutdown artifact and release ordering/failed-deploy/queued/cancel/timeout/lock tests passed locally. The first Render transport fixture's incomplete isolation and its corrected outbound restriction are disclosed in plan.md; no actual hosted connection success is inferred. See README for the owner's later private-entry command and exact release source/settings.

## Increment D — Required hosted release and api.lovora.us testing

Use exact Session5432 tuple/Vercel contexts in the [active cloud matrix](plan.md#active-cloud-configuration-packet--vercel). Actual native T054, private inputs and setup/read/write/release scope remain prerequisites. Read-only preflight proves identity/TLS/history/privileges/capacity; only separately approved versioned migrations follow. No second application history/reset/role/grants.

Reuse esty-admin-api, exact scope/team/root/nestjs/Node24 and runtime-only keys. Disable automatic Git deploy. After explicit external approval, verify exact clean published source and independently approved immutable artifact, then migrate before consuming that same artifact through prebuilt upload/create, never a Git rebuild. Provider identity/file evidence and alias→same-deployment identity surround actual safe api.lovora.us HTTP/TLS checks. Standard Protection excludes production domains; API bearer is required. README owns the single manual checklist, settings/attestation/enforcement and unresolved Hobby eligibility.

## Hosted FE access — not part of local handoff

A hosted FE needs the actual BE URL, exact CORS and caller authorization. The cloud preview bearer key must not ship in browser code. User auth or a protected server-side path needs its own design before that integration is published. No public proxy sharing the secret is approved; this does not block increments A/B.

## Required domain evidence

Dated read-only DNS on2026-10-28 returned NXDOMAIN and GoDaddy nameservers. Recheck only during approved external execution; use exact Vercel-provided api-label records, never a generic target. Verify domain/TLS/alias and real cloud-backed HTTP. No new DNS read/write or hosted proof in source/local adaptation.

## Production activation validation plan

**Plan only.** Start with the [compact owner handoff](production-activation-handoff.md), [A1–A9](plan.md#complete-production-activation-plan) and [T095–T123](tasks.md#story-8--complete-production-activation-p1-plan-only). This section does not authorize or claim a test, build, migration, account read, publication or deployment. Earlier receipts remain historical and byte-preserved.

### Current versus required evidence

Accepted005 BE and006 local browser evidence already exist; the owner separately reports that the real Auth identity exists and password login passed. Do not repeat that report as new proof or recreate/reset the identity. Application roles/schema/Owner are reported absent. The current-only CI driver cannot deliver the application's TARGET manifest; ordinary migration support already exists. New bridge/orchestration/provisioning/CSP work, local proof, one review, publication/Linux artifact and actual hosted acceptance are still future tasks.

The protected manual006 run remains KEEP-RUNNING. No command here may adopt its API/FE/forwarder, consume its private files, reset its users, revoke its sessions, change faults or reuse ports55440–55444. Wait for explicit owner stop/FE release and guarded cleanup, or a separately approved isolated resource contract, before future fixture work. Preserve owner3000/default `.next`, shared services and volumes.

### Documentation checks allowed in this increment

Installed helper behavior was inspected before use. These commands resolve/check existing documents only; the helper's feature `BRANCH` field is not an actual Git observation:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/001-connectivity-foundation SPECIFY_FEATURE_NO_PERSIST=1 bash .specify/scripts/bash/check-prerequisites.sh --json --paths-only
SPECIFY_FEATURE_DIRECTORY=specs/001-connectivity-foundation SPECIFY_FEATURE_NO_PERSIST=1 bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec
SPECIFY_FEATURE_DIRECTORY=specs/001-connectivity-foundation SPECIFY_FEATURE_NO_PERSIST=1 bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

Read-only validation checks new requirement/task coverage, unique sequential task IDs, unchanged old task rows, resolvable new links/fragments, exact append-only prefixes, protected public-source/document hashes and names-only identity/configuration examples. No template reset, setup-plan, shared pointer write, hook execution, source import or application/runtime test is part of these checks. The compact handoff records actual results and any scoped documentation repairs.

### Future local verification matrix

Use the [existing BE canonical commands](../../README.md#local-backend-foundation), [native artifact guide](../../README.md#application-owned-native-artifact--sourcelocal-work-only) and [006 canonical commands](../../README.md#feature006-canonical-local-commands) only after fresh exact source/resource authorization. The proposed activation CLI is not implemented; do not invent a runnable production command. Its final validated invocation belongs in README under a fresh lease after implementation.

| Area / existing suite | Required actual observable result |
|---|---|
| Config/HTTP/integration | Technical bearer denial before DB; exact Session TLS; bounded shared pool/deadlines/cancellation; bridge rejects enabled app and accepts only exact OLD or full TARGET; strict app rejects OLD/intermediate/foreign histories |
| Migration integration | OLD→TARGET commits two pending files in one batch, then0 on unchanged rerun; fresh all-three DB applies3 then0. Preserve historical foundation-only1→0 separately. Changed assets, wrong order, duplicates and partial history refuse before unsafe continuation |
| Migration/release failures | Transaction rollback, lost COMMIT acknowledgement, failed durable report, role mismatch/partial provisioning, SQL committed then deploy failed, lock contention and unknown create/promotion all preserve evidence and fence the next side effect |
| Bootstrap / real Auth→Nest→DB | Existing verified synthetic user produces profile/workspace/active Owner/audit atomically; matching replay adds nothing, different approval/fingerprint conflicts, last-Owner concurrency cannot orphan the workspace; unknown commit is read-only reconciled |
| Role/definer security | Runtime cannot read managed Auth or acquire operator/privileged role access; app_private exposure/ACL/definer owner/search path are correct; RLS-filtered function is safe dependency failure, not misleading unauthenticated success |
| Timebox boundary | New provider-configured local synthetic session has actual non-NULL not_after; allow before, deny after while JWT remains valid; no direct Auth-row edits or manual006 configuration change |
| Synthetic provider/native artifact | Exact source/tree/tool/config/OLD/TARGET/files and private snapshot; one create per bridge/app phase; known-ID durable capture; no provider fallback/network; real sealed handler exercises HTTP→guarded DB, not tsc-only success |
| FE functional/production browser | Current Owner/Member/protected paths and current negative admission; natural expiry/refresh, confirmed local logout/same JWT denial and late-generation safety; no shared user cache/tokens; hosted public/anon key-class refusal boundaries; nonce CSP/full-document public↔protected crossings/within-area navigation/hydration/style attributes and exact origin/CSRF |
| Public/accessibility neighbors | Home/privacy/legacy redirect/404, keyboard navigation and narrow-screen overflow remain correct; Settings/Team bodies still explicitly sample-only and unsupported007/008/009 actions stay unavailable |

Use existing suites rather than new duplicate feature suites. Record exact selection, source hashes, commands, exit/result counts, failures and cleanup receipts. Synthetic transports and local Auth are not production proof. After meaningful implementation changes, run affected checks and actual changed-path smoke; do not rerun accepted unrelated full suites merely for a fresh timestamp.

### Future hosted acceptance and stop points

1. Obtain the owner decisions and exact source/publication/build/external permissions. Freeze accepted corrected005/006 source, canonical0.4 and OLD/TARGET; complete implementation/local proof and the coordinator's one available scoped Luna review. Publish only the explicitly reviewed allowlist, with FE production assignment held.
2. Approve the clean Linux BE artifact and exact FE source/build identity. Receive new phase-separated secure inputs without rereading/reconverting original owner files. Reserve the durable activation journal/exclusion; verify real target/TLS/OLD/predecessor/role capability, actual protection caller path and backup/recovery limits read-only.
3. Deploy/attest/verify the disabled-app bridge against OLD at the final API hostname before any role/schema mutation. The explicit maintenance alternative requires its own bounded window and outage acceptance; it is not an automatic fallback.
4. Provision roles, run the existing versioned runner once and verify durable TARGET/ACL/definer outcome. Then bootstrap the existing `OWNER_AUTH_USER_ID` using the private approved workspace/names/approval packet. On partial/unknown SQL or bootstrap outcome, stop and reconcile read-only; do not retry blindly.
5. Deploy the same approved BE bytes in strict app_runtime/email-disabled mode. Verify actual TARGET/current-session/capabilities and technical denials, exact candidate files/configuration and final same-deployment `https://api.lovora.us`. After committed SQL, never roll back to699.
6. FE OMP builds exact published source as a held Production candidate configured for the final `APP_ORIGIN`. Verify actual deployment/build/configuration identity and bounded noncredential checks, then durably promote that same known candidate without rebuilding. At the final configured origin, exercise HTTPS Owner password login→current me/workspace/capabilities→Application/Settings/Team→refresh→received confirmed local logout→same old JWT denied. A generated candidate hostname cannot stand in for exact Origin/Host/cookie binding; do not spoof headers, relax that boundary or claim prepromotion full-session proof. A failed final journey keeps acceptance fenced for explicit compatible recovery.
7. With separately approved synthetic identities, verify Member/no-membership/disabled/demotion/revocation and cross-user denial, secure cookie/header/CSP/origin behavior, home/privacy/mobile/keyboard and truthful unconnected bodies. Do not disable/demote/revoke the real Owner for a negative case. Unavailable hosted non-NULL timeboxing is a recorded limit, not a paid upgrade or invented pass.
8. Observe only bounded existing health/redacted error signals. Preserve real Owner/workspace/schema/original inputs and manual006; clean only explicitly released test-owned identities/sessions/resources. Record exact known deployment/alias/artifact and migration/bootstrap outcomes, limits and lease returns. Provider READY, an old health PASS or local browser success cannot close hosted acceptance.

Initial application email delivery remains disabled via `APP_EMAIL_ENABLED=false`; keep the already working Supabase email/password sign-in provider unchanged.007/009 SMTP is not a blocker for the confirmed Owner password login. For lost-Owner incidents follow A6's verified, approval-bound provider recovery and explicit session revocation; never silently reactivate a disabled member or replay bootstrap as recovery. Retention approval identifies policy, not an automatic purge implementation.

## Current activation source/local receipts

The owner START and subsequent exact grants supersede the earlier plan-only stop solely for T095–T111 source/local work. [The current plan receipt](plan.md#forwarded-t104-decision-and-fe-pure-check-delta) records the source T104 decision: relative same-origin006 BFF, fixed production server-only `APP_API_ORIGIN=https://api.lovora.us`, existing technical bearer and separate `X-App-Access-Token` user JWT. No `VERCEL_URL`/preview fallback, bypass header/credential, incoming cookie/Authorization forwarding or public secret alias is permitted.

Names-only production inputs remain `APP_SESSION_MODE`, `APP_ORIGIN`, `APP_API_ORIGIN`, `APP_AUTH_URL`, `APP_AUTH_API_KEY`, `APP_API_TECHNICAL_KEY` and `APP_SESSION_COOKIE_KEY`. FE reports unchanged fixed-origin `/v1/app/me` transport with reconstructed headers, manual redirects, omitted credentials and no-store. No private values or account inspection follow from this source decision.

Owner/coordinator-reported2026-11-04 public app `/`200 and API `/health/live`401 JSON without SSO establish reachability/application denial only. Neither BE nor FE repeated these probes. Account/project/protection settings, authenticated hosted caller, actual current Owner/DB and exact new-deployment acceptance remain unknown. Recheck the actual final-domain deployment in T116/T120/T121 under later authority; redirect/SSO/challenge stops release without automatic bypass, relaxed origins or generated-host substitution.

The sole FE OMP reports these completed **pure, no-network** checks; these are forwarded evidence, not BE executions:

| Check | Reported result | Exact retained receipt |
|---|---|---|
| Node24.22.1 `--experimental-strip-types --test apps/web/tests/functional/app-session.test.ts` |24/24 PASS,0 failures/skips,204.675667ms, exit0 | `functional-01.json` |
| Scoped ESLint `--no-cache --no-fix` | exit0 | `lint-01.json` |
| Direct TypeScript `--noEmit --incremental false` | exit0; no Next typegen/default-output writes | `typecheck-01.json` |
| T104 owner caller decision and evidence limits | Source decision resolved; hosted gates open | `t104-caller-decision.json` |

All four receipts are under `apps/web/.openai/activation-source-2c0a45086a03b8c8d41f7683c5da8695/`. The renewed permission does not require duplicate runs. This is not local production-build/browser, native artifact or hosted proof. Fresh staging/build/browser waits for actual new-resource clearance, BE_READY, the0600 `fixture/fe-session.json` handoff and the agreed FE_READY → BE_TESTS → FE_BROWSER → FE_RELEASE lease. Manual006 and owner3000/default.next remain protected.

T111 permits only the existing artifact builder's three read-only Git identity operations, not status/mutation/publication or installation. The forwarded committed baseline/tree is recorded in the plan; dirty input inventory remains separate and a development artifact is NONRELEASABLE. Native dependency/tool strategy and A3 configuration-phase linkage remain unresolved. T108 must still prove actual non-NULL provider-issued `not_after`; global timebox configuration or JWT expiry alone is not a substitute.

### Fresh root decisions superseding the pending notes

- **A3 chooses A:** implement the plan-first `bridge-config → bridge → roles → migration → bootstrap → app-config → app → fe` contract. Isolate configuration authority/runtime inputs from CREATE; durable unknown-ACK fences and protected runtime configuration attestation are mandatory. Current-only delivery remains unchanged. These are source/local permissions, not live configuration/deployment permission.
- **T111 native staging:** the existing development builder may use its three read-only Git identity calls and unchanged `npm ci --workspace=@esty-admin/api --include-workspace-root=false` only in a new canonical0700 outside-repository source copy. Exact copied manifests/lock, pinned public tools, blank HOME/XDG/npmrc/cache/TMPDIR/auth and public npm registry remain required. No shared/root install or upstream patch; development output is NONRELEASABLE and T115 remains separate.
- **T104 exact origins:** `APP_ORIGIN=https://app.lovora.us`, `APP_API_ORIGIN=https://api.lovora.us`; FE project name `esty-admin` is owner-supplied, its ID/deployment ID and current protection settings are unverified. Forwarded public probes are not authenticated hosted acceptance. T116/T120/T121 still require exact-deployment checks; no bypass/fallback.
- **T108:** execute only bounded supported fresh-fixture proof. NULL natural password-session `not_after` cannot close the required non-NULL boundary. A demonstrated unsupported case remains a named unresolved acceptance limitation; no Auth-row mutation, SAML implementation, pin swap or paid-plan workaround.
- **Local checks actually run:** BE Node24 isolated compilation exit0; config12/12 PASS. First HTTP load failed on staged root-vs-workspace `jose` resolution, before tests; after restoring the existing workspace dependency link, HTTP17/17 PASS. Preserve that staging failure. No555xx PostgreSQL/Auth fixture, native build, FE browser or hosted acceptance has run yet.

### Actual fixture/browser receipts and retained expiry blocker

The earlier unstarted-fixture note is superseded by the plan's actual owned startup/role proof and18/18 GoTrue→Nest→PostgreSQL integration PASS. Initial direct connectivity and rolled-back role-query failures remain retained. The support API then proved protected live/ready200 and unauthorized401; the exact0600 config and frozen63-file manifest were handed to FE under exclusive FE_BROWSER. No manual006 or owner3000 resource was reused.

FE reports the coordinator-approved exact CSP matcher (`/login`, `/application`, `/settings`, `/settings/team`) and existing404 regression selection passed24/24 in19.5s. Unknown routes remain public404; root/not-found/layout, authentication semantics and CSP directives were not changed for the correction. The initial static404 failure (11 nonce-less scripts,22 violations) is preserved. A separate corrected cross-user identity/logout/replay case passed in3.3s. These are forwarded FE results, not BE reruns.

The natural300s expiry case remains failed/open: BFF GET `/api/app/me` returned503 after `registered.expiresAt + 1000ms`, expected401. Receipt `test-1793788777480.json` ended2026-11-04T10:39:37.480Z, exit1,312.16s; source manifest `414976f90304553825145410ce926e589b424296f4843737ff33d1b0f88578a4`. No response JSON code/body was captured, so none is inferred. Existing frozen BE logs/state are insufficient to identify the request's error phase. Current status-only control shows no active fault and all63 hashes match, not historical proof or a passing expiry check. No diagnostic rerun, login/replay, reset/fault or source/artifact change was performed. T110, T108 and hosted gates remain open; explicit FE_RELEASE is still required.


Final FE_RELEASE is now explicit. Final FE source manifest: `apps/web/.openai/activation-source-2c0a45086a03b8c8d41f7683c5da8695/source-delta-final-blocked.json`, SHA256 `3cdf89617a835ad416b2e58cecda7a45105e2ee19dbef9e8908cc7df369d2751`;10 changed files/83 inputs/9 protected unchanged. Sibling `final-handoff.json` indexes exact command receipts and retained failures. Final build0, corrected three-file lint0 and CSP/public404/admission/navigation24/24 are attributed FE results. The earlier selected67 was66pass/1fail with its cross-user assertion later corrected; do not describe it as an originally clean suite. FE reports no55544 listener and no remaining control use. Existing BE guarded teardown/timebox/source work may resume; unresolved T110 expiry still blocks joint review readiness, with no new diagnostic rerun authorized.


### T108 bounded timebox result

The separate fresh pinned-Auth30s global-timebox/password proof is **not a non-NULL PASS**. Stored `not_after` was NULL before and after31.97s; real guarded Nest `/v1/app/me` returned200 both times while the original JWT remained unexpired. Refresh then returned400/`session_expired`. Corrected proof exited2 in37.37s (`control/timebox-proof02.json`); the first omitted `F005_FIXTURE_DIRECTORY` setup failure is retained separately. No Auth-row edit, SAML/pin/paid workaround occurred. Owned identity cleanup, forwarder stop and disposable fixture retirement completed; ports55540–55544 are released. T108 requires explicit acceptance disposition, independently of unresolved T110 BFF expiry. This exercised the retained frozen compiled tree, not unfinished newer operator source.


### Verified BE activation increment and execution boundaries

See [actual checks and retained failures](plan.md#independent-be-implementation-and-actual-checks). Extended CI31/31, corrected affected integration28/28 and corrected private-TMPDIR release121/121 passed. Original functional157/190 and integration240s timeout are retained, not rewritten as clean runs. Canonical generation/migration checks exited0. The owned standalone55532 role/advisory-lock checks passed and its exact tmpfs container/network were retired;55532 is free.

Native development artifact `56286e996c114bc16b297dcf7467744affb3eb4b6d0697e9f17f2244182baa58` binds89 source inputs at digest `c72ed13dde10e445d73fa20a7d7690b741c3d863eb5dcfca679a413eed1dc267`. Sealed HTTP/TLS/deadline/cancellation and bridge transition smokes each passed1/1. The bridge actually stayed ready through OLD→TARGET2→0, denied requests before DB access and attested runtime configuration. Darwin/arm64 development bytes are **NONRELEASABLE**; no Linux/publication/provider/hosted acceptance is implied.

The new executor's explicit positional contract is `action phase packetPath packetDigest artifactPath privateJournalDirectory verifiedCliPath`. `packetPath` must be exactly `privateJournalDirectory/packet-input.json`; inputs are never discovered from owner files or auth caches. `prepare` accepts only the public approved packet JSON/digest. All real execution requires the approved clean Linux/x64 Node24 artifact and matching sealed operator files/directories.

| Phase | Only private inputs admitted to its worker |
|---|---|
| bridge-config | VERCEL_CONFIGURATION_TOKEN, ACTIVATION_BRIDGE_INPUTS |
| bridge/app CREATE and acceptance | GITHUB_TOKEN, VERCEL_TOKEN, BE_PREVIEW_ACCESS_KEY; official CREATE child receives no runtime values or technical key |
| roles / initial preflight / TARGET postflight | ACTIVATION_ROLE_INPUTS |
| migration | ACTIVATION_MIGRATION_INPUTS |
| bootstrap | ACTIVATION_BOOTSTRAP_INPUTS |
| app-config | VERCEL_CONFIGURATION_TOKEN, ACTIVATION_APP_INPUTS |
| separately approved final FE acceptance | GITHUB_TOKEN, VERCEL_TOKEN, BE_PREVIEW_ACCESS_KEY, ACTIVATION_FE_RECEIPT |

Authorization/confirmation workers remain separate from configuration/SQL/bootstrap execution. Public controls include `BE_ACTIVATION_ENABLED`, `BE_DELIVERY_ENABLED`, `BE_DELIVERY_ENVIRONMENT=be-production` and `BE_ACTIVATION_PACKET_SHA256`; configuration-phase payloads and their digests must match the exact packet. Current-only remains the workflow default and OLD-pinned. Activation Actions stops after strict BE confirmation, retaining a tar archive that preserves private receipt modes plus archive/inventory hashes. A successful BE job does not mean full activation succeeded.

Later final FE handling is separately authorized, using the same artifact/operator and run. Operator context additionally requires `BE_ACTIVATION_CONTEXT=operator`, `BE_ACTIVATION_OPERATOR_APPROVAL` equal to the run UUID and the original numeric `BE_ACTIVATION_BUILD_RUN`. `import-fe` accepts only an untouched FE-gate snapshot at explicit `BE_ACTIVATION_RECEIPTS_DIRECTORY` with separately approved `BE_ACTIVATION_RECEIPTS_SHA256`, and verifies the exact remote app outcome before creating a new local lock. It cannot restart earlier phases. Final FE evidence requires its separately approved `BE_FE_ACCEPTANCE_SHA256`; authenticate actual final-origin behavior outside this executor before submitting that receipt. Lost remote acknowledgements use read-only reconciliation, never automatic effect replay.

T108 remains UNPROVEN/unchecked by explicit root disposition: no further timebox experiment or prohibited workaround. T110 has one newly authorized coordinated natural300s diagnostic, not startup permission; fresh exact lease/configuration/source binding and BE_READY are required. The plan records proposal nonce `111c9db9e9a94eb3529024a10c6e90c3`, missing historical runtime inputs, no-secret diagnostic requirements and protected-resource boundaries. No joint review/complete claim is made.


The diagnostic has now passed its separate resource/readiness gate; [the final handoff](plan.md#frozen-be-inventory-and-fresh-expiry-diagnostic-handoff) supersedes both unused parent proposals. Final parent `esty001-activation-wpj6tn2b`, nonce `111c9db9e9a94eb3529024a10c6e90c3`: secure config, source/configuration/observer hashes and phase ownership are in its `control/lease.json`; actual readiness is in `control/readiness.json`. Exclusive FE_BROWSER is granted for one natural300s case, with no competing BE requests. Sanitized `control/events.jsonl` and the four-marker Unix diagnostic socket provide correlation; dependency probes run only after the captured target response, before assertion. No diagnostic result or cleanup is claimed yet.

Final independent BE public inventory: original activation parent's `control/be-source-final.json`, SHA256 `c66147301f74293515ab9a40d5baf592bd03b5c258c6e82bb604a7a7031a4046`. All89 native source inputs and six canonical/generated/migration hashes matched. This is not a Git diff, publication allowlist, Linux release or joint review readiness.


The single authorized diagnostic subsequently passed1/1 in311.83s. Before assertion, BFF401/object/`unauthenticated` correlated to BE events130–132: actual JWT lifetime300s, expired=true, Auth rejection and API4018.632ms, with no target Auth/JWKS HTTP or app-DB transaction. Only after response capture, Auth/JWKS200 and the owned DB marker passed. The original refresh/identity/logout/old-JWT journey also passed. Historical503 did not reproduce and remains unexplained; no production fix or repeat was performed.

Explicit fresh FE_RELEASE was received and guarded cleanup completed: application commit plus four individual Auth deletions confirmed, forwarder/fixture stop0, zero owned containers/networks and55540–55544 free. Exact FE receipts, correlation IDs, build-cache distinction and `control/retirement.json` are indexed in [the final diagnostic record](plan.md#single-natural-expiry-diagnostic-result-and-guarded-retirement). Earlier unconfirmed identity-deletion evidence is unchanged. T108 and joint review/hosted gates remain open; no new source or runtime action is authorized by this receipt.

Owner t4y subsequently authorizes T112 review with T108 explicitly UNPROVEN/unchecked, not waived or passed. Current-scope T110 scenarios are accepted on the retained frozen-current evidence; historical503 remains NOT REPRODUCED / CAUSE UNPROVEN. Reuse the actual receipts without another test/build/runtime run. The coordinator receives exact BE/FE path/hash allowlists and fresh source/docs pauses before starting the single review; this does not authorize publication or hosted acceptance.

### T113 credential-boundary fix verification

The completed T112 review reported one conditional High/P1: known privileged Supabase aliases could be ignored in project environment metadata. The narrow correction rejects known Supabase/database/admin credential names before mutation or inspection; discovery after a configuration write remains an unknown outcome, with no replay or credential readback. No actual provider key inventory was inspected or changed.

Fresh isolated TypeScript compilation exited0. The affected configuration/phase-credential selection passed3/3 in168.039291ms; its new regression exercises21 aliases across pre-write, inspection and post-write boundaries. A separate compiled-operation smoke passed clean configuration/readback and both reported Supabase refusals, plus post-write database-credential refusal, using only synthetic transport. No full suite, native rebuild or browser rerun occurred. Prior sealed bytes are pre-fix evidence, not a corrected release artifact. See the plan's T112/T113 record; fix-only coordinator acceptance remains separate. T108 and historical T110503 limitations are unchanged.

Coordinator t4v accepted T113 after fix-only read-only inspection of the receipt, two source/test hashes and five-path allowlist. Existing compile/test/smoke results remain OMP evidence, not coordinator reruns; no actual provider inventory was accessed. No further review/test/build is required for this finding. T108, historical T110503 uncertainty and future release/production gates remain unchanged.

## Retained manual workflow P2 correction — current fix-only gate

The original scoped Luna review found one P2, reported by t11c: main drift after authorization could reach a private mutation. The corrected control wrapper now makes a fresh GitHub main/source check immediately before spawning each of the five private mutation workers. Their workflow steps supply `GITHUB_TOKEN` only to the parent guard; it is removed before strict phase validation and never forwarded to the sealed child. Do not add `VERCEL_TOKEN`, preview bearer or other provider context to a private worker. Missing token, changed expected SHA/tree or API failure stops before child creation, without retry/replay. Actual workflow run/ref, selection expiry, approved packet and unchanged f162 identity remain required.

Affected evidence only: isolated compilation0; Linux32/32 including30 authorization-to-mutation cases; five actual sealed-child environment observations contained no provider/GitHub variables. Unchanged-head guard admission was followed by deliberate synthetic-input refusal, not real mutation success. The separate actual CLI smoke refused drift/API failure before any child and admitted the unchanged-head child without provider variables; that child then refused its deliberately unreserved synthetic journal. Five changed workflow command blocks parsed and passed scoped environment/permission checks. No full suite or independent review was rerun.

Exact seven-path fix receipt and verification: `.openai/reports/retained-main-p2-9fmbq2yr/handoff.json` and `verification.json`. The earlier eight-path receipt and its original findings/evidence remain historical, not the corrected-source manifest. **FIX_READY_FOR_INSPECTION / NOT_READY_TO_CONSUME_EXISTING_INPUTS / NO_INFLIGHT / STOP WRITES.** t11c owns fix-only inspection; no new reviewer, real-input read/transfer, secret/variable write, source publication, dispatch or provider/SQL/config/bootstrap/deployment occurred.

### P2 fix inspection accepted — no production-transfer approval

Coordinator t11c accepted the fresh parent main/source guard and child credential isolation through fix-only inspection. The original review's one P2 and its corrective evidence remain preserved; this is not another independent review or a no-findings rewrite. The coordinator did not rerun checks or claim successful external mutation. Existing OMP compilation/Linux32/32/CLI/child-observation evidence remains unchanged.

The accepted fix receipt SHA256 is `72f909096dc5f98460f744d3d46ea2420e3f7adefeb00920cb2563f8d8f3d962`; adjacent `accepted-closeout.json` in `.openai/reports/retained-main-p2-9fmbq2yr/` binds this append-only documentation closeout and current hashes. **FIX_INSPECTION_ACCEPTED / NO_INFLIGHT / STOP WRITES.** Do not infer permission to consume or transfer existing real inputs, publish source, write secrets/variables, dispatch the workflow or perform provider/SQL/config/bootstrap/deployment work. Those gates, public packet/workflow approval, fresh retained-artifact preflight and final hosted/FE acceptance remain separate. No setup, input preparation, source/check/build or reviewer operation was repeated.

## Protected prepared-input transfer adapter — local review gate

The existing hash-guarded launcher now exposes two adapter actions. These are interface descriptions, not authorization to run against existing real inputs:

| Action | Positional inputs after the action | Result |
| --- | --- | --- |
| `inspect-transfer` | Prepared directory; approved request digest; approved absolute gh executable; executable SHA256; explicit approved GH_CONFIG_DIR; separate owned0700 report directory | Validates all five phases and seven-file inventory; writes exclusive0600 `transfer-plan.json`; emits only plan/request/receipt and phase digests. No gh execution or profile discovery. |
| `transfer-secrets` | Protected transfer-plan path; approved plan digest | Revalidates the immutable bindings, checks names-only absence, sends the fixed six payloads on stdin and records exact per-destination acknowledgements. |

Only invocation through the approved executable manifest is accepted. The coordinator supplies nonsecret executable/profile/report bindings and obtains the public digest receipt through the supported helper; the owner does not write transfer or activation JSON. Neither an arbitrary absolute profile path nor a hash supplied by an unapproved caller constitutes owner approval. Do not use ambient GH_TOKEN/GITHUB_TOKEN, a secret value argument, shell echo, auth-token extraction or a copied provider credential to work around the protected path.

On any collision, stop at the reported fixed destination. On nonzero exit, timeout, cancellation, output-limit or ambiguous write acknowledgement, preserve every attempt/started/ack record and stop at the exact UNKNOWN destination. Do not retry, overwrite, roll back, delete a receipt or infer equality from later name presence. Even successful completion is an acknowledgement record bound to the approved payloads, not a later GitHub value readback. GitHub does not provide atomic absent-only secret PUT; concurrent external writers remain an explicit risk.

Current evidence: compilation0;30 helper tests passed/1 optional existing cross-platform test skipped; all13 new transfer cases passed. Actual sealed Darwin/arm64 CLI smoke used fake gh under denied networking for six exact stdin payloads, collision, lost ACK,30s timeout and64KiB output overflow, including replay refusal and redaction. New local manifest SHA256 `90fde59dade232f29014e37ff2bd76b6f7e2e834525a86d009361871a5336a52` and exact source/test/docs/provenance are in `.openai/reports/protected-transfer-44eqstxe/`. No Linux release, real transfer or production evidence is implied.

**READY_FOR_REVIEW / NOT_READY_TO_CONSUME_EXISTING_INPUTS.** ONE adapter review belongs to t11c and remains pending. Existing real inputs and owner profile remain unopened. Coordinator constructs the activation packet from approved metadata and validated receipt digests; verify packet and current published workflow before any allowlisted variable preparation. Keep broad `BE_DELIVERY_ENABLED` false and withhold dispatch until packet/transfer/published-selection validation and separate authorization are complete. The three existing provider secrets and immutable f162 are not adapter destinations or rewrite targets.

### Adapter P2 correction — caller hashes are not approval

The scoped review found one P2 in the initial transfer adapter; fix-only coordinator inspection is now pending. `inspect-transfer` and `transfer-secrets` require the exact gh path/SHA256 in the independently approved guarded tool manifest's `transferGh` entry. The launcher verifies that entire manifest before the adapter uses this allowlist. Supplied CLI/plan fields cannot establish approval, even with a matching binary hash or recomputed plan digest. Missing anchors and unapproved executables refuse before prepared-payload access. Never self-generate a new manifest/digest from a caller-selected binary and treat it as independently accepted.

Focused compilation and14/14 transfer tests passed; an actual sealed synthetic CLI smoke proved both approved six-payload success and self-consistent malicious executable/forged-plan/missing-anchor refusals with no extra gh execution or profile access. `.openai/reports/gh-trust-p2-ajej04pb/` contains exact fix evidence. Its corrected executable manifest is synthetic-only, not a real-gh approval. The prior review-ready executable remains pre-fix evidence, not usable corrected tooling. No real gh identity, profile or input was inspected; independent approval of a real tool manifest remains a separate gate before real consumption.

**FIX_READY_FOR_INSPECTION / NOT_READY_TO_CONSUME_EXISTING_INPUTS / NO_INFLIGHT / STOP WRITES.** The coordinator performs fix-only inspection; no new review/full rerun or external operation. All receipt/UNKNOWN/no-retry and packet/workflow/variables/dispatch gates above remain unchanged.

### T145 HOME/profile correction — source-local review gate

The independently verified manifest's `transferGh` entry now requires exactly `path`, `sha256`, `home` and `configDirectory`. Caller and plan profile values must equal that approved profile before payload access. Only pinned gh receives approved HOME/GH_CONFIG_DIR; its cwd/TMPDIR stay in fresh owned0700 scratch. Cleanup targets scratch only, never HOME/profile. The helper's environment and all credential/stdin/target/receipt fences remain unchanged.

This addresses the coordinator-reported HOME-dependent401; OMP did not repeat that real diagnostic. Current proof is synthetic only: compilation0,15/15 focused tests and actual guarded CLI success/refusal/canary/scratch checks under denied networking. See `.openai/reports/gh-home-context-3yph15xc/`. The original actual attempt remains NOT_STARTED and its plan/evidence are preserved, not retried.

**READY_FOR_REVIEW / NO_REAL_INPUT_ACCESS / NO_INFLIGHT / STOP WRITES.** One coordinator-owned scoped Luna review remains pending. After acceptance only, use the root-selected real gh/HOME/profile in a new corrected executable binding and NEW plan against the existing prepared directory; do not rerun prepare or reuse the old invocation. Fresh names-only absence must pass before any secret write. No new credentials, activation variables or dispatch are authorized by this source-local receipt.

### T145 ordinary gh state — bounded allowance, not sandboxing

Root accepted the supported ordinary-state redirect instead of a general OS filesystem sandbox. Each pinned-gh child now receives `XDG_STATE_HOME=<owned scratch>/state`; HOME/profile remain the exact independently approved values, and TMPDIR/cwd remain scratch. The helper creates state0700, removes only that owned ordinary-state subtree, then removes scratch. No broader XDG cache/config override or credential export is added.

This permits ordinary **noncredential** gh state in scratch only. Config/auth-profile writes remain prohibited/out of scope; the redirect and synthetic canaries do **not** establish universal filesystem write prevention. The coordinator's pinned-gh read-only preflight succeeded and observed `state/gh/device-id` in scratch; OMP did not repeat that query or inspect profile contents.

Current correction evidence is compilation0,15/15 focused tests and actual guarded synthetic CLI proof of12 ordinary-state writes/cleanups with six payloads/ACKs and preserved canaries. `.openai/reports/gh-state-fix-vd3tg33z/` freezes exact source/test/docs/executable identities. The original review's one P2 and root's explicit narrower decision remain recorded.

**FIX_READY_FOR_INSPECTION / NO_REAL_INPUT_ACCESS / NO_INFLIGHT / STOP WRITES.** Coordinator fix-only inspection is pending. No real query/input access, secret write, transfer retry, variables or dispatch; do not reuse the previous plan/invocation or rerun prepare.

## Guarded ROLE diagnostic — review-gated local executable

The diagnostic-only helper action is `diagnose-role <prepared-directory> <approved-request-sha256> <packet-path> <approved-packet-sha256>`. These are public path/digest arguments, never credentials. It must run through the unchanged hash-checked `guardedOwnerCommand`/launcher using the reviewed Linux/x64 Node24.22.1 runtime and full inventory; direct helper execution refuses. Reuse the existing prepared ROLE envelope after matching coordinator review/execution gates. Do not prepare/collect inputs again, invoke activation/preflight/reserve or repurpose a journal/proof-writing command.

The current review candidate is `.openai/reports/role-diagnostic-uizb82x6/diagnostic-helper` plus `diagnostic-executable-02.json`, SHA256 `6b2172e98d8d7e77438a40ba7595bb9a2489113cd683e95b6867b0e00d7e1db4`. The coordinator binds actual mounted paths and approved request/packet digests; this documentation is not permission to consume real inputs or query Supabase. The snapshot is separate local development output, not a rebuilt/resealed f162 release.

Output is `ROLE_DIAGNOSTIC {"stage":...,"category":...,"sqlstate":...}` using fixed enums/allowlisted SQLSTATE only; exit0 requires category `passed` after successful cleanup, otherwise exit1. No URL, query, raw error, value, credential or row is printed. Connect1s/statement10s/query12s/lock5s/overall30s plus bounded rollback/close fence the authority-only session. Only fixed read-only identity, OLD history, postgres privilege and required-column predicates run; no runtime/operator login or user-data query. PASS is **not** proof of the original workflow failure cause.

Actual checks: isolated Linux compile0, focused46/46, and five real guarded synthetic TLS/pg-wire scenarios with no external network and unchanged fixture inputs/journal. Exact commands and failure disclosures are retained in the adjacent verification receipt and [plan evidence](plan.md#guarded-role-diagnostic--actual-sourcelocal-evidence). **READY_FOR_REVIEW; no real invocation before the coordinator's focused review and matching execution gates.**

### Current pre-DB refusal schema and mount binding

The corrected review candidate is `.openai/reports/role-diagnostic-substages-4a353xee/diagnostic-helper` with `diagnostic-executable.json`, SHA256 `80286f492d5806252006567e4714816c94dc3eef3391b7b2842362c353f6c9d5`. Pre-DB refusals now have exactly `{stage, category, sqlstate, field}`: category is `refused` or `aborted`, SQLSTATE is null, and `field` is a fixed code from the table below. No raw exception, input value or secret-bearing hash is output. DB-stage results remain exactly `{stage, category, sqlstate}` and are unchanged.

| Pre-DB stage | Allowed static field codes |
|---|---|
| `guard` | `execution_guard`, `executable_recheck` |
| `request` | `prepared_directory`, `prepared_files`, `request_validation` |
| `packet` | `packet_binding` |
| `receipt` | `receipt_binding` |
| `role-input` | `role_envelope`, `role_schema_or_digest`, `role_public_binding` |
| `migration-config` | `migration_configuration` |

Preserve the prepared directory's basename when mounting it: use `/esty-activation-inputs-tPWoIx`, not `/inputs`; mount the existing directory read-only without renaming, resetting or preparing it again. Keep the same approved packet, its owner-only parent and approved request/packet digest arguments. All nine nonsecret static binding comparisons matched, but this does not establish complete envelope validity. Source/local checks passed compilation0,30/30 affected cases and six actual guarded CLI schema/basename refusals. **The single real diagnostic remains held until focused coordinator review and matching gates; no live DB query has been made by this correction.**

### Guarded ROLE CA identity — no network or database

The separate local diagnostic adds `check-role-ca <prepared-directory> <approved-request-sha256> <packet-path> <approved-packet-sha256>` through the unchanged pinned launcher and executable manifest. Preserve the existing prepared basename and owner-only packet parent with read-only mounts; run with network disabled. It reuses all executable/request/packet/receipt/ROLE digest checks and the existing configuration parser before returning exactly `{caMatches:boolean,present:boolean}`. Refusal is exit1 with no result record, not a false missing-CA observation.

The fixed comparator is the parsed certificate identity of the root-approved public Supabase Root2021 CA. LF/CRLF PEM differences do not change the comparison. No certificate, ROLE value or private-derived digest is returned. Local compile0,38/38 functional cases and six guarded CLI cases passed; manifest `.openai/reports/role-ca-identity-tz4l4q_5/diagnostic-executable.json` SHA256 `27d6cf867e605bf317246cc5fa88d6ef8f1030dea0839f614427941e9ff5d667`. Coordinator delta inspection precedes the existing-input boolean check; no DB/provider/auth/status/journal effect is permitted. This command does not repair an envelope or determine the finer cause of `tls_error`.

Actual authorized result after accepted coordinator delta inspection: `{"caMatches":false,"present":false}`, exit0, exactly one network-disabled invocation; retained `ca-result.json` contains no other field. Existing prepared inputs/packet/history were not changed. Do not run `prepare` to repair this: the current operation requires secret re-entry, and no supported secret-preserving successor is implemented. A separate correctly validated request/all-five-phase/receipt/packet successor must preserve all secrets and explicitly handle the existing immutable reservation without reset or a new reservation. No successor or additional DB probe was performed; absence of the configured CA alone does not identify the finer TLS failure category.

### Fixed public CA diagnostic overlay — separate from production inputs

The subsequent root grant permits `diagnose-role-ca-overlay <prepared-directory> <approved-request-sha256> <packet-path> <approved-packet-sha256> <public-ca-file>` only through the separately pinned local launcher/executable. Mount the existing inputs, owner-only packet parent and supplied public CA read-only. The helper hard-pins both the approved public-file digest and parsed certificate identity; there is no caller-selected digest or trust root. Any original CA is refused. Only the in-memory authority SSL object gains the public CA, with verified TLS and the exact approved Session servername; the existing diagnostic still fixes host/port/database/login and read-only/rollback/timeout/cancellation behavior.

`ROLE_DIAGNOSTIC` adds only `caOverlay` and `publicCaAnchor:"supabase-root-2021"` to existing fixed fields. Pre-overlay failures report `caOverlay:false`, never claim an applied overlay. Source/local compile0,50/50 tests and six actual guarded loopback-only cases passed; manifest `.openai/reports/role-ca-overlay-6yk31ag8/diagnostic-executable.json` SHA256 `174993a339b2fb9a1a53426f507b85711c178d4b5a8a1f16e4034a819d94f837`. Coordinator delta inspection precedes the single network-enabled fixed-host authority diagnostic. Do not copy this overlay into production, alter original bindings, build a successor, retry activation or make a new reservation.

Actual single overlay diagnostic after accepted coordinator delta inspection: `{"stage":"complete","category":"passed","sqlstate":null,"caOverlay":true,"publicCaAnchor":"supabase-root-2021"}`, exit0. Retained `.openai/reports/role-ca-overlay-6yk31ag8/actual-result.json`. This verifies the fixed read-only path under the in-memory public CA, including rollback/close; it does not change production CA, prepared inputs, packet/reservation/journal/status or authorize activation retry. No second live invocation was made. Preserve the earlier absent-CA and failed diagnostic evidence; do not rewrite the original workflow cause as proven.

### Guarded CA successor and exact failed-preflight continuation — review held

The later root grant supersedes the diagnostic-only stop solely for T159–T169. Do not repeat the diagnostic or rerun initial preparation/secret entry. Use the separately frozen `ca-successor-d1b7zvhm/activation-executable.json` through the unchanged approved launcher/runtime guard; its SHA256 is `d02721f629688c3f4977bbef68f3a747eb04554772a6e5883f2700e7f70c6e53`. Source/local evidence: compilation0,49 distinct affected cases across retained runs,15 actual guarded/manual CLI outcomes and YAML check0. Failures and limits are retained in the plan. These are synthetic local results, not review acceptance, actual proof acceptance or production activation.

The bounded action interfaces are:

| Action | Required approved bindings | Effect |
| --- | --- | --- |
| `inspect-failed-preflight` | Original completed transfer-plan path/digest; intact public f162 bundle root | Read only the exact historical run/intent/receipt artifact, verify archive/inventory/lock/packet/no-events and f162 bytes, then write a separate local proof record. |
| `record-failed-preflight` | That proof-record path and independently accepted digest | Revalidate proof and absence of statuses, exclusively persist intent, POST one truthful `error`, and ACK only an exact response. Any ambiguity retains the fence. |
| `prepare-ca-successor` | Original completed transfer-plan path/digest; original packet path/digest; fixed public CA file | Validate all originals in process and write a separate exclusive request/five envelopes/receipt/packet/control with a new execution UUID; preserve all secret and business identities. |
| `inspect-ca-replacement` | The new `successor.json` | Revalidate its exact derivation and create one deterministic five-target replacement plan. |
| `replace-ca-secrets` | That replacement-plan path and approved digest | Require all five destinations already present, send only their payloads through stdin, and persist each started/ACK pair. Never write configuration-token/provider-secret slots. |

Keep the original transfer-plan and six ACK receipts read-only; they are lineage evidence, not permission to run the six-slot transfer again. Preserve all old packet/journal/lock/reservation files. The exception is only run42847325668/attempt1; arbitrary NO_STATUS/error/UNKNOWN histories, old81d4/454, another project or a consumed execution remain blocked. Missing/expired authoritative receipts refuse rather than infer safety. Do not copy or echo prepared envelope contents, reset partial successors, delete failed attempts or retry an unacknowledged status/slot.

One coordinator-owned focused review precedes real input/provider use; accepted exact proof precedes its terminal status. The corrected current-workflow controller must actually be published and its exact workflow SHA/public packet variables aligned before the new manual dispatch. f162 stays immutable and ordinary delivery remains disabled. The existing shared noncancel gate, current-main checks, approved phase ordering and final FE acceptance still apply. No live operation or workflow publication has been performed by this increment, and no shared README/PROJECT_STATE lease is inferred.

