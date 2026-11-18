# Validation Guide: Etsy Connectivity

## Current Auth trust-boundary correction

**READY_FOR_BE_SETUP_PUBLICATION.** t151 recovered existing t175's actual FIX-ONLY final and accepted the scoped Auth correction: **original setup Auth P2 RESOLVED; no further confirmed findings in FIX-ONLY**. The original setup review remains one confirmed P2, distinct from historical prune and packaging reviews. Reviewer tests/build/runtime were NOT_RUN. This closeout changed only four010 evidence files; source hashes/document integrity were verified without rerunning any application check.

### Corrected owner entrypoint

Do not invoke the former unbound interactive Owner entrypoint or copy an example target. Only a newly generated, independently approved guarded `owner.sh` carries authority: the existing setup generator first verifies its approved packet, full new configuration digest and immutable source/artifact/operator, derives `owner-binding.json` with exact Auth URL/public-key hash, and embeds that file's digest in the launcher. Owner input cannot select the expected digest or target. Receipt loading verifies exact schema, packet expiry, project and artifact provenance; actual execution checks Node/operator identity before any hidden prompt. Settings and constructor require the opaque verified approval and exact URL/key match; login rechecks receipt/artifact/expiry before transport. Lovora API origin and current-session/Owner checks remain unchanged.

The Owner receipt/launcher contains no raw public key or runtime/database credentials. The Owner client reads only this nonsecret binding, not the new runtime bundle. Manual use of a self-computed receipt digest is not an approval path. Actual trusted packet/config/native artifact and owner authorization remain unavailable; no real launcher or credential request is issued here.

### Actual narrow checks

Using the existing exact Node24.22.1 and isolated empty task HOME/user+global npm/Docker configuration, without installation:

```sh
npm run stage:operator --workspace @esty-admin/api
node --test --test-name-pattern="Etsy setup Owner approval|staged operator imports" apps/api/build/tests/etsy.test.js apps/api/build/tests/artifact.test.js
node --test --test-name-pattern="Etsy setup Owner approval" apps/api/build/tests/etsy.test.js
```

- Compile/stage passed, manifest current,157 dependency packages. Boundary+isolated-package checkpoint **2/2 passed**; after strengthening assertions to observable refusal/redaction rather than wording, final boundary test **1/1 passed**. These overlap, not three distinct tests. The unchanged package regression verified actual isolated imports/no-input behavior with the new transitive Owner dependency.
- Permanent boundary coverage: another valid Supabase project+matching public key, same-project wrong key and forged approval fail with **zero transport and zero password acquisition**. Changed source/tree/artifact/runtime/config binding under the pinned digest fails; independently pinned malformed/expired/source-incompatible receipts also fail. An already loaded approval expiring before login fails. Errors do not disclose password canary, Auth URL or public key.
- Owned runner with temporary preload selecting only `Etsy setup Owner client`: **1/1 passed**. Actual signed JWT/current SQL Auth session/current Owner/Nest/SQL lifecycle, with synthetic password HTTP/Etsy HTTPS and independently pinned synthetic approval. Fresh fixture `esty-etsy-412d6be11e8bfa2b`, loopback32776, tmpfs; teardown completed and exact container absence was checked. Unrelated strict-cutover/full suites were not rerun.
- Pinned Linux/x64 Node24.22.1 image, network none, read-only root, dropped capabilities and only new synthetic fixture mounts: actual generator derived exact Auth URL/key hash, embedded the external binding digest, excluded raw key/runtime secrets, rejected changed configuration and emitted valid shell syntax.
- Actual PTY execution of generated `owner.sh`: attacker project and same-project wrong key stopped before email/password prompts. Tampered binding and unbound direct CLI stopped before settings. Approved settings reached the email prompt; the smoke cancelled there without entering email/password. No Auth/provider call was made. Unit transport counters separately prove zero credential submissions on rejected input.
- This Linux package has deliberately fake source revision/tree and a throwing synthetic CLI: **not native/published release evidence**. Final synthetic package digest `cad8cf933276877495ace34976d137d359057e861bb7cedda3cfb7c83ba3d6cb` is test identity only.

One new failure remains recorded: initial compile exited2 because the new test fixture passed a readonly migration tuple to a mutable artifact-builder parameter. The fixture now supplies a mutable copy; production guards were not weakened. All five prior setup failures and the original one-P2 review remain preserved.

### Frozen delta and cleanup

Only three source paths differ from the prior setup freeze: `apps/api/scripts/etsy-owner.ts`, `apps/api/scripts/etsy-release.ts` (Owner binding/guarded-launcher interface only), `apps/api/tests/etsy.test.ts`. The other132 build-source records are unchanged. Four existing010 evidence files record this increment; six paths from the original13-path review scope are byte-identical.

Current source135 digest: `4f76286597a498eccf69eab91157264dbc0e34af7c0f6c495f49484cd4bf8cc4`. Operator6329-file/683-directory digest: `bd8d8eeb5f934505b0e0beab953d68a86f42b2ba8951dc3a499b91d539824ee4`. Original setup packet SHA-256 `e2c6172c8aca454c76029c01005c09658a9e1819885e9a4b19d7ecc57344e399` and review-scope digest `a5e4270f195aeb88b3e5b9f11ae89530bcb9769594f546d1cfa71588ee9127ab` remain historical, not the corrected source.

Exact hashes/checks and the preserved setup snapshot are in setup-preparation.json; public logs/inventories and a byte-identical original packet remain in task scratch `esty-be-setup-auth-fix-1vnoj0mo`. Synthetic receipt/config/launcher/package/harness files and empty task environment were removed after evidence capture. Ignored build output remains. Shared services/volumes/FE ports and all root/dependency/FE/CI/runtime/SQL/provider phase source stayed untouched.

**Accepted source-local review is not publication or hosted acceptance.** The nine source/test paths and135-file digest above remain frozen. t151 will handle existing-branch publication after this docs freeze; the writer performed no Git/main change. New committed/current-main binding, clean exact-source Linux native build and separate immutable artifact approval remain open. Optional24f5 native baseline stays skipped/NOT_RUN. Actual configuration/target/key/packet/maintenance/recovery/activation decisions remain OWNER_INPUT_PENDING; real cloud SQL/provider/deploy/domain/ACK/Etsy acceptance remains HOSTED_NOT_RUN. General FE and prune gates stay open. No ready real shell launcher is claimed. No tests/build/runtime/resources/private/provider/CI/FE action or new reviewer was started during closeout. **STOP WRITES; ownership returns to t151.**

All following sections preserve the earlier setup freeze verbatim. Their old unbound Owner interface and pre-review status are historical and superseded by this correction, not current usage guidance.

## Current BE setup completion — source-local first, deploy later

**READY_FOR_BE_SETUP_REVIEW.** t151 accepted the bounded plan and implementation authority; t15j completed the nine source/test paths and four010 evidence files, then froze them for the coordinator. Existing t175 has not reviewed this new increment yet. CI remains deferred and disabled; no enablement or routine guard change was made.

### Scope and identities

PR6's existing BE baseline is published on planning-observed main `24f5dc3fddfc25680ba11ff8214ce374e214f46a`, tree `87a13cda426503232ae66b01fea9aacb77b7eaaf`. The132-file baseline digest was `ba9c78358a6864e88b78018cf4816af4ed58fa7a49c682b47029408f7695dbba`. The worktree remains assigned branch `feat/etsy-connectivity` at supplied HEAD77e5/tree0a39; no Git mutation/publication occurred. Main was not needlessly re-probed during implementation.

Subsequent t151/root FYI reports clean main/origin `08e68fb91e0cfb74776494eb84709e8eb9b2244b` after FE53ac9ac, with API/010/canonical bytes preserved and only FE generated types regenerated. This is supplied evidence, not an independent BE blob verification.24f5 is historical. Future exact controller/artifact work must rebind then-current public main and verify BE blobs; no rebase/pull or native/build restart was performed for this FE-only metadata update.

| Current development evidence | Value |
|---|---|
| Full135-file public build-source digest | `310907b72b72062e8cef3a236a9229ffb41977e340a9f156b5bb1c9bf46557de` |
| Staged operator inventory,6329 files/683 directories | `222261d17eae8f4b6deb227a07819cc0ed46414434ce11885df2236b0ef43e2f` |
| Historical review-manifest.json, retained | `a925080d6d587187c67c0581c9283655ead6711dbabb918cd4dfa0d3f9a3645a` |
| Historical release-preparation.json, retained | `53ba2808f958e0201b2a647cf20195570955ea1ed092595dd71f861d6f2b7664` |

The source digest uses canonical artifact file records; operator digest uses canonical complete `{files,directories}` inventory. Exact records, changed-path hashes, tools, logs and prior planning receipt are in [setup-preparation.json](setup-preparation.json). This overlay is not published24f5, a clean native build, or an approved release. The original24-file review digest is historical, not an unchanged claim for the newly extended tests.

### Implemented operator contract

- `activation-config.ts` now includes all ten Etsy keys in the existing digest. Absent Etsy keys preserve the legacy digest; every present Etsy value binds the new one. Old D1 remains historical and does not attest this configuration.
- `etsy-setup.ts` validates a fresh exact `{runtime,backupPolicy}` envelope through existing startup validation, including the complete enabled envelope even when output stays disabled. `prepare` takes one fresh output path and hidden-TTY JSON; `validate` takes an explicitly selected new0600 **raw input snapshot**, not the prepared output bundle. `key` takes one fresh output path and requires hidden key-ID/policy/confirmation. Existing0700 parent, exclusive0600 output, no overwrite/symlink/original discovery/injection. No real key was generated.
- `etsy-owner.ts` accepts no command arguments: hidden settings contain exactly `authUrl`, `authApiKey`, `technicalKey`, `invitationOrigin`, `clientId`, then hidden Owner email/password. Fixed existing password sign-in plus Nest `/v1/app/me` verifies current session/Owner. Explicit status/list/create/reconnect/cancel/start/read/disconnect/logout only; no refresh, background call, automatic retry, actor UUID or prune. Revision/idempotency is explicit. Share/consent/results go only to fresh private files. Reconnect warns before removing/fencing old local credentials. Unknown writes/logout remain unknown, not replay or revocation success.
- `etsy-release.ts` implements seven separately approved phases: `history` → `held-create` → `pre-sql-check` → `sql-apply` → `post-sql-check` → `promote-only` → `final-domain-ack`. One held skip-domain CREATE; exact pending503 before SQL (unexpected ready200 refuses); exact3→4 SQL; same-ID ready200; explicit same-ID promotion; final alias/health/config/inventory/ACK.
- Durable exclusive intent precedes network. A returned CREATE ID is fsynced before follow-up even on nonzero/abort. Missing/late/unknown ACK, changed main/packet/config/history, wrong503, alias drift, missing receipts or fsync failure retains a terminal lock; no retry/new CREATE. Separate processes cannot repeat consumed CREATE/promote. Old strict3 pending503 is accepted only in the bound post-SQL maintenance phase, never healthy rollback.
- Live launchers require actual Linux/x64 Node24.22.1, exact immutable source/artifact/CLI/operator/config/packet and current approvals. Their embedded built-in-only inventory verifier runs before importing operator code. The ledger is fixed to the actual OS user's retained home `.local/state/lovora-etsy-setup`, not an alternate packet directory or HOME override; one authoritative host/user and exclusive owner lease remain required. SQL/history phases receive only migration input and publicly bind GitHub main; no Vercel/Auth credentials. Provider/probe and Owner inputs remain separate.

These are implemented interfaces, **not issued owner execution commands**. No usable real packet/native artifact/secure input/maintenance approval exists in this receipt. A private directory or synthetic hash is not approval. No old675/f162 launcher, receipt, pinned probe or D1 input was reused.

### Actual affected checks

Exact existing Node24.22.1 ran with explicit minimal environment, empty HOME and separate empty user/global npm configs; no install:

```sh
npm run stage:operator --workspace @esty-admin/api
node --test --test-name-pattern="Etsy setup|runtime attestation|staged operator imports" apps/api/build/tests/config.test.js apps/api/build/tests/release.test.js apps/api/build/tests/artifact.test.js
node --test --test-name-pattern="Etsy setup|staged operator imports" apps/api/build/tests/release.test.js apps/api/build/tests/artifact.test.js
```

- Build/stage exited0: manifest current, TypeScript compile passed,157 production dependency packages, three explicit helper entries added without copy-all.
- First successful focused config/release/package checkpoint: **35/35 passed**. After final fixed-ledger/CLI/metadata/approval guard changes, final release/package run: **32/32 passed**, zero failed/cancelled/skipped. Counts overlap; they are not67 distinct cases.
- The package regression stages the real operator, copies it outside checkout fallback, imports new/existing helpers and exercises no-input/refusal boundaries with filesystem/process/network restrictions. Final pinned Linux checks also imported the actual staged code.
- Actual owned E2E: `node --import <task-scratch>/fixture-selection.mjs apps/api/scripts/etsy-local-check.mjs` exited0, **3/3 passed**. The temporary preload only narrowed the runner's existing child test arguments to `--test --test-name-pattern=Etsy setup apps/api/build/tests/etsy.test.js`; fixture setup/validation/teardown remained unchanged. No unrelated original21-case rerun. Exact preload hash/text is retained in the evidence packet.
- Fixture `esty-etsy-30801192c8d47e4d`, loopback32775, tmpfs: real Nest/PostgreSQL, signed JWT and current SQL Auth session/Owner checks; synthetic password HTTP and Etsy HTTPS. The new client completed create/start/callback/status/four-field read/reconnect/cancel/disconnect/logout; Member/foreign/demoted/revoked authority and lost-write response refused. No status provider call. Separate fresh DB proved old strict3 ready200→pending503 and target strict4 pending503→ready200 around actual exact3→4 migration. Provider CREATE/promote transport stayed synthetic, once each.
- Actual PTY invocation of `etsy-setup.js prepare` accepted only synthetic hidden JSON, exited0, saved0600 disabled output and did not echo secret canary/DB URL/keyring. Key generation and real private inputs were NOT_RUN.
- Pinned Linux image `docker.io/library/node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea`, Node24.22.1/linux/x64, binary `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`: network none/read-only root/dropped capabilities, only new task-fixture mount. A clearly marked **synthetic sealed fixture with fake source revision/tree and a throwing synthetic CLI**, not a native/published artifact, generated all seven shell scripts. Shell syntax, actual pre-import inventory/no-TTY refusal, alternate-ledger refusal, changed-CLI refusal and changed-operator-before-import refusal passed. No credential/SQL/provider call or actual CREATE.

Unrelated suites and historical artifact-pinned activation-recovery fixtures were not run or retargeted. Existing CI/routine/private-input allowlists and strict schema behavior remain intentionally unchanged; no full-suite or historical-artifact acceptance is claimed.

### Failed attempts retained

1. Initial typecheck exited2: two test `assert.rejects` calls supplied `undefined` where the type requires an error predicate. Corrected the test callbacks; later compile passed.
2. Initial build exited1 because isolated npm user/global configuration used the same path. Separated the two empty files; no dependency change/install.
3. First focused run:28 passed/2 failed because the synthetic setup fixture omitted explicit `APP_RETENTION_POLICY_ID`. Completed the fixture; runtime validation was not weakened.
4. First owned runner attempt could not find default `/var/run/docker.sock`; no fixture started. Selected the existing local OrbStack socket explicitly with empty task Docker config, without reading actual auth/config stores; subsequent owned run passed.
5. First Linux launcher fixture failed packet validation because synthetic `dpl_synthetic_old` violated the existing deployment-ID grammar. Corrected that fixture ID; no source guard was weakened. Later Linux positive/fault smoke passed.

### Cleanup, review and remaining gates

The owned DB/HTTPS/Auth fixture runner completed guarded teardown; Linux containers used `--rm`. Task-only synthetic packets/config/results, generated shell scripts, synthetic sealed package and temporary preload/assembly/smoke scripts were removed after hashes were recorded. Sanitized failure/success logs and public source/operator inventories remain in `esty-be-setup-checks-2be2x1xj`; ordinary ignored build output is retained for review. Shared services/volumes, FE55440–55444, dependencies, root package/lock, CI/routine/schema guards and FE/shared docs were untouched.

**Source-local:** READY_FOR_BE_SETUP_REVIEW, frozen; only t151 starts existing t175. **Owner decisions/secure input/maintenance/recovery/activation:** OWNER_INPUT_PENDING. **Hosted/provider:** HOSTED_NOT_RUN. General FE/recipient journey and operational prune stay deferred; this is not complete hosted Etsy acceptance.

Baseline24f5 native build was deliberately skipped per the accepted priority. Final new-source native artifact still requires scoped review, separate publication/main integration, freshly bound clean source, unchanged pinned official builders, exact native evidence and explicit artifact approval. No Docker runtime/synthetic package pass substitutes for this gate. No install, Git publication/merge, real private/Auth/cache read, cloud SQL/provider/Etsy call, deployment, DNS or billing action occurred.

The remaining sections preserve earlier packaging/pre-merge evidence byte-for-byte. Their old digest coverage and publication/overlay claims are historical, superseded only by the current section; original one-P2/resolved and separate accepted packaging review history are not rewritten.

## Current BE release preparation — packaging fix review

**READY_FOR_SCOPED_PUBLICATION_MAIN_INTEGRATION_DECISION.** Coordinator t151 accepted t175's separate packaging-delta review with no confirmed actionable findings in the exact five-path scope; actual gpt-6-luna medium was coordinator-verified. The reviewer ran no tests/build/runtime. The original Etsy full review remains one P2, resolved through its earlier fix-only recheck; this is a separate review. The supplied published baseline remains `00fc8c5505c20a801ac63fcc02ee9aa24324a080` on `feat/etsy-connectivity`, tree `0fb95fdd16f7b58d925ee586a0ce1df48503b4e4`. Initial local HEAD/tracking ref agreed; no fresh remote probe occurred. The reviewed packaging repair remains an **uncommitted development overlay**, not exact00fc source, merged main or an admitted production artifact.

| Identity | SHA-256 |
|---|---|
| Published132-file build-source closure | `03c6116155885e8ff13bddd2da721af10190cf730eca179a2b0c2f0c739ed0af` |
| Repaired132-file development build-source closure | `ba9c78358a6864e88b78018cf4816af4ed58fa7a49c682b47029408f7695dbba` |
| Original reviewed24-file Etsy scope, unchanged | `4622d379a53e5090eff488ec80f68bc13f58e6162daa31340d70575102517498` |
| Historical review-manifest.json, unchanged | `a925080d6d587187c67c0581c9283655ead6711dbabb918cd4dfa0d3f9a3645a` |
| Pre-fix operator inventory,6307 files/683 directories | `68c27e118d920059981f9d428311bc30011402b46c4e906dc1bc9b88634f195a` |
| Fixed operator inventory,6326 files/683 directories | `426eaf8bcdf90ad5e3ebe722abb3d4508dff6949a1fa4afc6313b04c26b06ca5` |

The132-file digest uses artifact.ts canonical file records; the24-file digest uses the historical manifest's path/TAB/hash/LF algorithm. They measure different scopes. Exact file records, source deltas, commands, tool/image hashes and retained public evidence are in [release-preparation.json](release-preparation.json). No `.vercel/output` release artifact or exact-artifact approval is claimed.

### Actual bounded checks and retained failure

Initial compile/stage exited0 and copied157 production dependency packages. The isolated pinned Linux smoke then exited1: `ci-migrations.js` could not import `activation-diagnostic.js` through `app-roles.js`; `ci-delivery.js` could not import `activation-recovery-origin.js` through `activation-journal.js`. Successful compilation/staging was not packaging acceptance. The failing package and log remain retained; temporary smoke harness hashes are recorded before their cleanup.

AST analysis followed local imports and declared local executable URLs:42 required scripts,19 absent from the explicit stage list, no absent compiled source file. The coordinator-authorized fix touches only `apps/api/scripts/stage-operator.mjs` and `apps/api/tests/artifact.test.ts`. It copies the exact required public closure, not every script or private input. One regression stages the real package, copies it outside the checkout, imports the staged migration/delivery entrypoints, rejects unapproved schema/workflow context, checks no-input CLI behavior and preserves package inventory. Its package-probe/CLI children have an explicit minimal environment and empty HOME, no NODE_PATH, read access only to the package/probe/guard, no write/child-process/addon permission and network tripwires.

Using the existing exact Node24.22.1 binary with isolated empty HOME/npm config and no install:

```sh
npm run typecheck --workspace @esty-admin/api
npm run build --workspace @esty-admin/api
node --test --test-name-pattern="staged operator imports" apps/api/build/tests/artifact.test.js
```

All exited0; the targeted regression passed **1/1**, zero failed/cancelled/skipped. The regression itself runs the real stager once. No unrelated suite or database fixture was needed.

A separate actual Linux/x64 execution used the already-present `docker.io/library/node@sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea`, `--pull=never`, `--network=none`, read-only root/package/harness mounts, dropped capabilities and empty HOME. Actual runtime: Node24.22.1, Linux/x64, executable SHA-256 `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb`. Both staged imports passed; build CLI with no input returned0/ARTIFACT_BUILD_INPUT_REQUIRED, delivery CLI with no input returned1/BE_DELIVERY_NOT_ACCEPTED. Overall PASS/exit0. The exact owned container was removed and absence checked.

This is a Darwin-compiled development operator package exercised in Linux, **not a native Linux Vercel build**, immutable release artifact, provider upload, migration execution or hosted acceptance. No SQL/Auth/provider socket or credential was supplied. Public before/after packages and evidence remain in task-owned external scratch for review; the ordinary ignored build output remains. No shared service/volume was changed.

### Production source/artifact admission

`build-artifact.ts` release mode requires Linux/x64, exact Node24.22.1, clean source, branch `main` and HEAD equal to local `origin/main`. Delivery also verifies actual current-main identity through the provider under later authority. Initial local `origin/main` was `c6d7a17bb9505d824d683667690fa0450a2337f5`; this was a local tracking observation, not a fresh remote-state assertion.

The repair's scoped review is accepted; publication/main alignment still requires its own decision and authorization. Recompute revision/tree/full-source identity for the future approved clean source, then build and approve its immutable native Linux artifact. Do not relabel this overlay as00fc, treat the branch as admitted main, reuse the old source/output digest, deploy the development package, or silently weaken these guards. No long native build/bootstrap was attempted under this bounded grant; pinned public tooling is not claimed unavailable.

### Safe Etsy runtime configuration guide — no injection performed

Existing app registration/access/resources, accepted roles/bootstrap/D1/D2 and corrected Owner login are supplied facts. Do not ask for credentials in chat, re-read original owner/private/auth files, redo account setup or replay accepted foundation actions. Preserve the existing Vercel project/Production environment, accepted database/Auth target, verified Session TLS, application bearer protection and originals.

All Etsy fields below are server-only. Set exact approved values through a separately authorized owner-controlled secure Production-variable channel; do not use shell arguments, history, repository files, public logs/screenshots or `NEXT_PUBLIC_*`. A safe validation report records field names/categories and pass/fail, never values or reversible encodings.

| Field | Exact application contract / decision |
|---|---|
| `ETSY_ENABLED` | Absent/`false` disables; only literal `true` enables. Keep disabled pending explicit bounded activation authority. Enabled configuration requires `APP_FOUNDATION_ENABLED=true`. |
| `ETSY_CLIENT_ID` | Existing registered app identifier, `[A-Za-z0-9_-]{1,256}`; not a newly registered app. |
| `ETSY_SHARED_SECRET` | Existing app shared secret, `[A-Za-z0-9_-]{1,256}`; not an OAuth access/refresh token. |
| `ETSY_CALLBACK_URL` | Exactly `https://api.lovora.us/integrations/etsy/callback`. |
| `ETSY_RETURN_ORIGIN` | Owner-approved canonical HTTPS origin only; no credentials, path, query or fragment, including no trailing slash. |
| `ETSY_INVITATION_ORIGIN` | Independently approved canonical HTTPS origin with the same origin-only constraints; a configured origin does not create a recipient confirmation page. |
| `ETSY_INVITATION_TTL_SECONDS` | Explicit decimal integer300–604800, no leading zero; owner selects policy. Distinct from the300-second OAuth attempt. |
| `ETSY_RETENTION_SECONDS` | Explicit decimal integer300–2592000, no leading zero; no implicit24-hour policy and no automatic prune. |
| `ETSY_TOKEN_ACTIVE_KEY_ID` | Explicit version identifier `[A-Za-z0-9_-]{1,64}`, present in the keyring. |
| `ETSY_TOKEN_KEYRING` | JSON object, at most1024 characters,1–4 valid key IDs; each value is exactly43 canonical base64url characters encoding32 bytes. |

For later authorized key creation, generate independent cryptographically random32-byte material on the trusted owner machine (`crypto.randomBytes(32).toString('base64url')` is the existing Node-compatible encoding). Deliver directly to the approved secret store or a new exclusive0600 file inside an owner-controlled0700 directory; do not print it or overwrite originals. A UUID, password or app secret is not an encryption key. Select the non-secret version ID explicitly, securely retain required decrypt keys/backups and verify the active ID exists. No generation, rotation, rewrap, key retirement or pruning was executed here; backup/retention policy remains an owner decision.

Preserve the accepted foundation envelope: strict schema mode, workspace UUID, matching project `/auth/v1` URL and public/publishable Auth key rather than an admin key, explicit retention policy, `API_RUNTIME=vercel`, Session database role/target/CA and64-lowercase-hex application bearer. Keep email/admin credentials absent unless independently authorized; do not copy local API_HOST/API_PORT or operator/deploy credentials into runtime. This is a preservation contract, not permission to read/reconvert/reinject accepted secrets.

The existing activation runtime digest covers foundation fields only: it excludes `ETSY_*`. D1 CURRENT_CONFIG_ATTESTED therefore does **not** attest new Etsy configuration. A later authorized protected candidate must validate its proposed enabled configuration through existing startup `parseConfig`, reporting safe names/categories only; success with Etsy disabled ignores unused Etsy inputs and is not validation of them. New Etsy configuration needs its own evidence bound to the approved source/artifact and secure injection, without changing the old D1 receipt.

Before enabling even a bounded acceptance session, settle exact non-secret origins, expected positive-int64 shop ID, TTL, retention, active key/backup policy, registered callback match and hosted routing/access/log privacy. Neither a keyring nor an invitation URL authorizes shop access or Lovora membership.

### Concrete additive migration/transition decision packet

The current target appends `1794890229976-etsy-connectivity` SHA-256 `45ab221e19b11735809d23d77d6acb86f7c3a983bf2f40c9905ff9a1b5de4688` to the unchanged first three entries. Previous digest: `149cb530551c0f0e2b734c1aa1086eac5615e01ebca152a8203490c8d93200c3`; target four-entry digest: `1abeceddcc07eadf5b7929ed52a786ec8a807a73568f1e214bfab556c3859540`. Exact names/checksums are in the preparation JSON. This is one migration history, not a second foundation setup.

`ci-migrations.ts` already supports an additive `RoutineMigrationPacket` and `BE_DELIVERY_MODE=versioned-migration`. It requires the exact previous prefix, immutable first-three digest, exact approved artifact migrations, packet SHA-256 and migration input digest. Authorization verifies current main/preflight/predecessor and persists reservation; the SQL-only phase compares exact before/pending state under the migration lock and records a confirmed result; continuation rechecks both receipts and predecessor compatibility **after** the schema commit before delivery.

The pure contract smoke observed: old three-entry strict app + three-entry history = ready; old strict app + four-entry history = **not ready**; new strict app + four-entry history = ready. `assertActivationManifest()` also rejects the additive target. This does not inspect the accepted D2 deployment. **Inference:** if that predecessor is the old strict-three contract, the existing after-migration readiness check cannot pass. Supplied D2 acceptance alone is not compatibility evidence for010.

| Required packet/admission input | Current value or required decision |
|---|---|
| `version` / delivery mode / schema digest | `1` / `versioned-migration` / exact four-entry digest above, only after authorization. |
| `revision`, `tree`, release artifact digest | Future approved clean-main source containing the reviewed packaging repair and its native Linux artifact; absent here. Never substitute00fc or the development inventory digest. |
| `target`, `migrationInputDigest` | Existing approved Supabase target and digest of the exact secure SQL-only envelope, supplied/validated through later authorized handling; no secret input is read now. |
| `previous`, `migrations` | Exact3→4 lists in preparation JSON; verify authoritative hosted history under later SQL authority rather than assuming it from supplied D2. |
| `predecessor.id/revision/artifact/configDigest` | Supplied accepted candidate is `dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7`; routine predecessor binding and remaining identities still need authorized evidence. Do not reuse historical f162 identity. |
| `compatibilityApproval` | Approved evidence for the selected predecessor's readiness/contract before and after this exact transition. Missing; a synthetic hash is not approval. |
| `recoveryApproval` | Explicit recovery decision for schema committed but candidate/create/promote/acknowledgement failing; no assumed SQL rollback or blind retry. Missing. |
| `BE_MIGRATION_PACKET_JSON/SHA256` | Canonical completed packet and approved exact digest after the above decisions; no placeholder packet is executable authority. |

**Decision required before any SQL:** supply an independently approved compatible predecessor with exact source/artifact/config binding and both-history evidence, or authorize a narrowly scoped transition design/implementation preserving strict readiness, approvals, phase separation and recovery semantics. Neither alternative is selected or implemented by this preparation. Do not use `current-schema-only` to apply/skip pending SQL, route through the legacy foundation-pinned release/activation bridge, replay roles/bootstrap/D1/D2, disable readiness or consume historical f162.

The existing workflow keeps provider authorization/delivery credentials out of `BE_MIGRATION_INPUTS` SQL execution and SQL input out of provider phases. Preserve serialized migration-before-deploy and exact-artifact consumption. Stop and reconcile durable receipts on unknown outcomes; a committed schema plus an unready predecessor requires the approved transition/recovery plan, not an automatic rerun.

### Later BE-only real acceptance and explicit stopping gates

After source/artifact admission, secure configuration, compatible additive transition and hosted callback/privacy proof, obtain a separate real-Etsy grant. An authenticated current Owner may use an approved private API/harness to create an invitation and explicitly start it, privately handing the returned authorization URL to the intended shop operator within its300-second attempt. The callback can complete BE work independently; the Owner explicitly reads local status and invokes the allowed four-field sync.

This is not an implemented public recipient confirmation GET page or the general FE table journey. Do not bypass origin/CSRF/platform/application protection, put the technical bearer into a browser, spoof Owner identity with a UUID, or expose invitation/token/code/state/authorization URLs in chat/logs. A usable protected private harness and consent-browser handoff must be approved before use. General link sharing/FE adoption stays deferred.

Current evidence stops at **reviewed source fix + development packaging/import proof**. Release-artifact admission, hosted schema/config/release, real-provider pass and overall FE/product acceptance remain separate unchecked gates; migration compatibility/readiness is not solved. T019 remains deferred operational prune; T020–T022/T024–T026 stay open. This closeout changes only plan.md, quickstart.md and release-preparation.json, checks document integrity/current source hashes only, and reruns no tests/build/runtime. Both packaging source hashes, original24/a925 identities and all public failure/output evidence remain unchanged. Source/docs ownership is returned to t151; STOP WRITES. No Git, provider/install/FE/shared-document or new reviewer action is authorized.

## Previous accepted source-review closeout — historical

**P2 resolution accepted; READY_FOR_OWNER_NEXT_LAYER.** Coordinator t151 accepted the exact fix hashes and t175's independent FIX-ONLY recheck, which found no further confirmed actionable finding in that scope. The original full review remains one confirmed P2, now resolved; operational prune remains deferred. T023 is complete for this BE increment. Existing runtime evidence and all failures below are historical actual results, not rerun during docs-only closeout.

## BE-first acceptance packet — FE deferred by owner

The owner prioritizes finishing BE before the Owner table/confirmation UI. This sequencing decision does not authorize Git publication, hosted migrations/deployment, real credential reads or provider calls. It does not reopen accepted app registration, roles/bootstrap/D1/D2. This documentation amendment follows the final reviewed snapshot; review-manifest.json remains an immutable closeout snapshot, not a hash assertion for these later planning edits. Source identity remains the reviewed24-file digest `4622d379a53e5090eff488ec80f68bc13f58e6162daa31340d70575102517498`.

### Reviewable release scope

Use only the existing `feat/etsy-connectivity` worktree/branch based on `a9b3d70ceff042b893fa06877eca197d3d31c06c`. The reviewed source inventory is the24 worker source/canonical paths in review-manifest.json plus the existing010 planning/evidence packet and manifest. Root manifests/lock, apps/web, feature006, shared docs/pointer, owner private files, main and other worktrees stay outside the packet. Exact staging/commit/publication must have its own grant; no merge or production deploy is implied by publishing this branch. Preserve the review record: original one P2 resolved by privilege removal, T019 operational prune deferred. Do not stage ignored node_modules/build or local metadata.

### Ordered BE gates independent of Owner UI

1. Obtain scoped publication permission for the reviewed branch packet. Verify exact source hashes and changed paths before staging; report the actual source commit after publication. No unreviewed source edits or needless test rerun.
2. Prepare a clean Linux immutable artifact from that published source using the existing001 release pipeline; verify source/config/migration/file identity and obtain exact-artifact approval before provider upload. Do not deploy this Darwin development build or use the retired bridge that rejects the additive010 target.
3. Under distinct runtime-configuration and release authority, supply existing app credentials/keyring through a reviewed owner-controlled secure channel; settle non-secret invitation/return origin, expected shop, invitation TTL, retention and key/backup policy. No secrets in chat or rereading owner originals. Verify the new additive010 migration transition is supported by the current release path before any SQL; do not redo committed foundation setup.
4. Authorize and execute only the new010 additive migration-before-deploy and exact-artifact release, with retained receipts, unknown-outcome reconciliation, exact callback HTTPS/access and log privacy verification. Existing D2 acceptance is a baseline, not010 acceptance. Keep recipient link exposure disabled until usable ingress is separately accepted.
5. Under an explicit real-Etsy acceptance grant, an authenticated Owner uses the existing private management API/operator harness to create an invitation and perform an explicit start; the authorization URL is handled privately, and the intended shop operator opens it to consent while its300-second attempt is valid. The registered BE callback commits independently; Owner explicitly reads local status and invokes the four-field sync. This manual operator/browser handoff needs an approved secure harness and hosted routing proof; it is not an already implemented shareable invitation page and must not be represented as the final member-link UX. Never bypass guards, spoof an Owner with a UUID, expose technical bearer in a browser, or share token/code/state in chat. If no approved harness is available, prepare/review it locally before real consent rather than improvising a public route.
6. Record exact real identity/shop/read outcomes separately from synthetic evidence. Refresh/reconnect/disconnect and owner Etsy Revoke are individually authorized lifecycle checks. BE acceptance can be recorded with FE deferred; do not close the overall feature T026 or claim FE/browser E2E from API/CLI proof.

Operational prune remains inaccessible and explicitly out of the usable BE connection capability until verifiable authority is designed; do not unblock it for release convenience. The reviewed connection/token code needs no new source edits merely because FE is deferred. Outstanding decisions/authorizations are release and live acceptance gates, not reasons to reinstall dependencies, replay setup or request app access again.

## Docs-only review closeout

Coordinator observed gpt-6-luna medium and actual REVIEW_MODEL_READY/UI model for t175. Reviewer ran no tests/builds and made no edits; no session UUID is inferred. Closeout verified documents, local links/fragments, fences, added-line whitespace/conflict markers through a non-Git diff check, and unchanged source/root hashes only. No runtime, generation, service/DB/Auth/provider/install/Git/FE or reviewer action occurred.

Checked tasks are T001–T018 and T023; T019–T022 and T024–T026 remain open. No authenticated operational prune pathway, FE/browser acceptance, hosted adoption or actual Etsy acceptance is claimed. Source/docs ownership is returned to t151 with STOP WRITES; ignored dependencies/build outputs remain for reproduction. Exact closeout document deltas, historical freeze identities and current source identities are recorded in review-manifest.json.

## Confirmed P2 correction — targeted evidence

Reviewer t175 reported one P2, confirmed by t151: app_operator could supply a known active Owner/workspace UUID to SECURITY DEFINER prune_etsy and obtain destructive work falsely attributed to that Owner. No authenticated purpose-bound approval existed. Coordinator accepted the least-scope fallback: revoke PUBLIC/app_operator/app_runtime execution in the new unapplied010 migration; retain the function ungranted and explicitly defer operational prune/T019. No authorized operational success pathway is claimed, no new identity/role/store was added, and all other frozen application behavior remains unchanged.

Commands used the same command-local Node24.22.1 PATH:

```sh
npm run migrations:generate --workspace @esty-admin/api
npm run typecheck --workspace @esty-admin/api
npm run build --workspace @esty-admin/api
NODE_OPTIONS=--test-name-pattern=prune.authority node apps/api/scripts/etsy-local-check.mjs
```

Generation succeeded in t17c, then typecheck exited2 because heterogeneous test tuples inferred an incompatible pg query overload; build/tests/resources did not start. Explicit nullable tuple typing fixed that compile error. t17d passed typecheck/build and targeted1/1 but reported pg's concurrent-query-on-one-client deprecation. Sequential before/after snapshots corrected the cause without suppressing the warning.

Final t17f exited0: typecheck, build including migration-manifest check, **targeted1/1** with zero failure/cancellation/skip and no recurrence of the warning. Real SQL checks deny EXECUTE for PUBLIC/runtime/operator, deny fourteen operator/runtime attempts with SQLSTATE42501 (known active Owner, repeated receipt, Member, foreign identity/workspace and valid-boundary/invalid/null policy inputs), preserve all seven inspected target/audit table contents and produce no etsy.prune audit row. An eligible expired invitation is present; the test cannot pass merely because there is nothing to prune. Apply/replay runs only in the fresh owned fixture. Provider requests:0.

The same terminal then ran a separate temporary emitted-module CLI smoke (no test runner): an actual Nest Owner invitation became an eligible expired row; app_operator's call with the known active Owner returned42501, the row remained, spoofed audit rows0 and provider calls0. Output PASS, operationalPrune=deferred. The temporary launcher reused the existing ownership/loopback/tmpfs/cleanup rules without changing the committed runner.

Cleanup reported success for t17d `esty-etsy-acdb07db692167f6`:32772 and t17f `esty-etsy-599e26d8d4614c42`:32773 / `esty-etsy-5159c39c156a3e37`:32774. Each used owned tmpfs and no shared volumes. Temporary smoke/launcher scratch was removed at freeze; existing dependencies/build output remain. No unrelated suite, FE/browser test, live provider/private/account/Git/deploy action or reviewer startup occurred. Earlier21/21 and regression/startup totals below are preserved historical evidence, not a fresh full-suite result or proof of authorized operational pruning.

## Historical initial dependency blocker — resolved by explicit grant

The2026-11-17 owner grant authorizes BE layers1–4 source/local work, not FE/browser/provider execution. The initial prerequisite check passed with command-local routing and no shared-pointer write. The assigned branch/HEAD matched the approved base;13 checklist items were checked and no extension configuration was present.

Before source changes, `node --version` returned `v26.10.0`. `test -x node_modules/.bin/tsc` exited1; both this worktree's `node_modules` and `apps/api/node_modules` are absent. `command -v node npm tsc docker` found Node/npm/Docker but no compiler. The selected `/opt/homebrew/opt/node@24/bin/node` path is absent. `docker version --format '{{.Server.Version}}'` returned `29.4.0`; no container was started or inspected for environment values.

Public path discovery found TypeScript and Nest package metadata in the separate original checkout, but those dependencies were not read, linked, copied or used. No install is authorized. The worker reported the missing local dependency/runtime prerequisite to t151 and stopped before Layer1 source/build/test/resource startup, as required by the grant. This is BLOCKED_DEPENDENCY_PREREQUISITE, not a configuration pass or READY_FOR_BE_ETSY_REVIEW. Coordinator must authorize an exact existing dependency/runtime binding or resolve the no-install gate before implementation can resume.

At this blocker checkpoint only plan.md, this guide and T001 were worker edits over the coordinator's nine-document dirty baseline. Those initial SHA-256 records are retained in review-manifest.json; the original temporary baseline file is removed at freeze. This historical checkpoint preceded all application changes and test passes.

### Dependency resolution and Layer1 actual checks

Coordinator subsequently authorized worktree-local macOS copy-on-write copies of only the original checkout's root/API dependency directories, with exact matching root/API manifests and lock. Initial unqualified `cp -cR` failed before copying because the tool's `cp` is not macOS BSD cp; explicit `/bin/cp -cR` then succeeded after both targets were again proven absent. No install, hardlink, original mutation or package version change occurred. All30 copied dependency symlinks resolve inside this worktree; workspace links point to this worktree's apps/api and apps/web. Three original/current manifest identities match. These ignored dependency copies belong to this worktree's local setup, not a production artifact.

The explicitly authorized existing binary `/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin/node` reports24.22.1. No npx invocation/cache discovery occurred. Subsequent commands use only its bin directory prepended to command-local PATH.

Layer1: `npm run build --workspace @esty-admin/api` exited0 (migration-manifest check current, TypeScript compilation passed); `node --test --test-name-pattern="Etsy configuration" apps/api/build/tests/config.test.js` passed1/1. A separate emitted-module invocation exercised disabled and partial-enabled configuration: no client when disabled and nondisclosing failure before transport when partial. No DB/Auth/provider socket was opened. This self-check allows continuation to the already-authorized Layer2; it is not hosted configuration attestation.

Safe operator setup: leave `ETSY_ENABLED=false` until FE ingress and hosted gates are approved. Under a later secure-injection grant, supply existing app identity/secret, exact callback, explicit approved HTTPS return/invitation origins, invitation TTL300–604800 seconds and operational retention300–2592000 seconds, active key ID and1–4 canonical base64url32-byte keys. These ranges are implementation bounds, not chosen owner policies. Do not pass secrets in argv/chat or overwrite original owner files. Runtime validates field names/categories without echoing values; disabling ignores unused Etsy credentials. No ping, consent, pruning or key retirement follows from validation. Live policy/origin/shop inputs remain OWNER_INPUT_PENDING.

## Final backend verification and failure disclosure

All runtime commands used the explicit Node24.22.1 binary above. No dependency installation or root manifest/lock mutation occurred; apps/api/package.json only adds scripts. Commands were run from this worktree:

```sh
export PATH=/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin:$PATH
node apps/api/scripts/codegen.mjs
npm run codegen:check --workspace @esty-admin/api
npm run typecheck --workspace @esty-admin/api
npm run test:etsy --workspace @esty-admin/api
node --test --test-name-pattern="strict application|retired activation bridge|runtime attestation|activation health" \
  apps/api/build/tests/config.test.js apps/api/build/tests/http.test.js
node --test apps/api/build/tests/startup.test.js
```

- t16h exited0: canonical/upstream/migration generation checks, typecheck/build, then20/20 Etsy cases,4/4 affected strict-schema regressions and6/6 startup cases. No claim that the entire existing suite was rerun successfully.
- After adding the actual stalled-TLS token timer and SQL-lock failure case, t16r ran `npm run test:etsy --workspace @esty-admin/api`: build0, **21/21 tests**, zero failed/cancelled/skipped. That new case completed in3598ms; it observed the real3s transport timeout, safe unknown state, one token submission, SQL503 dependency_unavailable and zero provider calls on the blocked local status path.
- t16n was a separate emitted-module CLI smoke, not a test-runner assertion: actual Nest HTTP + isolated PostgreSQL + verified synthetic TLS traversed unconnected → private invitation → explicit start303 → callback303 → active → four-field sync200 → local disconnect200. Output PASS, zero status provider requests, one token exchange, `realProvider:false`, `browser:false`; owned application/Auth/TLS sockets and disposable DB closed.
- Earlier Layer2 build/protocol tests and emitted crypto/metadata smoke passed. Exact pinned public-schema generation/check passed; an intentionally modified full-source input was rejected exit1. No runtime schema fetch or real provider request occurred.

Intermediate failures are retained: t15y first actual HTTP integration run exited1 (5 passed,8 failed,2 cancelled), because Node fetch did not preserve the intended Host test header; denied starts caused dependent failures and a gate timed out. The fixture switched to raw loopback HTTP with explicit Host; production guards were not weakened. t165 then passed11/11.

t168's expanded regression run exposed three old configuration tests and the final HTTP attestation test that still expected the immutable retired activation bridge to accept an additive migration. Other observed cases passed, but an early setup failure had bypassed teardown and left the owned test peer open; this worker stopped t168 and does not claim a clean exit. The four affected tests now use strict current-schema configuration or assert bridge refusal, with early registered teardown. Production schema-transition logic and the old bridge identity were not changed. The final focused4/4 and startup6/6 above are the actual repaired checks.

`test:etsy` builds once, then starts a nonce-named PostgreSQL17-alpine container from an already installed image with `--pull=never`, loopback-only ephemeral port, tmpfs storage and no shared volume. Its ownership-checked finally cleanup removes only its own container and synthetic0600 scratch. Two Nest workers use separate pools; synthetic Auth/TLS and the test transport deny unintended outbound requests. Migration apply/replay, plaintext absence, Owner/Member/foreign authority, lost acknowledgements, callback/refresh concurrency, disconnect fences, bounded prune and managed-Auth denial run on actual SQL/HTTP.

The separate manually owned `esty-etsy-dedbd044433d2211` fixture at loopback32769 was removed after smoke with exact container ID/ownership-label verification, then confirmed absent. Runner fixtures reported their own successful cleanup. No shared container, named volume, host DB or fixed shared port was reset. Temporary public-schema/TLS/credential/smoke files are removed at freeze; ignored worktree-local dependency copies and build output remain for reviewer reproduction. No agents, review process, scheduled watcher or background sync were started.

These checks do not exercise the FE confirmation page, browser storage/CSRF/manual table journey, hosting logs/platform routing, real Etsy grants/rotation/revoke, Supabase or hosted010 migration/release. Explicit live TTL/retention/origins/shop/key/backup policy inputs remain pending; no24-hour owner policy was adopted.

## 1. Documentation-only checks available now

From the existing repository root, safe helper invocations use only command-local routing:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/010-etsy-connectivity SPECIFY_FEATURE_NO_PERSIST=1 \
  bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

This checks file availability/path resolution, not project readiness, implementation or Git branch identity. The setup helpers' BRANCH label is the feature name. No create-new-feature/Git helper, pointer persistence, agent-context update or CLI-only Spec Kit extension is authorized. `.specify/extensions.yml` was absent at preparation; the final read-only check must confirm it remains absent or inspect any new hooks without bypassing ownership constraints.

Planning validation additionally checks FR/SC coverage, ordered unique unchecked task IDs, local document links/fragments, exact invitation/callback exceptions and no-secret protocol consistency and the recorded protected-public-file hashes. It does not run application tests/builds. See [the final handoff](owner-review-handoff.md) for actual results rather than treating this command example as execution evidence.

## 2. Future source/local prerequisites

Require explicit source, canonical/generated-file, isolated-resource and test ownership grants. Keep005–009 behavior and historical migration bytes; use the installed Node24 and existing dependency tree. Before any resource starts, confirm no competing lease, allocate a fresh nonce/ports/database and an owned0700 scratch directory, and reject collisions rather than adopt/evict resources. The released006 fixture is not a reusable authorization or dataset.

Synthetic credentials, keyring, IDs and provider responses must be newly generated within the owned fixture only; file handoffs0600, no symlinks or secret stdout. No owner private/auth/cache file, live Supabase, Etsy account or production key is needed for source/local proof. Grant only scoped application fixture SQL and provider-simulator actions. Preserve shared54322/55432/55433/3100/4317, owner preview3000 and named volumes; do not assume an unlisted port is free.

Use real Nest handlers and real PostgreSQL constraints/transactions, not mocked repository echoes. Provider transport is synthetic and isolated; deny unintended outbound network access. Reuse existing test helpers and a disjoint fresh fixture rather than a duplicate permanent suite for copied behavior. No root dependency install is implied.

## 3. Local HTTPS options — proposal, not a tunnel

Preferred local functional/E2E option: an owned loopback TLS terminator/test server with an ephemeral test CA/certificate, exact test-only redirect registration in the synthetic provider, and a disposable browser trust configuration limited to that certificate. Never install a CA globally, disable TLS verification in application code or rewrite real production callback registration. Record any test-only browser certificate bypass as a visual/transport limit, not real browser HTTPS trust proof.

An owner-approved public HTTPS staging callback on the existing hosting direction could later prove real browser reachability, but requires separate publication/deployment/provider registration/logging authorization. A separately approved tunnel is an alternative only after a new resource/security decision; **no tunnel is created or selected by this plan**. Real Etsy's authoritative HTTPS/exact-registration requirement is not waived by quickstart's HTTP localhost sample.

## 4. Future behavioral acceptance matrix

| Check | Procedure and observable result | Evidence boundary |
|---|---|---|
| Protocol | Inspect synthetic transport requests: fixed HTTPS host/path, x-api-key composite, complete bearer where scoped, form bodies, exact redirect, S256 and shops_r only | No live key/token request |
| Initiation | Current Owner creates a persisted invitation/private link; GET preview has no side effect; explicit recipient start creates one300s bound attempt; Member/foreign/extra scope management refuses | Recipient proof is limited to consent, not app admission or arbitrary public connect |
| Guard | Only exact start POST and GET callback use backend scoped transaction exceptions; recipient GET remains protected pending FE ownership. Neighboring paths, aliases and wrong methods retain the existing guard | Observe denial before provider work and unrelated DB access |
| State | Missing, duplicate, random, expired-at-boundary, consumed, wrong-workspace, cancelled and concurrently replayed state; at most one token POST | Real SQL claim/constraint, not an in-memory mutex |
| Authority | Disable/demote actor while consent is pending; change connection epoch or disconnect during getMe/getShop | No activation or returned stale metadata |
| Exchange | Correct code/verifier; wrong verifier; denied consent; malformed token fields/scopes; response truncation; lost HTTP response; candidate DB commit failure/ack loss | No second exchange after unknown submission; staged candidate is not active |
| Identity | Actual synthetic grant user differs from configured app registrant; getMe mismatch/no shop; Shop owner/shop mismatch; int64 precision and missing fields | Reject substituted/rounded IDs and public-only proof |
| Encryption | Inspect owned DB for plaintext absence; decrypt with correct purpose/key; wrong key ID, tag, nonce, row/workspace/version/AAD reject; key transition races with refresh | Never include ciphertext/key/token dumps in retained evidence |
| Metadata | Explicit Owner read obtains getMe then only the verified shop; output four business fields; Member/foreign/detached caller denied; extra provider fields discarded | No order/receipt/profile/email requests or cached/sample success |
| Refresh | Two independent application workers demand refresh for one version; one submission; rotated/unchanged returned refresh strings; missing fields; invalid_grant; response lost | Durable CAS/fence; no old-token replay after ambiguous outcome |
| Commit ambiguity | Lose DB commit acknowledgement after provider response; inspect exact receipt/version; simulate process loss after submission and late arrival after fence | Adopt only proven committed version; otherwise reconnect-required/unknown |
| Reconnect | New explicit same-account/shop intent; old callback/refresh/read races; different shop/account/workspace substitution | New epoch wins; no silent transfer |
| Disconnect/revoke | Local disconnect deletes usable secrets, cancels attempts and prevents late restoration; synthetic provider revocation denies next getMe | Local confirmation is not actual Etsy revocation |
| Rate/dependency |429 with valid/missing/invalid/long Retry-After; token and metadata timeouts; partial bodies; DB/Auth/key/config faults; cancellation | Bounded safe outcomes, durable cooldown, no hidden retry/background request |
| Privacy | Inspect actual browser URLs, redirects, payloads, HTML, storage and captured application/access logs with synthetic secrets | OAuth code/state only in necessary callback request; no credentials in success URL/reports; no real hosting guarantee |
| Regression/cleanup | Run affected existing guard/admission/migration tests once after fixes; original-history checksums stable; close only owned resources and verify retained evidence | No full-suite repetition without relevant reason; no shared-service reset |

Write deterministic permanent tests only for consumer-visible authorization, lifecycle, validation and concurrency risks. Use a throwaway actual HTTP/DB smoke for operational/wiring proof. Record failing-before/passing-after results and every intermediate failure rather than rebranding a targeted rerun as an entire clean suite.

## 5. Automated main journey

Through the existing browser harness under separately assigned FE test ownership: Owner creates/shares invitation → recipient explicitly starts → synthetic Etsy consent → HTTPS callback → callback commits with Owner page closed → explicit local Check status → explicit Sync shop info with exact projected read → explicit same-account reconnect → local disconnect → old/stale requests denied. Include denial and expired/replayed state recovery. Drive actual Nest and DB, not a fake final success page. The clean public landing is neutral; read the authoritative connection result through the approved privileged path.

This is an automated local journey for the planned later Owner UI, not real Etsy consent. Existing006 session conventions are reused only under a fresh separate FE source/test lease. Assert no periodic/focus polling, SSE/WebSocket or background sync; Check status has zero Etsy calls and callback completion does not require it. The010 journey must not modify/reuse006's old browser secrets, case records or retired resource lease.

## 6. Future actual Etsy/hosted acceptance

Only after source/local evidence, separately authorized review, publication/artifact approval,new010 additive migration/release authority, reusing supplied accepted D1/D2/Auth foundation without replay:

1. Reuse owner-confirmed **existing** registered/access-enabled app and resources. Bind exact non-secret app/target-shop configuration and callback/return origins through the later approved setup mechanism; do not request approval evidence again. Do not register a new app, assume a sandbox or infer Commercial eligibility from a key's existence.
2. Owner provisions the minimum server-only app credentials and versioned encryption keyring using an approved secure channel. Never send secrets through chat, argv, screenshots, reports or repository files; preserve originals and do not silently redo setup.
3. Verify exact `https://api.lovora.us/integrations/etsy/callback` registration, TLS/platform routing and query/body/header logging redaction under explicit hosted/provider authorization. Keep ordinary API bearer protection. If the platform cannot satisfy callback privacy/access, stop real consent and report the specific blocker.
4. If authorized, one server-side `GET /v3/application/openapi-ping` establishes only current application access/application_id. It does not prove user consent, shops_r or shop ownership.
5. Create one approved invitation row, open it without side effects, then explicitly start one bound OAuth attempt; intended account performs real Etsy consent. Observe the exact HTTPS callback, single exchange, encrypted candidate, getMe identity and matching getShop projection before claiming connection active. Record actual scopes/expiry and safe IDs/statuses, never raw code/state/token/link or provider bodies.
6. Under separate explicit lifecycle permission, exercise a real refresh and subsequent identity/read, same-account reconnect, local disconnect and owner-performed Etsy Revoke. Record actual returned rotation behavior and observed denial without extrapolating token reuse/grace or global revocation. A withheld lifecycle grant remains an open acceptance gate, not a simulated pass.
7. Record statuses, safe response fields, operation receipt IDs, target source/artifact identity and limits. Restore/stop only resources created under that grant; preserve shared services, actual shop data and historical evidence.

No order creation, receipt write, listing write, purchase, shipping, import, buyer data or supplier submission is a connectivity check. No owner-side external input or action above occurred in this source/local increment.

## 7. Evidence and owner review

Current evidence covers the scoped backend source/local checks above, not browser, real Etsy, hosted transport/logging, independent review or publication. Existing C2-01 stays the tracker; external updates need separate authority. [owner-review-handoff.md](owner-review-handoff.md) and review-manifest.json hold this frozen increment's receipt and identities, not another product tracker.

## 8. Layer-specific execution evidence

Layer1 was exercised with synthetic configuration only, before DB/provider resources: disabled, enabled-complete, malformed/partial fields, exact HTTPS origins, keyring/TTL bounds and nondisclosing errors. Actual commands are recorded above; no live ping or Owner UI claim follows.

Layer2 validates upstream acquisition identity/tool provenance, deterministic generated transport output and drift handling, plus runtime schema/header/form/precision/deadline/crypto behavior for selected operations. Broad generated types never authorize arbitrary application calls or expanded scopes.

Layers3–4 used fresh isolated resources and explicit synthetic policies to test authority, hash-only invitation storage, lost acknowledgements, concurrency, preview/start/callback fences, expiry, metadata and lifecycle. The matrix also retains future browser/hosted scenarios; it is not a blanket pass checklist. Layer5 needs FE ownership and browser proof; Layer6 needs separate hosted/provider grants.
