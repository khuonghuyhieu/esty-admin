# Implementation plan: Connectivity foundation

Updated: 2026-10-30 · Actual branch: `main` · [Spec](spec.md) · [Tasks](tasks.md) · [Validation guide](quickstart.md)

Status: scoped compatibility review accepted. ONE independent gpt-6-luna reviewer at `/root/mode_review` confirmed runtime readiness and completed read-only source/test/deployment-contract/plan review with no confirmed actionable correctness, security, regression or test gaps. No reviewer tests/build/edits and no further source fix or suite rerun are needed. Await the explicit current serial Git/index/push receipt before any Git operation. Existing OWNER HOSTED START then covers exact three-file publication, a new clean published Linux artifact and scoped real release execution; old artifact2ad2 remains stale. README/PROJECT_STATE lease was returned unused; only feature001 evidence may change until renewed.

## Hosted deployment-file compatibility prerequisite — 2026-10-30

### Authority and source-first decision

The owner authorized the existing-project minimal Supabase foundation migration, protected exact-prebuilt Vercel release and safe hosted checks, including necessary scoped correctness fixes. The first gate is resolving GETv6 file evidence BEFORE any migration. Only apps/api and feature001 are source-write scope. Private configurations may later be consumed nondisclosing through release tools only; no private/auth/cache read, SQL, provider upload/deployment or Git mutation is part of this source prerequisite. Preserve owner-completed target/TLS/rights/migration-status/project/environment/domain preflights without repeating them. Counts60/9 are not capacity proof. A fresh FE PAUSE/NO-INFLIGHT receipt permits BE-only shared documentation, not FE source, dependencies or browser connectivity.

### Authoritative contract and minimal correction

- [Official endpoint documentation](https://vercel.com/docs/rest-api/deployments/list-deployment-files) shows `"mode": "123"` in its JSON example, while its response schema describes `mode` as a number indicating file type and permissions.
- [Current official OpenAPI](https://vercel.com/openapi.json), GET `/v6/deployments/{id}/files`, resolves to `FileTree[]` with `mode:number`, required mode/name/type, optional string uid and recursive directory children. Retrieved document SHA-256: `d307b1d2590addf7814c891dde026140d84d7bb2e9e9868adfdeebe6d64f0765`.
- The [upstream SDK FileTree model](https://github.com/vercel/sdk/blob/main/src/models/filetree.ts) uses `mode: types.number()`. Its [numeric inbound primitive](https://github.com/vercel/sdk/blob/main/src/types/primitives.ts) explicitly converts strings with `Number(x)`. This establishes numeric-string interoperability, not octal interpretation or permission-bit-only equality. The SDK also tolerates other coercions that this release verifier must NOT inherit.
- Preserve numeric integer modes and accept only canonical unsigned decimal strings, bounded to the full16-bit POSIX mode range0–65535. Compare the resulting complete value exactly with `0o100000 | expected.mode`; never strip file-type/special bits, guess octal/hex, trim whitespace, parse prefixes or default missing values. Reject fractions, signs, exponent syntax, leading-zero strings, overflow, arrays/objects/null/booleans and any changed full mode.
- Leave rooted paths, entry type, exact SHA-1 uid equality, duplicate/missing/extra-file rejection, artifact verification, project/deployment/alias binding and migration-before-deploy serialization unchanged. Official uid documentation only calls it a unique file identifier; the actual service's path/root/uid behavior remains a fail-closed provider gate, not inferred proof. No path rebasing, opaque-uid substitution or missing-evidence fallback is authorized.

The correction maps existing FR-017/020 and SC-010 to `apps/api/scripts/vercel-deploy.ts` and `apps/api/tests/release.test.ts`; no new tracker/task IDs or dependency are needed. Extend the existing adapter suite for documented decimal strings and malformed/full-mode/path/type/uid evidence. Run affected compilation/regressions and a throwaway real-adapter loopback transport smoke, without credentials, database access or live provider requests. Stop for ONE coordinator Luna review. Because the adapter is a captured source input, the old Linux artifact becomes stale for this correction; only subsequently reviewed/published exact source and a new clean Linux artifact may proceed, under a coordinated serial Git lease.

Public schema/upstream evidence is retained at `/private/var/folders/4h/l740s8vn7j543mbxnnjwnw200000gn/T/esty-file-evidence-yr8kavro`. FileTree source SHA-256: `1109fcc5a2011e8355ed5cec9a70e6a09fa5eaee0291f206c98594899a3621d1`; numeric primitive SHA-256: `6cdd660fd38a8329710176df9501358770425f61ca40d1bface7c496aa27b47c`.

### Actual correction and verification

`fileMode` accepts only integer numbers0–65535 or at-most-five-character numeric strings whose decimal conversion round-trips exactly; the unchanged comparison then requires the complete expected regular-file POSIX value. No bitwise conversion/masking of untrusted input, parser default, permission-only equality or path/uid relaxation was introduced. Call signatures and release caller remain unchanged. LSP reported no language server; scoped references confirmed the release entrypoint and existing adapter suite.

The host default Node was26.10.0, so it was not used for behavioral verification. Reused the already-verified immutable official Linux/amd64 Node24.22.1 image and existing public Linux bootstrap dependencies read-only; no install or native build. Only enumerated public source inputs and the two relevant test/fixture files were copied into a disposable checks directory, with empty HOME/Docker config, read-only container rootfs, dropped capabilities and `--network none`. No host repository, private config, auth cache, DB stack or socket was mounted.

Commands inside that isolated copied source:

```sh
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
node --test --test-name-pattern='canonical decimal provider modes' apps/api/build/tests/release.test.js
# Apply the source correction, recopy only that source, then:
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
node --test apps/api/build/tests/release.test.js
```

- Before correction: compilation exit0; the new documented-decimal-mode regression failed0pass/1fail with `Provider artifact evidence differs.`.
- After correction: compilation exit0; affected release suite **47/47**, exit0. Canonical decimal evidence reaches READY and same-deployment smoke;27 malformed/overflow/changed-full-mode cases and7 identity/root/path/type/duplicate/missing/extra cases reject. Existing numeric evidence, source/identity/settings/alias/HTTP/cancellation/upload-mutation checks remain passing. No unrelated/full integration suite was rerun.
- A throwaway script exercised the compiled corrected adapter over actual HTTP to its own127.0.0.1 server, using the historical sealed artifact read-only solely as public payload evidence. It sent1012 verified payloads to loopback, made one simulated create and five file attestations across1025 local requests. Canonical strings passed; noncanonical string, changed full mode, uid mismatch and root rebasing each rejected on the same simulated deployment without another create. Node24.22.1/linux/x64 were asserted. External provider requests0; SQL0; no new artifact build or old-artifact approval for corrected source.
- Initial throwaway smoke failed only its cleanup assertion: two socket close events had not yet fired after server-close/setImmediate. The harness was corrected to await each owned socket's actual close event; rerun exit0, retained sockets0. Repository source/tests did not change between smoke attempts. Both logs are preserved, not rewritten as a first-attempt pass.

Retained evidence includes `official-list-deployment-files.json`, `official-file-tree.json`, upstream source snapshots, exact Docker argv/environment, `compile-before.log`, `regression-before.log`, `compile-after.log`, `release-regressions-after.log`, both adapter-smoke logs, `adapter-smoke-result.json` and `review-handoff.json`. Corrected source SHA-256: `fc84c604daeb007ac0ce040572bfff6dc698b914c3ceabf9e12b83de7f8af54a`; affected test SHA-256: `0e3c3a78016f3c654bf41a56bb207b64977e6cab237030b2555f859db98efe39`. All owned check containers completed with `--rm`; owned HTTP sockets closed and the new disposable copied-source/compiled-output/smoke-harness tree was removed after retaining results. The existing public Linux artifact/snapshot/evidence and both DB volumes remain untouched.

### Review gate and external limits

The coordinator reports ONE independent gpt-6-luna review at `/root/mode_review`, with runtime readiness confirmed and read-only source/test/deployment-contract/plan inspection: no confirmed actionable correctness, security, regression or test gaps. The reviewer ran no tests/build and made no edits. This actual review identity is retained without inventing a CLI session UUID. Review is accepted; no source correction or duplicate affected-suite run is needed. This new compatibility review does not rewrite the earlier one-P2 review/fix-only acceptance. Only the adapter, existing release test and this plan are the authorized publication set. README/PROJECT_STATE remain untouched and their prior fresh docs lease was explicitly returned.

No migration, private-file consumption, provider account/project/deployment call, lock/report deletion, Git publication, replacement artifact build or DNS operation occurred. Owner preflights are retained as owner evidence, not repeated. Real deployment file path/root/uid compatibility must still be reconciled fail-closed; the local synthetic server does not establish provider behavior. After review, coordinate the serial Git lease and exact published clean-source Linux rebuild, reconcile persisted release locks/reports/current deployment before any retry, and continue the owner's authorized minimal migration/protected-prebuilt/same-alias/TLS/access/CORS workflow without a new START. Provider10s/cancellation enforcement and intended-use eligibility remain unproven. FE fixtures still have no API client; T014–T016 and full UI→API→DB acceptance remain open.

Publication handoff: the coordinator requested a fresh serial Git/index/push lease from pV; no Git operation is permitted until its explicit current receipt. Independent preparation may inspect public source/release contracts and record feature001 evidence without source edits or runtime reruns. After receipt, publish only the exact reviewed three files, export the actual published commit/tree/main/origin-main into a clean minimal public snapshot and reuse the verified Linux/amd64 image/pipeline. Never reset/stash the host documentation, fabricate clean Git identity, deploy the stale artifact or silently rebuild source through the provider. Preserve release locks/reports and known committed DB outcomes; do not blindly retry or delete a lock. Private operator/deploy files are consumed only by release tools, narrowly and read-only, with no values in argv/output/logs.

## Published Linux release artifact — 2026-10-30

### Authority and exact source capture

The owner authorized only the unchanged pinned pipeline in explicit Docker linux/amd64 emulation after publication. Coordinator-reported host main/origin-main cleanliness was not redundantly rechecked. The necessary read-only identity export confirmed HEAD/main/origin-main `4e2a6ae4dacad3fb5e8c99009a195f04d1a8bd5e`, tree `1e61dc9cc2ef3962a6eeb6b15377c86e17542fbc`, public origin `https://github.com/khuonghuyhieu/esty-admin`.

Public evidence root: `/private/var/folders/4h/l740s8vn7j543mbxnnjwnw200000gn/T/esty-linux-release-mw0fqmt3`. An authorized ephemeral sparse snapshot at `published/` contains the actual published commit, all tree objects and only49 enumerated build-input blobs;111 actual objects were exported, with a shallow boundary at the real commit. Actual main/origin-main refs and a complete tree-derived index were created only in this disposable snapshot. Non-build paths are absent through explicit sparse-checkout patterns, not fabricated clean labels or hidden changes to selected files. Snapshot index/tree/refs/clean status and every selected blob/executable mode were verified; captured bytes matched the host's public inputs before build. No original Git index/HEAD/refs/source mutation, Git network operation, persistent worktree/branch, whole-repo mount, host node_modules or private/auth metadata copy occurred.

The source manifest SHA-256 is `25d4b12be69144f0cb8f369e170135f55be845cbb49b93e058a8baa6ca025702`. It equals the earlier P2-fixed public input digest because those build inputs are unchanged, but this is a new, genuinely built Linux release artifact with the published revision/tree and Linux Node identity; the old Darwin artifact was not relabeled. Sealed07 remains stale and p2-fix01 remains development-only.

### Verified image and tooling

| Identity | Observed value |
| --- | --- |
| Official image selection | `docker.io/library/node:24.22.1-bookworm`, explicit `--platform linux/amd64` |
| Immutable image index | `sha256:d862bb5d082c5ae0210ac07e8c0344cb8cf7bef6d78e9b8c50c179da923108ea` |
| Selected amd64 manifest/image ID | `sha256:0925478b811e8890f5508ad2a75135933310effd45492696ecf7c111c8339d02` |
| Image config digest | `sha256:8279a176db0ac2d89d4d3ef16063c1990ee00ea98d81e0937ed38117feab7fed` |
| Actual process | `process.platform=linux`, `process.arch=x64`, Node `24.22.1`, `/usr/local/bin/node` |
| Node binary SHA-256 | `e32e2d16081cf644f88392934288086e7662529d0d43277c34f7aad2207cfafb` |
| npm / Git inside image | `11.19.1` / `2.39.5` |
| Vercel CLI | `65.4.0`, own-package digest `c92fd2a7440a10ae025f4ae3ccb61bb3c8c442b8dc10141bfeb1a9cdfb3d34b4` |
| NestJS builder | `23.0.0`, own-package digest `7897865a1a8d4ce2bfd851aae6d8ace5f15df92cfd049112c90bc892807d4a59` |
| Node builder | `28.0.0`, own-package digest `93a8931f19c2e1ef32c3f152460787425c2beae74469c42dd7401fb2805129a5` |
| build-utils | `15.1.0`, own-package digest `2f0bb9c7dfa069f836ba9e34d26c1ef0437d4032dd53a0b8daa170b6a393d2d3` |

The image's official multi-platform index and selected amd64 manifest/config were inspected and retained. A network-none probe proved the actual Node/platform/binary identity and clean source snapshot before installing tools. The Docker CLI used a newly empty public config/HOME and explicit local socket, not cached authentication/configuration. Containers used a read-only root filesystem, dropped capabilities/no-new-privileges and the host UID for the public mounts. Source mounted read-only at `/published`; only new public output storage mounted writable at `/work`. No company/system profile changes.

Public tools were installed only in `/work/tools`, and bootstrap API build dependencies only in `/work/bootstrap`; both installations used empty distinct npm configs, a disposable cache and `--ignore-scripts --no-audit --no-fund`. The actual unchanged native pipeline retained its own locked workspace install command. Original official npm SHA-512 tarball pins and the corrected complete-own-package gate ran before native execution and were revalidated afterward. Linux-compatible dependencies were downloaded fresh; the Darwin CLI/cache was not reused or patched.

### Actual build commands and results

Exact host/container argv and whitelisted environment are retained in `docker-build-command.json`; `work/build-release.mjs` is the public orchestration harness, not repository source. The host pulled the official tag with `docker --config <new-empty-public-config> --host unix:///var/run/docker.sock pull --platform linux/amd64 docker.io/library/node:24.22.1-bookworm`, then ran its immutable index reference with explicit linux/amd64 and `--pull never`. Inside that image:

```sh
npm install --prefix /work/tools --ignore-scripts --no-audit --no-fund --save-exact \
  vercel@65.4.0 @vercel/nestjs@23.0.0 @vercel/node@28.0.0 @vercel/build-utils@15.1.0
# cwd: /work/bootstrap, copied only from the enumerated public snapshot
npm ci --workspace=@esty-admin/api --include-workspace-root=false --ignore-scripts --no-audit --no-fund
node node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
# cwd: /work; unchanged published pipeline
/usr/local/bin/node /work/bootstrap/apps/api/build/scripts/build-artifact.js \
  --repository /published --work /work/native --destination /work/sealed \
  --cli /work/tools/node_modules/vercel/dist/vc.js --mode release
```

All four stages exited0:286 public tool packages,193 bootstrap packages, TypeScript5.9.3 compilation, then the unchanged native CLI/operator staging/sealing pipeline. The native install added193 packages and reported6 high-severity advisories; no audit-fix, dependency change or unrelated suite was run. The source/config/platform guards and duration/cancellation controls were not relaxed.

Two setup attempts are disclosed: unqualified image inspection returned the multi-platform index with empty OS/architecture, so its platform assertion failed; explicit `image inspect --platform linux/amd64` resolved the selected descriptor. Running the bare child manifest digest as an image name exited125 (`No such image`); using the already-pulled immutable index reference with explicit linux/amd64 succeeded. Neither failure executed a native build or caused an arm64 fallback.

### Sealed release artifact and independent revalidation

**Host absolute artifact path:** `/private/var/folders/4h/l740s8vn7j543mbxnnjwnw200000gn/T/esty-linux-release-mw0fqmt3/work/sealed`

- Artifact/provenance SHA-256: `2ad2c32c627e20f4aed3f9bbe439811c8671d2d616aa09db9b70076dbf5415ed`.
- Published commit/tree: `4e2a6ae4dacad3fb5e8c99009a195f04d1a8bd5e` / `1e61dc9cc2ef3962a6eeb6b15377c86e17542fbc`.
- Source mode/platform: **release / linux / x64**,49 public source files; source digest `25d4b12be69144f0cb8f369e170135f55be845cbb49b93e058a8baa6ca025702`.
- Migration manifest digest: `243818c0ebe11bc6ea8b12b3224810c88e888b18ec30dd5bfe58394f1f209496`; sole migration `1792972800000-foundation`, SHA-256 `c3374f370c42d8543bde5771d4cddd91990e643e8969fcaf4bf1c5ffe3e4e851`.
- Raw runtime inventory digest: `74a3330a96e50fb0086b2002f47f062b44b215b0d13f3d04815352dd74c0fda5`;1011 raw runtime files,7200 sealed files/895 directories.
- Final function: canonical `apps/api/src/main.js`, `nodejs24.x`, `architecture=x86_64`, empty environment, `maxDuration=10`, `supportsCancellation=true`; the original operator/migration closure remains separate.

`node /work/verify-release.mjs` ran in the same pinned linux/amd64 image with `--network none` before and after native behavior checks, both exit0. It called unchanged `verifyArtifact(..., release:true)`/`assertSourceFiles`, verified commit/tree/origin-main/clean snapshot and all49 source blobs/executable modes directly against the real commit, checked migrations/config/node binary, and reran complete published-versus-installed own-package verification for all four tools. Host SHA-256 of the retained provenance matched. The before/after logs and `work/release-verification.json` preserve exact results.

### Native emitted-handler checks — no database or external network

The smoke container used `--network none`, no published ports/host networking/socket bridge, and mounted only the sealed artifact read-only at `/artifact` plus its owned public smoke directory at `/smoke`. No source tree, bootstrap node_modules, existing DB stack/volume, owner HOME/auth/env or private file was mounted. Node24.22.1/linux/x64 was asserted again. The actual emitted `main.js` ran outside source/dependency roots with synthetic credentials and the real hosted config/guard/TLS policy. A test-only preload remapped only the reviewed pg transport host/port to an owned127.0.0.1 silent TCP peer before connect, retained TLS verification and rejected non-loopback sockets; its rejection self-check passed without sending traffic.

The actual smoke exited0:

- Missing/malformed/wrong bearer:401 for all3; allowed OPTIONS204 with exact origin, denied-origin OPTIONS401, authorized live200 with `{status:"ok"}` and unknown404, all with zero DB connection attempts.
- Authorized readiness against the silent loopback peer:503/`database_timeout` in1034ms. No peer response, PostgreSQL authentication or SQL exchange occurred.
- Client disconnect during pending acquisition: owned connection released within1010ms; subsequent live200 and zero retained peer sockets.
- SIGTERM during pending acquisition: process exited by SIGTERM within1041ms, zero retained peer sockets; no forced kill.
- Exactly3 owned synthetic connections exchanged only the8-byte PostgreSQL SSLRequest. No successful ready200, real DB/TLS/auth/SQL, migration, or provider worker cancellation/10-second enforcement is claimed.

Exact smoke argv/mounts are in `docker-native-smoke-command.json`; result/log/guard events are under `work/smoke/`. This is an unchanged-artifact smoke, not a rerun of config/HTTP/integration/full suites. Original Luna ONE-P2 review, narrow fix31/31/coordinator acceptance, earlier native failures and9 Darwin source-map path-only differences remain unchanged below.

### Retention, after-build documentation and remaining gates

All named owned containers were absent after `--rm` completion; the native child exited and synthetic sockets closed. Both shared database stacks/volumes, host source/index/refs, FE previews/root dependencies/pointer and owner Production-env/apiDNS remain untouched. Retain the immutable artifact and public evidence root: `source-capture.json`, public object pack/snapshot, image descriptors/platform evidence, exact Docker argv, public install/build logs, `work/native/native-build.log`, `work/native/operator-build.log`, raw `work/native/source/.vercel/output`, verification/smoke results and `handoff-evidence.json`. Public temporary tooling/harnesses are retained for reproducibility; no shared cache/image/volume prune or unrelated cleanup.

This plan-only evidence edit occurs AFTER exact clean published capture/build/checks and makes the host worktree dirty. It does not change the sealed artifact's source commit/tree or authorize treating the dirty host checkout as clean; any later release must independently satisfy the existing exact approved-source gate. No README/PROJECT_STATE/governance/task/source edit or publication occurs in this increment.

The next gate is **owner approval of this exact Linux artifact digest**, not deployment. Real provider prebuilt/file attestation/current settings, worker duration/cancellation enforcement and Hobby intended-use eligibility remain unverified. Actual Supabase target preflight/migration/release and api.lovora.us same-deployment alias/TLS/safe HTTP still require separate authorization; owner-reported conversion/Production variables/apiDNS must not be repeated or exposed. T054/hosted/FE/historical unfulfilled task gates remain unchanged. No provider/account/API/auth/env pull/upload/deploy, real SQL, DNS/billing/trial/payment or new reviewer was performed.


## T060 documentation closeout — 2026-10-30

Ten existing documents checked; nine updated: AGENTS.md, specs/architecture.md, README.md, PROJECT_STATE.md and feature001 spec.md/plan.md/tasks.md/research.md/quickstart.md. data-model.md is intentionally unchanged: review resolution changes no persistence/artifact contract. Only T059/T060 checkbox states changed; all68 IDs remain,55 completed/13 pending. The other66 task rows are byte-identical, including T054, historical unfulfilled native, hosted and FE gates.

Docs-only checks: all55 local file-link targets exist;19 in-scope heading fragments checked,16 resolve and3 pre-existing historical fragment mismatches remain. They are the unchanged `#source-local-execution--2026-10-28` references in README/PROJECT_STATE/quickstart versus the `Source/local execution` heading. The initial strict fragment check flagged them; baseline comparison proved all three predate this closeout. They are disclosed, not reported as a clean all-links pass or silently rewritten inside preserved history. No newly introduced fragment failure. Code fences, new-line whitespace, merge markers, task IDs/other checkmarks, single seven-item owner checklist and protected historical/FE blocks pass.

README.md:399 owns the sole remaining owner checklist. Governance was appended; prior architecture, plan execution/failure history, PROJECT_STATE historical suffix and README FE-prefix/dated-native-failure/domain blocks remain byte-identical. Current wording separates original one-P2 review, OMP fix/checks and coordinator-only acceptance; preserves stale07, p2-fix01 development provenance and9 source-map path-only differences; and treats conversion/Production-env/api-DNS as owner reports to verify later, not repeat or disclose. No source/runtime/build/test/install/private/provider/Git action or new reviewer in closeout. No new scratch files or processes were created; earlier retained public evidence remains untouched.


## T059 P2 fix verification — 2026-10-30

- Coordinator confirmed runtime gpt-6-luna REVIEW_MODEL_READY and one scoped read-only review, exit0, session `01a18a7c-b31c-7121-ae83-7b4e5ea90b9b`; original result retained at `/private/tmp/esty-artifact-review-result.txt`. **P2:** the published-file subset check accepted additional installed package-owned files. This result is retained, not relabeled as no findings or superseded by a new full review.
- Narrow source change: `scripts/build-artifact.ts` delegates the pre-execution gate to `verifyToolPackage`. It inventories both package trees and compares complete file and directory inventories, path/type/mode/size and SHA-256/SHA-1 bytes, using existing safe inventory/read primitives. Missing/extra/changed files, executable-mode changes, symlinks, hardlinks and special files fail before tool evidence returns or the native command is recorded/executed. No installed tool is modified.
- The exact four pinned tarballs contain no root `node_modules`. Only the installed package's real, non-symlink root `node_modules` directory is an explicitly separate dependency-resolution boundary; it is not represented as verified own-package content. Its type/special mode is checked, including dangling symlinks. No nested `dist/node_modules`, arbitrary basename or additional file is excluded. Unexpected published root `node_modules` fails closed. This does not assert complete transitive dependency integrity.
- Focused regression in existing `tests/artifact.test.ts`: the unchanged verification logic was extracted first; the new package-only command produced6 pass/9 fail (8 failing subcases plus their parent), including extra module/executable acceptance. After correction, compilation exited0 and the affected artifact/package file passed31/31, including unchanged synthetic pinned-version content, separate dependencies, missing/changed/symlink inputs, executable/special modes, nested boundaries and extra directories. No config/HTTP/integration/release/full-suite repeat.
- Actual negative build-driver smoke copied only the public CLI package into a new owned temporary directory and added one synthetic executable module. The driver exited1 with `Installed public tool own-package inventory differs: vercel`; `invocation.json`, `native-build.log` and sealed `provenance.json` did not exist. The outer smoke exited0 and removed the copied-package/work directory. No cache mutation or native tool execution occurred in this rejection path.
- Fresh unchanged-upstream native build and final sealing exited0 using `/private/tmp/esty-artifact-native-p2-fix-01`; final artifact `/private/tmp/esty-artifact-sealed-p2-fix-01`, SHA-256 `daa5921286a680a878b7101589e206075ef2e60d6744f89cc8c3ab89d84234af`; source digest `25d4b12be69144f0cb8f369e170135f55be845cbb49b93e058a8baa6ca025702`; base tree `7365fd1f90488fa7ce1a951d2b9de97d2074434d`. Node24.22.1/npm11.19.1, Darwin/arm64 development only,7200 sealed files/1011 raw runtime files. All four public pinned packages passed complete own-package verification before native execution. Artifact verification/current-source binding and final main.js/duration10/cancellation controls passed.
- Sealed07 remains intact as historical HTTP evidence but fails current-source matching after this source/test correction. A throwaway comparison initially asserted identical raw digests and failed: the new raw digest is `b83936eb10d4c3752817ab8716a7c0dcd60d2c5b80fd1ff56171f6d5d082bc7f`. Targeted inspection explained exactly9 `.js.map` changes, solely their `sources` absolute work-directory prefix; the other1002 raw file records are identical and no path is missing/added. No source-map normalization or runtime change was introduced to hide that difference. New native HTTP/SQL was deliberately not rerun.
- Regression fixtures and the negative-smoke copy were removed; owned subprocesses exited. Refreshed public build logs/packages/raw output and the sealed development artifact are retained for coordinator inspection. Earlier failed attempts, all original task checkmarks, FE/history blocks, shared services/volumes and existing dependency/cache files remain unchanged. No private/provider/SQL/deploy/DNS operation, repository install, Git mutation or reviewer launch occurred.
- Coordinator accepted this P2 correction through read-only inspection of `verifyToolPackage`35–46, caller67 before invocation, artifact regression70–105 and existing inventory/read primitives. Acceptance explicitly used the reported6pass/9fail→31/31, negative driver rejection and refreshed native/seal evidence; the coordinator ran no new test/build or independent review. This resolves the original finding without rewriting the original review. T059 is complete; no unresolved confirmed findings remain in the scoped review.

Actual focused commands used cached Node24.22.1 (`$NODE24` is the executable recorded in the earlier evidence):

```sh
"$NODE24" node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
# Before the fix:6 pass/9 fail; preserved as regression evidence.
"$NODE24" --test --test-name-pattern='tool package integrity' apps/api/build/tests/artifact.test.js
# After the fix and recompilation:31/31 passed.
"$NODE24" --test apps/api/build/tests/artifact.test.js
"$NODE24" apps/api/build/scripts/build-artifact.js \
  --repository /Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin \
  --work /private/tmp/esty-artifact-native-p2-fix-01 \
  --destination /private/tmp/esty-artifact-sealed-p2-fix-01 \
  --cli /Users/khuonghuyhieu/Documents/Project/e-commerce/esty-admin/.openai/cloud-tools/vercel/node_modules/vercel/dist/vc.js \
  --mode development
```

The negative smoke used the same driver with its synthetic copied `vercel/dist/vc.js` and new work/destination paths; the in-memory Node harness asserted rejection before invocation/provenance then cleaned its owned directory. Separate in-memory artifact verification asserted current source binding and stale07 rejection; the source-map-only diagnostic resolved the failed raw-equality assumption without changing artifacts. Real provider attestation/settings/worker enforcement, clean Linux release provenance, hosted/domain/FE acceptance and Hobby eligibility remain external gates. Coordinator inspection of this finding is now complete; no additional independent review was started.



## Expanded native artifact and prebuilt design — owner-approved

### Contracts and boundaries

Retain NestJS12.2.0, Node24.22.1, CLI65.4.0 and its unchanged @vercel/nestjs23.0.0/@vercel/node28.0.0 builders. No new runtime dependency, upstream patch, legacy builds, dummy function, framework switch, experimental flag or static cancellation export. Source owns the orchestration and final Build Output API v3 assembly. Existing vercel.json remains the authoritative duration10/cancellation/Git-disable configuration; omit its unsupported functions field only from the isolated upstream builder input and record that transformation. Raw upstream output is evidence, never directly deployable.

Canonical bootstrap: src/main.ts directly uses NestFactory to create the configured application module, applies the existing bearer/CORS composition, listens, and enables safe owned-resource shutdown. src/app.ts owns module/configuration composition without masquerading as a detected native bootstrap. Existing test helpers use the same module/composition; migrate every factory caller, keep transport/application/adapters and the one API contract unchanged. Preserve attachDatabasePool, exact verified Session TLS, hosted max2/local4, all existing deadlines and cancellation.

### Source and artifact construction

Versioned scripts/artifact.ts and scripts/build-artifact.ts use existing Node APIs and public tool code, with an API-workspace entrypoint only. Build requires an explicit destination outside the repository and a new isolated work directory. Copy only enumerated public build inputs (root package/lock, API source/scripts/tests/config/migrations/package/tsconfig/vercel config and the sole contract); never traverse owner .openai/private/auth stores or copy .env/.npmrc. Recheck source contents after capture/build. Git reads, if used by the future source verifier, are read-only; tests use existing archive/synthetic fixtures, never temporary Git commits/indexes.

Tool integrity: use the existing exact pins, not a dependency update. Record official npm SHA-512 tarball integrity for CLI65.4.0/NestJS-builder23.0.0/Node-builder28.0.0/build-utils15.1.0 and compare complete published versus installed own-package inventories, bytes and metadata before tool execution/provenance success. Only a validated installed root node_modules directory is a separately resolved dependency boundary; no nested path or arbitrary file exclusion. Any extra/missing/unsafe/version/content/mode mismatch fails. The supported CLI JavaScript launcher opt-out of the native binary may be used to keep executed CLI code within this verified package; it is not an experimental backend flag. Public tarball reads/extraction remain confined to the isolated work directory.

Source provenance records the approved base revision and Git tree, a sorted file/mode/content manifest and its digest. Development overlays record their actual content separately and are explicitly non-releasable; they are never labeled clean committed source. Future published mode requires exact clean main/source/tree matching the approved published revision, verified again by the release gate. The source config and immutable migration-name/checksum manifest are independently bound.

Run the unchanged native CLI with --prod --non-interactive --standalone, empty HOME/auth/npm configuration and a zero-byte production env file. Public project metadata is the verified relevant subset (project prj_uITHKLUGGE98VxrEcs5FoktBbcls, team team_k2Hk4wx5XAb9Mgc6lP5AjVhf, scope khuonghuyhieu0705s-projects, apps/api/nestjs/Node24); it is not a full genuine pull. No --yes/pull/env pull/authenticated launcher. Record exact tool/builder versions and content integrity, Node/OS/architecture, effective builder input and raw runtime-file manifest. Preserve raw diagnostics separately from the sealed final output. Native dependencies/platform compatibility remain explicit: development host artifacts are not implicitly deployable; published release requires the reviewed Linux build platform and matching function architecture.

The isolated project metadata overrides only the public-copy install command with `npm ci --workspace=@esty-admin/api --include-workspace-root=false`; no Vercel project setting changes. npm user/global configs are separate empty files, telemetry is disabled, and CLI65.4.0's actual CLI-relative bundled public builder packages are compared with pinned official tarballs before execution. The application `functions` config is restored in the public source copy before source-digest revalidation; raw output and invocation evidence stay separate.

Validate upstream output before assembly: exactly one index.func, expected main.js handler and NestJS/Node24 metadata, supported known route shape, empty function environment, no external filePathMap, no extra functions/static/private files and a self-contained dependency/manifest closure. Reject unexpected shapes; do not blindly add controls to arbitrary output. Copy only validated runtime assets into the final artifact, emit the canonical catch-all function route preserving request paths, and explicitly set maxDuration10/supportsCancellation=true on that function. Stage the existing operator/migration assets from the same captured source separately; never upload operator assets or secrets.

Seal a canonical provenance.json with source/config/migration/tool/raw-output evidence and every final/operator file's relative path, type, mode, size, SHA-256 and upload SHA-1. Its SHA-256 is the independently approved artifact identity. Normalize safe read-only file/directory modes; reject traversal, duplicate/case-colliding paths, symlinks/special files, missing/extra files, oversized input and forbidden private/config/environment paths. Require exact target/project/team/Node/platform. Revalidation checks bytes and metadata, not just self-asserted labels. Only provenance.json and the declared output/operator trees are permitted. No original migration asset is rewritten.

### Exact-artifact release

Retire the runnable Git-source deployment trigger. Release CLI requires --artifact and --artifact-sha256 in addition to exact approved commit/migration manifest and separated owner-private contexts; default performs no private read/network operation. Before DB work, verify source publication/cleanliness and artifact identity, then make a private verified snapshot. Retain one operator.lock across verification/status/migration/report/upload/create/identity/domain/smoke. Run the existing operator against that snapshot's original migration assets; do not rebuild source during release.

Use the pinned CLI's prebuilt transport semantics without adding a CLI runtime dependency: upload immutable file bytes to POST /v2/files using the documented content SHA-1 header; create through POST /v13/deployments?prebuilt=1 with exact files/project/production target and no gitSource. Only final .vercel/output contents are uploaded, not source/private/operator context. Query flag semantics are corroborated by CLI65.4.0's public @vercel/client bundle; the general REST create schema omits this flag, so real provider compatibility remains a mandatory external gate.

Exact CLI65.4.0 client wire contract: POST `/v2/files` uses `x-now-digest`, `x-now-size` and Content-Length; successful HTTP200 need not contain JSON. Create-file entries carry full POSIX regular-file mode (`S_IFREG | permissions`), not permissions alone. Synthetic transport hashes received upload bytes, checks lengths and requires those received content addresses before creation. Source comparison corrected the initial header/body/mode assumptions before handoff. This resolves local encoding, not the separate real provider file-UID/attestation gate.

Read and hash bytes before each upload, retain content-addressed upload references, and verify the private snapshot and approved source/artifact again before creation. A post-upload mutation fails before deployment creation; cancellation never retries silently. Return identity is provider id/projectId/ownerId/target/state, bound to this invocation's verified upload receipt, not requested meta. At READY require provider file-tree evidence at GET /v6/deployments/{id}/files to match the exact uploaded paths/modes/content-addressed identifiers, including the sealed artifact evidence. A missing/extra/mismatched or unsupported provider attestation fails closed, never substitutes arbitrary metadata. The documented file UID and pinned upload SHA-1 relationship must be confirmed externally; synthetic tests establish refusal/matching logic, not remote enforcement.

Verify exact project settings/repository/main/no hooks and existing verified domain before migrations. Verify deployment/file evidence plus alias/project/domain before and after safe api.lovora.us HTTP smoke. Preserve conservative locks for unknown/queued/cancelled/mismatched outcomes and DB-unknown state; committed migration plus failed deploy never triggers automatic rollback. No provider API/upload/deploy is executed in this increment; transport is synthetic. Runtime Production env remains owner-managed and excluded from build artifacts.

### Verification, gates and sequence

T061 planning/consistency → T062 bootstrap → T063 upstream build/assembly + T064 integrity → T065 prebuilt release → T066 actual native HTTP + T067 tamper/release tests → T068 evidence/READY_FOR_REVIEW → T059 coordinator-only new Luna review → T060 separately authorized docs-only closeout. One source writer; no speculative parallel writer/reviewer. Original60 IDs/checkmarks and dated failures/reviews remain intact during planning.

Run only affected checks under cached Node24: actual native upstream build, final assembly/inspection, isolated emitted handler outside source/dependency roots, auth/live/unknown/preflight/degraded/recovery, client disconnect and shutdown/resource cleanup. Strict standalone55432 disposable databases only for migration/release/recovery tests; never stop/reset shared stacks or use Supabase-local main/cloud for failure tests. Exercise packaging determinism, controls/handler/routes/closure, source/config/tool/platform mismatches, private/path/symlink exclusion, stale/tampered/missing/extra files, mutation during consumption and synthetic upload ordering/no-Git-rebuild/queued/failure/cancel/uncertain outcomes.

Local HTTP cancellation plus emitted supportsCancellation does not prove a real Vercel worker abort or10-second provider kill. Real platform settings/enforcement, remote file attestation, full genuine metadata, Hobby eligibility, owner inputs, cloud DB preflight/versioned migration, same-artifact deployment/domain/TLS and api.lovora.us+Supabase-cloud acceptance remain external. T054 may record local raw/final native evidence but stays open for those native/provider acceptance limits; no tsc-only substitute. README owns one updated manual list after actual evidence.

### Expanded implementation evidence — READY_FOR_REVIEW

- Cached Node24.22.1/TypeScript5.9.3 compilation: exit0. Focused config/HTTP/prebuilt-release/artifact/offline checks:40 passed,0 failed. Real local HTTP is included; native handler and provider proof are separate.
- Attempt01 (`/private/tmp/esty-artifact-native-expanded-01`): exit1 before install; npm rejected the same file supplied as user/global config. Preserved `native-build.log`; corrected to distinct empty files.
- Attempt02 (`/private/tmp/esty-artifact-native-expanded-02`): upstream CLI65.4.0 build succeeded with193 API-workspace packages and actual `apps/api/src/main.js` handler, Node24/arm64, empty environment. Final assembly did not run because the driver searched fresh HOME for builders while CLI uses bundled public packages; corrected to verify CLI-relative resolution before execution. npm reported6 high-severity dependency advisories; no upgrade/audit-fix was attempted.
- Attempt03 (`/private/tmp/esty-artifact-native-expanded-03`): all four pinned public tarballs/package contents verified and native build/operator staging succeeded. Assembly rejected the traced `apps/api/config/hosted-target.example.json`; this is the existing required public Session target imported by runtime config, not a secret. Added that exact asset to the runtime allowlist, without broadening private-file access. Raw1015 files/operator6188 files inventoried; original and copied public source manifests matched. All failed attempts remain non-deployable raw evidence.
- Attempt04 (`/private/tmp/esty-artifact-native-expanded-04`): native build, four pinned tool verifications, staging and final assembly succeeded. Sealed development SHA-256 `cb9aaa5236e2a79666c8dc149fb423754204622647897ca22f4013ec3be70718`; actual integration diagnostics identify that emitted handler. Guard/live/ready/unknown, disposable DB200→503→200, blocked-query disconnect cleanup and SIGTERM passed.
- Initial full integration invocation:26 passed/4 failed. The old hosted-TLS fixture omitted the now-required bearer and supplied a retired synthetic project tuple. Corrected only test inputs/authorization to the reviewed public tuple with synthetic credentials; runtime validation stayed unchanged. The helper's first `HeadersInit` annotation failed Node-only compilation; `Record<string,string>` corrected it. Subsequent artifact/release/HTTP run:30/30 passed. A mistyped Node executable path then exited127 before the targeted TLS command; the corrected TLS-only invocation passed4/4 (trust, untrusted CA, wrong hostname, warm pool/timeout/abort/recovery).
- Attempt05 and its exact final native handler passed after those test changes: artifact SHA-256 `561dbc20bec2c4c1733e20e4f284e2fe50f8b45c033e852464eb86b1d7705919`, source digest `b614d89429a75e6aecd663adacfe2e6824f84b9a12891576d7fe8ecc5c6d86d0`,7200 sealed files/1011 raw runtime files. The native-only journey additionally exercised malformed/wrong bearer and allowed/denied preflights before any DB connection. Reassembly from identical verified raw/operator/source inputs produced the identical artifact digest; the repeat artifact was removed afterward. This artifact predates the final upload-wire correction and remains dated development evidence, not the final candidate.
- Final upload-wire/settings tests passed10/10; serialized fixture release tests passed13/13, including actual migrated-history inspection before trigger, migration failure/no deploy, queue/timeout, mismatched identity, domain failure, cancellation and concurrent lock exclusion. No real provider transport was called.
- Codegen/migration-manifest drift checks and default build/release CLI invocations exited0; defaults printed approval/input-required and performed no operation. Exact standalone fixture query found no remaining `foundation_test_%` databases. No stack stop/reset or volume deletion occurred.
- Attempt06 (`/private/tmp/esty-artifact-native-expanded-06`) stopped on public npm `ECONNRESET` during isolated `npm ci`; native compilation/assembly did not run. Preserved public diagnostics and made a fresh isolated attempt without source, dependency or runtime-control changes.
- Attempt07 completed unchanged pinned native build and sealed final assembly after the transient registry failure. Final public work directory: `/private/tmp/esty-artifact-native-expanded-07`; artifact: `/private/tmp/esty-artifact-sealed-expanded-07`; provenance SHA-256 `9ff6b2ad0ec34b3404c8a3d6c4db1f02a725c38801f77992c5d8006e1d5fc4af`; source-content digest `2c2f81ee876452f364b61d7050e516f6345a2ffbe5006f6eac8551f4e7897b59`; base tree `7365fd1f90488fa7ce1a951d2b9de97d2074434d`. Node24.22.1/npm11.19.1, Darwin/arm64,7200 sealed files/1011 raw runtime files. Actual final handler journey passed1/1 under guarded loopback TLS, with the digest printed by the test. Final source-manifest revalidation matched the working API inputs; repeat assembly produced the same digest and its temporary copy was removed.
- Final function is `apps/api/src/main.js`, Node24, arm64, empty environment, maxDuration10/supportsCancellation=true. CLI65.4.0, @vercel/nestjs23.0.0, @vercel/node28.0.0 and @vercel/build-utils15.1.0 package files matched their pinned official SHA-512 tarballs before build. These are local native/assembly/runtime facts, not real Vercel enforcement, Linux deployability or remote attestation.
- Protected baseline hash checks matched root package/lock/ignore, API env example/Compose/public target/config/migration and sole contract. The supplied baseline did not contain the shared pointer hash; no pointer write occurred. README's pre-existing FE/history prefix and dated native-failure block, and PROJECT_STATE's full historical suffix matched the coordinator's public pre-doc snapshots. No Git/index inspection or mutation was needed for preservation checks.
- All owned build subprocesses/tests exited; disposable test databases and consumption/TLS/preload directories were cleaned by the harness. Public build/source/package/log evidence and sealed development artifacts are intentionally retained for review; original failed investigation directories and all shared services/volumes remain untouched. No new review inherits T055: coordinator alone verifies reviewer availability and starts T059.

Actual command families (repository cwd; `$NODE24` resolved to `/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin/node`):

```sh
"$NODE24" node_modules/typescript/bin/tsc -p apps/api/tsconfig.json
"$NODE24" --test apps/api/build/tests/config.test.js apps/api/build/tests/http.test.js apps/api/build/tests/release.test.js apps/api/build/tests/artifact.test.js apps/api/tests/hosted-config.test.mjs
"$NODE24" --test apps/api/build/tests/artifact.test.js apps/api/build/tests/release.test.js apps/api/build/tests/http.test.js
"$NODE24" apps/api/scripts/stage-operator.mjs
TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local \
  NATIVE_ARTIFACT=/private/tmp/esty-artifact-sealed-expanded-07 \
  NATIVE_ARTIFACT_SHA256=9ff6b2ad0ec34b3404c8a3d6c4db1f02a725c38801f77992c5d8006e1d5fc4af \
  "$NODE24" --test --test-name-pattern='compiled Vercel-mode package protects' apps/api/build/tests/integration.test.js
TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local \
  "$NODE24" --test --test-name-pattern='hosted TLS verifies' apps/api/build/tests/integration.test.js
"$NODE24" --test apps/api/build/tests/release.test.js
TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local \
  "$NODE24" --test --test-name-pattern='release serialization' apps/api/build/tests/integration.test.js
"$NODE24" apps/api/scripts/codegen.mjs --check
"$NODE24" apps/api/scripts/migration-manifest.mjs --check
"$NODE24" apps/api/build/scripts/build-artifact.js
"$NODE24" apps/api/build/scripts/release.js
```

Each native attempt used the versioned build driver with the repository path, `--mode development`, existing public `.openai/cloud-tools/vercel/node_modules/vercel/dist/vc.js`, and the corresponding new work/destination suffix01–07 above. The initial full integration command omitted the name filter and selected artifact04; only failing/changed scenarios were subsequently rerun. Counts above are distinct observed invocations, not a fabricated final full-suite pass. README owns canonical future runnable commands and the single remaining owner checklist.



## Latest owner hosting preference — Vercel, 2026-10-29

The owner selected existing separate Vercel FE and esty-admin-api BE projects and authorized this pane as sole source writer after plan/consistency alignment. Retire active Render configuration/adapter, preserving dated evidence and original private files. Reuse documented project prj_uITHKLUGGE98VxrEcs5FoktBbcls, scope khuonghuyhieu0705s-projects, root apps/api and Node24 without account/auth reads. No new dependencies, FE work, Git mutation/publication or external provider/SQL/DNS operation.

A personal account does not by itself establish non-commercial use. Official Vercel fair-use guidance defines commercial use by intended financial gain; using an internal tool for one's own shop may still fall within that definition. No provider classification/enforcement method or project-specific eligibility is known, and no paid upgrade/payment method/trial is authorized. Document this unresolved eligibility limit without forcing a new provider or presenting it as verified compliance.

The owner reports existing private runtime/operator files. Agent work never reads or overwrites them; only later explicit owner TTY conversion may read originals and create separate Vercel outputs. Default OWNER_INPUT_PENDING performs no private read/write. A fresh FE pause receipt grants narrow BE README/PROJECT_STATE edits; coordinator returns it at closeout. Preserve all dated A+C/failure blocks and FE003/T013/preview/gallery byte-for-byte.

### T054 native-build repair scope and before evidence

The coordinator's isolated public archive `/private/tmp/esty-api-native-9hy8xyry/source` used cached Node24.22.1/CLI65.4.0, empty auth/HOME/npm configuration and `build --prod --non-interactive`. It exited1 before install: `unused_function`, pattern `src/main.ts` does not match Serverless Functions inside `api`. The manually copied public `.vercel/project.json` fields are verified relevant settings, not a full genuine pull: project prj_uITHKLUGGE98VxrEcs5FoktBbcls, org team_k2Hk4wx5XAb9Mgc6lP5AjVhf, NestJS, apps/api, Node24, null build/install/output. The production env file was intentionally empty. Preserve this actual failure separately from the earlier `project_settings_required` attempt.

Investigate CLI monorepo/root resolution before selecting the smallest native config/entrypoint/artifact correction. Cached CLI65.4.0 resolves build workPath from cwd plus settings.rootDirectory; the recorded root invocation therefore targets apps/api, not the FE root package. Its dedicated NestJS builder enters through package.json; the unused-functions validator exempts express/hono/python/unified backends but not dedicated NestJS. Native entrypoint selection also requires a direct NestJS import, so emitted artifact/bootstrap must be exercised rather than trusting a build exit alone.

T057–T060 retain all original56 task IDs/checkmarks. Permit public downloads/install only in a fresh isolated source copy with empty credentials; no --yes/pull/env pull or authenticated launcher. Preserve duration10/cancellation, bearer-before-DB, verified Session TLS, pool/deadline bounds, one migration history and disabled automatic Git deployment. Correct only the active obsolete Render env-example block. Exercise emitted native HTTP with synthetic values and fail-closed loopback-only sockets; no real DB connection/SQL. Coordinator alone starts a new Luna review after READY_FOR_REVIEW, followed by a separate docs-only closeout.

Official references: [NestJS native entrypoints](https://vercel.com/docs/frameworks/backend/nestjs), [function configuration](https://vercel.com/docs/project-configuration/vercel-json#functions), [CLI build](https://vercel.com/docs/cli/build), [native NestJS builder source](https://github.com/vercel/vercel/tree/main/packages/nestjs). Owner reports Production vars/domain configuration but no production deployment; those reports do not prove hosted HTTP, SQL, domain binding or Hobby eligibility.

### T054 investigation results — blocked, not native acceptance

Public isolated copy: `/private/tmp/esty-api-native-fix-7nyjm23o/source`, copied from the coordinator's public fea68e8 archive while excluding .vercel/node_modules/.next/.git. Relevant verified metadata above was manually recreated at the copy root; `.vercel/.env.production.local` was zero bytes. New empty HOME/auth/npm configs and temp-local npm/builder/compile caches were used, with telemetry disabled. No owner environment, token, authenticated launcher, pull, --yes or deploy was used. Metadata remains a relevant-field subset, not a full genuine project pull.

Exact native command, with NODE24 pointing to `/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin/node` and CLI pointing to the repository's public `.openai/cloud-tools/vercel/node_modules/vercel/dist/vc.js`:

```sh
"$NODE24" "$CLI" build --prod --non-interactive \
  --cwd /private/tmp/esty-api-native-fix-7nyjm23o/source \
  --global-config /private/tmp/esty-api-native-fix-7nyjm23o/empty-auth
```

The process environment was constructed from scratch: PATH with cached Node24 first, temp HOME/TMPDIR/XDG_CONFIG_HOME/XDG_CACHE_HOME, separate empty NPM_CONFIG_USERCONFIG/NPM_CONFIG_GLOBALCONFIG, temp NPM_CONFIG_CACHE/NODE_COMPILE_CACHE, VERCEL_TELEMETRY_DISABLED=1, NO_UPDATE_NOTIFIER=1 and CI=1. No inherited private runtime environment.

1. **Catch-all diagnostic:** changed only the isolated copy's function pattern to `**`, preserving duration10/cancellation. Exit1 before install with the same unused_function error. This rules out a simple glob spelling fix; it was not applied to repository config.
2. **No-functions diagnostic, deliberately unacceptable:** removed functions only in the isolated copy. Native CLI65.4.0 installed193 public packages in that copy, selected @vercel/nestjs23.0.0 and ran the actual API `npm run build` (manifest check + tsc); exit0. This confirms apps/api/Node24/NestJS selection, not an FE/root build. Output `.vercel/output/functions/index.func/.vc-config.json` identifies handler `apps/api/src/app.js`, runtime nodejs24.x, framework nestjs and **no maxDuration/supportsCancellation**.
3. **Emitted-entrypoint smoke:** imported that exact emitted handler under cached Node24 with a fail-closed socket preload and macOS loopback-only sandbox. Exit1: listener count0, expected1. The builder selected the application factory because src/app.ts imports NestFactory; src/main.ts, which actually listens, does not directly import NestJS. A build exit0 therefore would still not serve this API. No HTTP success or portable dependency-closure acceptance is inferred from this diagnostic.
4. **Upstream compatibility check:** public npm latest resolved65.7.0. Its downloaded tarball's validator still exempts express/hono/python/backends, not dedicated NestJS. This is source inspection only;65.7.0 was not installed or executed. [Exact public package](https://registry.npmjs.org/vercel/65.7.0), [NestJS builder implementation](https://github.com/vercel/vercel/blob/main/packages/nestjs/src/build.ts). Cached generate-node-builder-functions and the actual emitted handler corroborate selection.
5. **Affected existing checks:** in the isolated copy, `/usr/bin/sandbox-exec -f <temp>/loopback.sb "$NODE24" --test build/tests/config.test.js build/tests/http.test.js`, cwd apps/api, with NODE_OPTIONS requiring the temp socket guard: exit0, config9/9 + HTTP4/4. Real synthetic HTTP exercised denial before DB, safe OPTIONS, authorized live200/unknown404, degraded503, bounded timeout/saturation/disconnect and pool cleanup. Only silent/refused loopback peers; no real SQL/DB. Initial sandbox profile using literal127.0.0.1 was rejected by sandbox-exec with exit65 before tests; corrected macOS `localhost:*` filter plus exact127.0.0.1 JavaScript guard passed.
6. **Actual env-example correction:** selected Vercel Production block replaces obsolete active Render instructions; platform markers, exact Session tuple, bearer-before-DB and runtime/operator separation stay explicit. A throwaway sandboxed parser smoke using only synthetic password/key returned0 with runtime=vercel, verified TLS, port5432 and expected browser origin. It opened no connection.

**Decision/blocker:** do not delete duration/cancellation, change framework, add dummy API functions, patch cached dependencies or silently enable experimental backend flags to manufacture a pass. The supported dedicated NestJS/functions path fails in the inspected CLI versions, and removing functions exposes a second genuine entrypoint defect. Repository vercel.json/runtime/dependencies remain unchanged. A supported upstream builder/configuration path preserving both function controls, or an explicitly reviewed alternative native-build design, is needed before choosing the source repair. Full genuine settings fidelity is still a separate prerequisite; it alone is not claimed to fix this reproduced validator behavior.

T057 is partial (investigation/env correction only); T058 records diagnostic results, not passing native acceptance. No new reviewer was started. New review T059 and later docs-only T060 must not reuse T055. Public logs/native diagnostics are retained under the temp directory for coordinator inspection; throwaway smoke/guard scripts are removed after evidence capture. No owned process, socket, DB or cloud resource remains. Root package/lock/ignore/pointer and repository vercel.json match the pre-investigation bytes; no FE source or dated FE/history section was edited. Existing failed coordinator snapshot remains untouched.

Cleanup: the rejected output is quarantined at `/private/tmp/esty-api-native-fix-7nyjm23o/native-diagnostic-output-NOT-DEPLOYABLE`, outside source/.vercel/output. The copy's vercel.json is restored to the unchanged repository controls. `evidence.json` retains exact public argv/environment whitelist, metadata and exits alongside logs; no smoke/preload/sandbox script remains. The separate coordinator snapshot was not modified.
Preservation check:60 unique task IDs; all original56 checkbox states unchanged. PROJECT_STATE's entire pre-existing publication/history suffix and README's pre-existing prefix through the old checklist boundary plus final external-acceptance suffix match pre-investigation bytes. Only the narrow owner-checklist items2–4 were updated to distinguish owner reports from actual acceptance. No Git/index inspection or mutation was needed.





## Required delivery target — hosted testing at api.lovora.us

Required final BE endpoint is `https://api.lovora.us` on the existing Vercel BE project with Supabase cloud, never a tunnel to local Docker. Local-only or provider-URL readiness is insufficient. The complete delivery includes private conversion, genuine native artifact/settings, real DB preflight/versioned migrations, same-commit deployment and verified same-deployment domain association/DNS/TLS/HTTP acceptance. This source/local increment does not execute external gates.

The plan/source-local work and new independent review are complete; this does not mean DNS/host/SQL/deploy operations happened. Execute external gates only within separately approved scope rather than treating cloud/domain as optional. FE app.lovora.us, root-domain/mail records and unrelated resources remain protected. Hosted FE caller authentication is separate and does not block authorized direct BE testing at api.lovora.us.

## Current decisions and delivery order

| Increment | Scope | Task IDs | Boundary |
| --- | --- | --- | --- |
| A — BE local | Supabase local for run/test, existing NestJS local, versioned migration status/reports | T037–T044 | Source/local checks and independent combined review complete; no cloud password or FE writes |
| B — FE local | Generated client and a local connectivity screen with actual browser→API→Supabase-local proof | T014–T016 | Separate FE ownership/install handoff after A; preserve sample Application/public routes |
| C — Historical cloud preparation | Offline helper and reviewed Render runtime/release work | T032–T036, T045–T047, T025 | Historical completed checks/review preserved; not active provider commands or Vercel acceptance |
| V — Vercel adaptation | Plan, private conversion, API bearer boundary and normalized deployment adapter | T049–T056 | Source/local checks and new independent review complete; documentation-only closeout, native T054 pending |
| D — Required hosted release/domain | Actual private inputs/settings/native proof, SQL/migrations, Vercel release, api-only DNS/TLS/HTTP | T020, T027–T031, T048, T054 | Separate owner approvals; no account/private/network mutation now |

All T001–T048 IDs/checkmarks remain historical evidence or separately open acceptance gates. T049–T056 track adaptation without relabeling old Render passes as Vercel proof. FE B is independent. Existing unstaged work on main@d286335, root package/lock/ignore/pointer and FE source remain protected. Coordinator completed the one new independent review after affected checks; OMP spawns no reviewer and performs only this authorized docs closeout.

Owner decisions:

- Development/testing uses Docker-based Supabase local. Existing standalone PostgreSQL55432 remains a protected destructive-test fixture, not the preferred application DB. Preserve its volumes.
- Runtime remains Node24.22.1/NestJS12.2.0/TypeScript5.9.3/pg8.23.1/node-pg-migrate9 and existing @vercel/functions3.10.4. Active API modes become local/vercel; retired Render inputs fail clearly.
- Local defaults: API127.0.0.1:3001, FE/CORS http://127.0.0.1:3000; Supabase gateway54321/DB54322/Studio54323 on loopback, verified for collisions at setup. Studio is optional; use the smallest supported stack needed for run/test, no application Auth/Storage/Realtime feature.
- One application migration set/history. Explicit local migration command; future approved release automatically migrates before deploying. API startup/install/build never applies app DDL.
- No paid upgrade/payment method/trial or forced provider switch. Vercel Hobby eligibility for the owner's intended use is unresolved; it is an actual owner/provider gate, not a reason to fake compliance or change source provider.
- Full destructive/integration/failure suites remain isolated locally. Real non-destructive API functional checks also run through https://api.lovora.us; hosted DNS/TLS/access/live/readiness cannot be accepted from local tests. Wider load/cancellation behavior is claimed only if actually exercised.
- Reuse only the existing BE Vercel project and api.lovora.us; preserve FE/portfolio and unrelated resources. No Render onboarding, new cloud platform, billing, root-domain changes or business modules.

## Current evidence and prerequisites

Reviewed local stack, immutable13-digit migration names/SHA manifest, advisory lock/single transaction, read-only status and version reports remain unchanged. T050–T053 completed Vercel application bearer/private conversion/normalized release paths, retaining native src/main and attachDatabasePool composition. New T055 review is complete; ordinary tsc/copied-process proof remains insufficient for genuine native T054.

Supabase local CLI2.122.0 and Docker stacks were verified previously; preserve volumes and no reinstall/auth reads. Exact Supabase-cloud metadata is known, not actual SQL/privilege proof. Existing Vercel BE metadata is reused, not recreated. The owner privately supplies team/account ID/token/settings later; agent tests use synthetic transport only.

Use command-local `SPECIFY_FEATURE_DIRECTORY=specs/001-connectivity-foundation SPECIFY_FEATURE_NO_PERSIST=1`. Preserve shared pointers/root dependencies/FE files and negotiate current leases if those become affected. README owns runnable commands; do not turn planned examples into completion evidence.

## Constitution and scope check

One frontend, portable modular-monolith NestJS, one application DB per environment/history and sole OpenAPI contract. Local infrastructure is not a business module. All artifacts English; conversation Vietnamese. Narrow Vercel bearer access protects all API routes but does not solve hosted FE identity. No secret enters source/log/browser output, no paid provider operation or application DDL at startup/build/install.

Installed Spec Kit prerequisites/setup and read-only consistency preceded source with command-local feature/no-persist values, preserving existing templates/pointer/history. No extensions/checklists are present. T055's new coordinator-run gpt-6-luna review completed after actual affected checks, without inheriting historical T035/T044. Current T056 is docs-only: no source fix, test/build rerun or workflow setup rerun.

## Supabase local setup plan — Story 6

### Goal and boundaries

Preferred development path: local Next.js → local NestJS → local Supabase PostgreSQL. Supabase supplies a local DB and Studio, with supported auxiliary services as needed by the pinned CLI; it does not add Auth/Storage/Realtime application features. A local stack offers a Supabase development environment, not proof of cloud TLS, Session pooler, permissions or Vercel/Render behavior. No remote login/link, db pull/push/reset, remote migrations or cloud account changes.

Reuse installed isolated Supabase CLI2.122.0 and Docker; no npm/global/skill install. Verify the existing launcher/workdir without reading auth stores: its personal cloud project targeting must not bleed into local commands. If needed, add a local-only wrapper/config context that invokes only local CLI operations, clears remote project/token overrides for those child commands and preserves the company/personal cloud launchers unchanged. Do not reinstall or repurpose an authenticated cloud profile.

### Implemented source/configuration layout

- `apps/api/supabase/config.toml`: local project id `esty-admin-local`, PostgreSQL17 major compatible with the hosted direction, explicit non-conflicting local ports and seed/migration replay disabled where supported by pinned CLI. Verify installed CLI schema instead of copying future docs blindly.
- `apps/api/scripts/supabase-local.mjs`: optional thin scoped lifecycle wrapper only if needed for reproducible workdir/isolated local execution. Never call remote commands or invent unsupported flags. Use existing installed CLI rather than downloading another copy.
- `apps/api/package.json`: API-workspace local start/status/stop scripts; preserve existing db:up/db:stop fixture meaning and root FE scripts. Root command additions require a shared-file lease and demonstrated need.
- `apps/api/.env.example`: document a clearly separated Supabase-local application profile, after checking actual synthetic endpoint/credential behavior; never overwrite the owner's existing .env or replace the remote tuple with local values.
- `apps/api/tests/supabase-local.test.ts`: bounded, explicitly local smoke for identity, initial migration state, apply/rerun and actual HTTP readiness. Keep destructive randomized tests on the existing strict standalone fixture.

These files/scripts now exist and were exercised locally. There is no second application migration directory/history. Supabase CLI initializes only its own system schemas/platform metadata; application foundation migrations remain node-pg-migrate in apps/api/migrations with public.foundation_migrations only. Seed/replay are disabled; no application SQL was added to supabase/migrations or applied through Studio.

### Environment and lifecycle

Plan default local endpoints: API gateway127.0.0.1:54321, database127.0.0.1:54322 and Studio127.0.0.1:54323, subject to current port availability and pinned CLI configuration. FE3000/API3001 and standalone fixture55432 remain distinct. Bind stack ports to loopback using the officially supported Docker network/config approach; verify effective bindings rather than assuming defaults are loopback. Identify containers/volumes by the local project id; do not stop unrelated stacks.

Before starting, inspect Docker availability/resources, CLI compatibility, occupied ports and existing local project state. Image downloads/resource consumption must be disclosed as part of the approved local setup; do not mutate shared npm dependencies. Inspect the resolved config and generated filenames; keep runtime state/.temp/build outputs ignored and exclude credentials from staged files. Retrieve only sanitized local connection metadata, never dump CLI status output containing keys/tokens. Use synthetic local DB values in the documented app profile; no cloud password or service-role key is required for Nest's pg connection.

Start the approved local stack; verify service versions and health. Preserve existing standalone fixture volume; it can remain idle/stopped if needed for resources, but do not remove it. Startup must not apply application migrations automatically. Before explicit app migration execution, inspect foundation/history presence; on a fresh approved local project apply the existing operator once then again with expected1→0, or compatible current0→0. Stop on unexpected schema/history rather than reset/adopt. Do not run db reset, down -v, remote SQL or cleanup that deletes persisted local data.

Use the actual loopback DB URL with API_RUNTIME=local and the existing local CORS origin. No fake hosted marker, preview guard or real Supabase secret is needed. Prove API live200 and fresh readiness200 after the expected schema exists. For failure/recovery, isolate the test at the client/process configuration boundary or only a newly created disposable resource that the test owns; do not stop the entire Supabase stack or change shared system schemas to simulate failure. Stop only processes created for the check; document targeted stop/start with volumes preserved.

### Validation and acceptance

1. Configuration and local lifecycle commands resolve only the unique local project/workdir; no remote link/account selection.
2. Effective ports are loopback-only and do not collide with FE/API/old fixture; Docker project/image/version evidence is recorded.
3. Existing node-pg-migrate set applies/reruns predictably; foundation/history and fresh actual Nest HTTP readiness are verified against Supabase local. No application migration engine duplication.
4. Existing strict TEST_DATABASE_URL guard remains unchanged. The old destructive integration suite must not run against Supabase's main postgres database; add only meaningful bounded smoke for the new target.
5. Scoped config/HTTP/fixture regressions pass when relevant; a later FE handoff proves local browser UI→API→Supabase-local success/failure/recovery. Do not repeat unchanged suites solely to accumulate counts.
6. Scoped read-only Luna review follows new implementation/tests; existing T026 review does not cover this new configuration. Docs record actual commands, results, optional service limitations and how to restart without losing data.

Stop after the approved local setup/verification boundary with evidence and any remaining FE handoff. No cloud config, hosted readiness, password entry, provider deploy, DNS, Etsy/auth feature, Git publication or remote schema operation is implied.

Sources: [Supabase local development](https://supabase.com/docs/guides/local-development), [CLI configuration](https://supabase.com/docs/guides/local-development/cli/config). Installed CLI schema and dated executed evidence below govern; this adaptation does not restart or recreate the verified stack.

## Versioned migrations and release visibility — owner-confirmed policy

Retain the implemented migration versions, failure attribution and sanitized report interface. A future approved release automatically runs the same serialized operator before deployment; this adaptation does not perform real SQL or alter migration assets/history.

### Existing mechanisms to retain

Current source already requires unique13-digit timestamp-name.mjs filenames, generates ordered name/SHA-256 metadata and uses public.foundation_migrations for applied name/time history. Example existing version:1792972800000-foundation. The runner enforces ordering, advisory locking and a single transaction. Do not create a second v1/v2 numbering sequence or application migration history.

Existing reporting distinguishes attempts, transaction acknowledgements and report-write failure from committed history. Preserve it rather than reinstating count-only output. Packaged checksums are not a database-stored historical checksum ledger; do not claim tamper detection beyond the inspected assets/history.

### Retained status and report contract

- A read-only local migration-status command compares the approved ordered manifest with applied history and reports applied/pending/missing-or-unexpected versions. An absent history on an approved fresh target means not initialized/pending; status must not create it. Use v9-supported APIs or explicit read-only history queries, not a newer-version status API assumed available.
- Each attempt gets run_id, optional source revision/release id, explicit non-secret target label, manifest digest, start/end timestamps, duration, before/after committed versions, attempted version list and result. Per-version names/checksums derive from the manifest. Do not log DB URLs/passwords, raw SQL/driver messages/stacks or business values.
- Report stage: config, assets, connect, lock/order, migration, commit or verification. For errors tied to a migration, record its exact version. For pre-execution/load/commit errors without a reliable per-file attribution, report the stage and version unknown/not_started instead of guessing the final pending file.
- Use verified v9 loader/logger instrumentation to retain version context through migration action generation and SQL execution; allowlist known manifest names, never forward raw upstream logger/error text. Tests must demonstrate attribution for both a thrown migration function and a failing SQL statement in a later migration. No per-file success is committed until the shared transaction actually commits.
- Distinguish attempted/executed_uncommitted, applied_committed, rolled_back and not_started. If the batch rolls back, all attempted migrations in that transaction remain unapplied in DB history; the external sanitized report records the failed attempt. If rollback or final verification is uncertain, report unknown and stop, not a successful recovery.
- CLI emits a concise sanitized summary, returns nonzero on failure and writes a machine-readable local report under ignored .openai/reports/migrations/<run_id>.json. Future CI retains a sanitized report as a release artifact, not a second database ledger or new monitoring service. Local report write failure must be surfaced without claiming the DB rolled back after it already committed; record/reporting errors and DB outcome are separate.
- Already-applied files are immutable; introduce a new uniquely named version for each schema change and regenerate the manifest. Duplicate timestamps, invalid names, missing applied versions/order mismatch and package/manifest drift block execution. Do not claim tamper detection for historic DB checksums unless a prior trusted report/manifest actually exists.

### Local workflow and future release workflow

Local: author new migration → generate/check manifest → inspect status → run explicit local migration command → inspect summary/status → rerun unchanged expecting0 new applications. App startup remains independent. Validate failure and transactional rollback only in disposable fixture databases, preserving shared Supabase-local system/data state.

Future release: approved exact target/source artifact → build/tests/asset validation → one serialized operator migration job → verify committed history and save sanitized report → deploy API → smoke/readiness checks. Migration failure/nonzero exit blocks deployment. A deployment failure after a committed migration does not undo the database automatically; inspect compatibility and use a separately reviewed forward fix or rollback. Never promise zero downtime: current readiness checks the entire ordered migration set, so an older process can report pending/degraded after the database advances. Review expand/contract and rollout compatibility before enabling a hosted pipeline.

Keep operator credentials separate from API runtime. Vercel adaptation replaces only provider assumptions around the existing runner/report interface; no new provider, paid CI or migration permission is implied. Do not add DDL to API startup/build/install.

Version-matched reference: [node-pg-migrate v9 API](https://github.com/salsita/node-pg-migrate/blob/v9.0.0/docs/src/api.md). Dated executed report tests below remain the unchanged baseline.

## Local command, diagnostics and acceptance packet

Existing verified commands retain their meanings; README owns runnable local commands. Vercel conversion/release commands are not ready to invoke until the new source/local checks and review gates are recorded. Prefer API-workspace scripts; root scripts/dependencies stay unchanged.

| Developer operation | Planned behavior |
| --- | --- |
| Stack start/status/stop | Explicit local Supabase project/workdir; sanitized health/port summary; targeted non-destructive stop |
| API dev/start | Existing api:dev/api:start behavior with approved local configuration, no hidden DDL |
| Migration status | Read-only version/history comparison; no history-table creation |
| Migration apply | Existing approved application set, serialized lock/transaction and versioned report; rerun unchanged applies0 |
| API checks | Existing api:check plus new scoped setup/status/report checks when implemented |
| Integration | Existing strict standalone fixture for destructive scenarios; bounded Supabase-local smoke separately |
| FE check | Later coordinated local browser success/failure/recovery through generated client; no new duplicate browser suite |

Diagnostics: distinguish configuration, stack/port, database-connectivity, migration/history and API/HTTP failures. Emit timestamp, operation/run id, safe stage/version where known, duration/result and next actionable local step. Never emit full DB URLs/passwords/keys/raw SQL/driver stacks. Keep concise terminal summaries and existing ignored local report paths; no Sentry, paid logging service, dashboard, notification integration or automatic background polling is required.

Local acceptance: verified CLI/config/project id and loopback ports; reproducible start/status/stop/restart preserving volumes; actual local API live/readiness with the single committed migration history; unchanged rerun0; precise sanitized disposable-fixture migration failure reports; relevant config/HTTP/integration regressions; one scoped independent Luna review for the actual implementation increment. Full local foundation acceptance additionally requires coordinated FE T014–T016. Documentation must distinguish recorded execution from proposed commands and report blockers honestly.

## Next local slice — FE → API → Supabase local (T014–T016)

Status: planned; FE implementation requires its separate handoff. No FE/BE source work or setup starts here. Depends on Story6/T037–T041 proving the local stack/API and a stable existing contract. This is separate from FE003 sample-frame visual acceptance; do not replace sample data with made-up operational data or mark hosted tasks done.

### Review defaults and source boundaries

Proposed screen route: `/connectivity`, separate from `/application`'s reference frame and public home/privacy. Keep the Doodle application visual system/readable typography, but only show connectivity facts. A server-only `LOCAL_CONNECTIVITY_ENABLED` flag defaults false; absent/false returns404 and adds no public nav link. Reject enabling it on known hosted execution and never set it in cloud configuration. Test enabling explicitly in isolated local production-browser runs; public routes and the default-disabled404 need regressions. This gate is local-feature isolation, not authentication for a deployed app.

Proposed source paths: apps/web/src/app/connectivity/page.tsx, apps/web/src/features/connectivity/, apps/web/src/lib/api/generated.ts and a typed transport beside it. Types derive from the one existing OpenAPI contract, not hand-copied response interfaces. Reuse codegen tooling and add drift verification for the approved FE output after coordinating ownership. T014's planned openapi-fetch dependency requires a separate explicit serial FE install/lock window and compatible exact pin verification; no install is approved or performed by this planning step. Avoid a second API/schema/client framework.

For the local-only browser target, allow exactly the configured loopback HTTP API origin, default127.0.0.1:3001; do not accept a query-param/user-entered arbitrary host. FE uses its existing loopback origin, default127.0.0.1:3000, and Nest CORS must match it exactly. E2E may use explicitly configured non-conflicting loopback ports for processes it owns. No DB URL/key/password is sent to the browser, and no Supabase browser SDK is required for this pg-based connectivity check.

### Screen and interaction contract

| Field/control | Meaning |
| --- | --- |
| API process | Result of GET /health/live;200 with contract status ok confirms process only |
| Database readiness | Result of GET /health/ready;200 requires database up and migrations current |
| Degraded reason |503 maps database_unavailable/database_timeout/migrations_pending to clear safe copy |
| Check connection | User-triggered fresh check of both endpoints; initial screen is idle, no fake success |
| Last checked | Local completion time of the current attempt; do not present a historical ready result as current |
| Retry | Same action after failure; keyboard accessible with announced state |

States: idle → checking → ready/degraded/unreachable; process-live and database-ready are distinct indicators. During a new check, clear stale success and disable duplicate submissions. No automatic polling or retry loop. Bound requests with an explicit client timeout (proposed5s, longer than the existing3000ms handler deadline); cancel on unmount and prevent an older response overwriting a newer state. A successful liveness response plus readiness503 must show API running/DB degraded. Network/CORS/invalid-response cases show a safe reachability/response error without inventing a database reason;503 without a valid contract body is an invalid response, not ready.

No business records, shop connection, authentication, fixture CRUD or operational dashboard metrics. Provide semantic headings, status/live announcement, visible focus and 360px/390px/1440px readability using existing UI skills. Error copy must not print URLs with credentials, raw driver errors or arbitrary response bodies.

### Real local browser acceptance

Use the existing production Playwright suite plus focused state/transport checks only where they add distinct value. Extend rather than duplicate the suite. Main journey: default-disabled route404 → explicitly enabled idle screen → check against actual local Nest/Supabase → API/live and DB/migration readiness → retry after failure → fresh recovery. Record the configuration used, ports, actual results and limitations.

| Case | Isolation and expected result |
| --- | --- |
| Real success | Test-owned API uses the already-approved/migrated Supabase-local app target; browser sees live200 and ready200 through the generated client |
| API unavailable | Stop only the test-owned API process, retry and show unreachable; leave owner's dev servers/stack alone |
| DB unavailable | Restart only the test-owned API with an unreachable synthetic loopback DB endpoint; live remains200 and ready503; no Supabase stop/schema mutation |
| Recovery | Restore test-owned API configuration/process and retry; show current real readiness, never cached success |
| Pending history | If required, use a separately owned disposable app target with explicit local scope; never alter/reset the shared Supabase main database/history to force this case |
| UI/regressions | Keyboard/status/timeout/stale-response behavior; mobile reflow; original home/privacy/legacy redirect/404/Application journeys remain passing |

Tests use only their own isolated ports/processes; never reuse/kill owner servers. No existing destructive integration suite is redirected to Supabase. If the approved local stack is unavailable, report a concrete blocker rather than passing from intercepted/fake success. Transport-only failure mocks can test boundaries but do not establish the real success journey.

### Handoff sequence and exit

1. To do BE implements only the approved Supabase-local setup slice and returns actual endpoint/config/contract evidence, with no FE writes.
2. Owner authorizes the separate FE T014–T016 handoff and any needed install window. FE owns its client/screen/browser files; negotiate shared scripts/docs before editing.
3. OMP implements scoped FE behavior and checks; Codex obtains one concise read-only Luna code review after execution and presents the local screen/evidence for owner acceptance.
4. Update task/evidence status truthfully. Local UI→API→Supabase proof completes only applicable local criteria; all provider/native/real-cloud/deployment/Etsy gates remain pending. Commit/push is a separate owner request.

Default route/flag/timeout are review proposals, not installed config or approved new runtime behavior. Keep this detail in feature001 rather than creating a new feature/tracker.

## Owner-private Vercel conversion — T051

Retain existing public Session tuple: project eotmpaliqcxxcotrcols, host aws-0-ap-northeast-2.pooler.supabase.com, port5432, database postgres, user postgres.eotmpaliqcxxcotrcols. The owner has prepared runtime.json/operator.json under ignored .openai/private/backend. Never inspect those files, auth/cache stores or credential directories during this increment.

Implement a pure `vercelConfiguration(runtime, operator)` in apps/api/scripts/vercel-config.mjs and explicit owner TTY entrypoint prepare-vercel-config.mjs. Default prints OWNER_INPUT_PENDING before any private read/write. Only --convert-to-vercel plus hidden TTY confirmation reads the two original files later on the owner's invocation. Reuse secure readPrivate/privateDirectory/writePrivate and terminal restoration; no secret argv/env/pipe. Write only runtime.vercel.json/operator.vercel.json,0700/0600/exclusive/no-symlink, cleanup only newly created partial outputs. Refuse existing destinations before source reads. Original files/credentials remain unchanged.

Pure validation accepts only known string keys. Required tuple and each decoded URL user/password/database/host/port must match approved metadata; preserve URL credential bytes/decoded password, no query/fragments or control/surrogate characters. Runtime source permits optional coherent API_RUNTIME=render or vercel and corresponding platform markers/PORT, optional exact HTTPS origin and verified CA; reject local/conflicting/unknown/provider-token keys. Output explicitly selects vercel, removes platform-owned markers/PORT and uses the reviewed app origin/key. Operator rejects runtime/provider credentials, validates any supplied target/confirmation and removes execution confirmations from output. Owner adds exact migration approval only later. Separate future deploy.vercel.json is not created or populated by the agent.

## Active cloud configuration packet — Vercel

| Context | Values and boundary |
| --- | --- |
| Runtime | API_RUNTIME=vercel; platform VERCEL=1 and PORT; exact approved tuple/DATABASE_URL; PREVIEW_ACCESS_KEY64lowerhex; BROWSER_ORIGIN=https://app.lovora.us; optional verified DATABASE_CA_PEM |
| Runtime exclusions | No local API_HOST/API_PORT, MIGRATION_*, Render settings or provider deployment tokens; no secret browser bundle |
| Operator | Separate converted tuple/MIGRATION_DATABASE_URL/optional CA; owner later adds MIGRATION_TARGET=supabase and matching MIGRATION_CONFIRM_PROJECT_REF after approval |
| Deploy | Separate VERCEL_TOKEN, VERCEL_PROJECT_ID=prj_uITHKLUGGE98VxrEcs5FoktBbcls, VERCEL_SCOPE=khuonghuyhieu0705s-projects, genuine VERCEL_TEAM_ID, exact GitHub REPOSITORY, DEPLOYMENT_TARGET=production, PREVIEW_ACCESS_KEY and exact API/browser origins |
| Project | Existing esty-admin-api only; apps/api root, nestjs framework, Node24.x, linked exact repository/main, no deploy hooks/ignored-build shortcut |
| Git automation | apps/api/vercel.json git.deploymentEnabled=false for all branches; approved source verifier checks this before migration/deploy. Never mistake gitProviderOptions.createDeployments (GitHub status events) for this control |
| External limits | Hobby intended-use eligibility, actual account settings/native artifact/privileges/DNS/TLS remain unverified; no paid upgrade/payment/trial or forced provider switch |

Production is an explicit Vercel deployment target needed for the intended production-domain association of this protected test API; it is not authorization for a real deploy or product-production release. Omitted target/preview is rejected rather than silently changing environments.

## Vercel runtime/access — T050

Keep native src/main.ts, installed attachDatabasePool composition, verified Session TLS and hosted max2/local4 with existing deadlines/cancellation. API local mode stays unchanged. Vercel requires the exact approved tuple and64hex private bearer key. Middleware precedes every controller/DB operation and unknown route: missing/malformed/wrong/duplicate auth generic401; authorized unknown404. Exact-origin GET/Authorization OPTIONS only is data-free204. All other preflight attempts deny before DB work. Update the sole OpenAPI security/401 descriptions and BE generation, never FE output.

Vercel Standard Protection excludes production domains; the old all_except_custom_domains setting is not protection proof for api.lovora.us. No business auth/roles/OAuth or browser-shared key/proxy is introduced. Platform protection may still block safe external checks; report that honestly, never add an automatic bypass.

## Normalized serialized release — T052

Reuse one operator.lock across source/build/status/migration/report/deploy/binding/smoke and immutable approved source/manifest. Replace active render-deploy.ts with vercel-deploy.ts; no runnable Render adapter or fallback. Retired mode/config keys fail before operation. Generic core consumes normalized provider/id/revision/project/owner/target/status, not Render-specific dep- or live states. Sanitize reports; never copy raw upstream JSON/errors/secrets.

Historical T052 used Git-source POST/GET identity. That trigger is retired by the expanded exact-artifact design above: prebuilt file upload/creation and provider file-tree evidence replace gitSource as the deployment binding. Keep normalized QUEUED→queued, INITIALIZING/BUILDING→building, READY→ready, ERROR/BLOCKED→failed and CANCELED→canceled; missing/unknown states fail closed. Historical tests/reviews remain dated evidence, not acceptance of the new transport.

Preflight GET /v9/projects/{id} validates fixed id/name/accountId, rootDirectory apps/api, framework nestjs, nodeVersion24.x and exact linked GitHub repo/main/repoId. No missing link/settings assumptions. Validate project domain through GET /v9/projects/{id}/domains/api.lovora.us: same name/project, verified true, no redirect/custom environment/branch override. Real missing settings/domain is an explicit preflight failure, not automatic setup.

After same-revision READY, GET /v4/aliases/api.lovora.us (project/scope query) must bind the exact project and deployment ID, without redirects/deletion/microfrontend routing. Repeat binding and deployment inspection around safe HTTP smoke so an older deployment responding200 cannot satisfy release. Verify authorized live/ready body, generic denied access, authorized unknown404 and exact-origin OPTIONS over TLS with redirect:error. Provider token is sent only to fixed api.vercel.com; preview key only to fixed api.lovora.us. A valid alias is association evidence, not a replacement for actual TLS/HTTP checks.

Known terminal deployment failure after committed migration remains a separate failed release, never automatic DB rollback. Unknown/mismatched identity, queued/building timeout, cancellation or failed domain verification retains the lock for explicit reconciliation; no silent unlock/retry. A stale old API can degrade against newer full history; compatibility/forward-fix remains an owner release concern.

## Native artifact and local verification — T053/T054

Run affected existing config/HTTP/offline/release tests under cached Node24.22.1, with no dependency operation. Extend consumer-visible boundary cases, not copies/wiring assertions. Synthetic provider transport must never fall through to real fetch; deny outbound except loopback for relevant subprocesses. Keep compiled TLS fixtures remapping both pg connectionParameters and cached host/port/user plus non-loopback socket rejection; preserve the earlier failure disclosure verbatim.

Use only exact standalone55432 for destructive/random DB release fixtures. Both Supabase-local and standalone volumes and FE previews remain intact. Exercise changed CLI default/status and real local HTTP path separately from tests, remove only owned temporary fixtures/processes. Retain distinct command results, no invented aggregate suite.

Historical no-settings attempt returned project_settings_required; the later relevant-field metadata experiment and unused_function/non-bootstrapping-handler failures are preserved above. The owner now authorizes isolated public native builds and app-owned final assembly under T061–T068. Record raw versus final ESM/decorator/manifest/cancellation evidence and metadata/platform limits; do not infer real Vercel duration/termination enforcement or hosted completion.

## Hosted custom-domain setup and acceptance — T048

Required api.lovora.us remains on the existing BE project. The dated2026-10-28 DNS observation is NXDOMAIN and GoDaddy ns37/ns38; recheck only during approved external execution. Owner obtains exact Vercel-provided api-only DNS requirements after adding that domain to the actual BE project. Do not invent a generic CNAME/IP, copy FE records or change root/app/mail/nameservers/unrelated DNS. Verify project domain, certificate and alias→exact approved deployment before claiming completion; provider URL success is insufficient.

Complete real target/schema/TLS/privilege preflight and separately approved versioned migration/release; the release adapter never creates domain records. Verify safe authorized live/ready, denied/malformed keys, unknown404 and CORS through https://api.lovora.us backed by Supabase cloud. Preserve app.lovora.us and do not run destructive/failure/load suites on shared cloud. README owns the single remaining owner checklist, including initial setup ordering when a domain has no deployment yet.

## Coverage and dependency order

| Requirements | Task coverage |
| --- | --- |
| FR-001–004 | Existing T001–T013/T037–T040, Vercel T050/T053 |
| FR-005–006 | T004/T050 contract; separately coordinated FE T014–T016 |
| FR-007–008 | Existing T007/T018/T036/T041/T044; T049/T055/T056 |
| FR-009–012 | T050/T052–T054; actual T020/T027–T031 |
| FR-013 | T051/T053 conversion; historical T032–T036 |
| FR-014 | Existing T042–T044 retained; T052/T053 release |
| FR-015 | T050/T053, actual T030/T048 |
| FR-016–017 | T052/T053 domain identity; actual T020/T029/T030/T048 |

Order: T049 complete alignment/read-only consistency → T050 runtime + T051 conversion + T052 adapter (one writer) → T053 affected checks/smoke → T055 coordinator review → T056 docs closeout. T054 remains separately PENDING when genuine native prerequisites are unavailable. Actual external gates and FE B are not silently completed. No arbitrary research agents, new tracker/spec, setup regeneration, reviewer spawn, Git mutation or external action.

Official references: [native NestJS](https://vercel.com/docs/frameworks/backend/nestjs), [create deployment](https://vercel.com/docs/rest-api/deployments/create-a-new-deployment), [get deployment](https://vercel.com/docs/rest-api/deployments/get-a-deployment-by-id-or-url), [project](https://vercel.com/docs/rest-api/projects/find-a-project-by-id-or-name), [project domain](https://vercel.com/docs/rest-api/projects/get-a-project-domain), [alias binding](https://vercel.com/docs/rest-api/aliases/get-an-alias), [Git deployment control](https://vercel.com/docs/project-configuration/git-configuration), [deployment protection](https://vercel.com/docs/deployment-protection), [machine-readable schema](https://vercel.com/openapi.json).

## Vercel adaptation execution — 2026-10-29

Plan-first gate: installed prerequisites with --require-spec --require-tasks --include-tasks, setup-plan and setup-tasks completed using command-local feature001/no-persist. Existing templates were not overwritten and no shared pointer changed. Read-only consistency after active-document alignment found no blocking contradiction or constitution conflict; FR001–017 have mapped tasks, all56 IDs are unique and original38 completed rows remain historical. SC001/003/008 retain local coverage, SC002/004 remain FE gates, SC005/009 external, SC006 native T054, SC007 conversion and SC010 normalized release. No new task is unmapped. Source/contract cutover follows this gate, not before it.

Native T054 remains PENDING: genuine project settings unavailable under no-provider-read/no-install authorization. The existing project_settings_required attempt is not rerun or relabeled success. New T055 review completed separately from A+C. No actual private input/cloud/publication operation is permitted. OMP's pre-edit in-memory snapshot was lost when the tool runtime reset; the independent coordinator-confirmed pre-plan disk comparisons recorded below provide preservation evidence without claiming a computation from that lost snapshot.

### Implemented source and actual checks

T050–T053 completed locally. Local/vercel-only config rejects retired provider fields; Vercel bearer covers controllers and unknown routes before DB, with strict safe OPTIONS. Existing attachDatabasePool/Session TLS/max2/deadlines remain. Sole OpenAPI0.3.0 and BE types updated; FE generation unchanged. Pure vercelConfiguration plus explicit hidden-TTY prepare-vercel-config writes only separate Vercel outputs; old active password-entry CLI is removed, terminal helper retained. Normalized Vercel adapter validates provider gitSource/project/owner/production target, exact project settings and verified domain/alias identity before and after safe smoke. Release keeps migration-first ordering and uncertainty locks; vercel.json disables automatic Git deployment.

All commands ran from repository root with cached Node24.22.1 (`/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin` prepended to PATH), without installing or mutating installed dependencies:

- `npm run codegen --workspace=@esty-admin/api && npm run check --workspace=@esty-admin/api`: generation/drift/manifest/typecheck/build passed. Tests26/27: config9/9, HTTP4/4, offline8/8; one provider test failed because its synthetic alias counter incremented only when an optional override existed. This was test-fixture bookkeeping, not missing adapter calls. Fixed the counter and added Unicode-control rejection coverage.
- `npm run build --workspace=@esty-admin/api && node --test apps/api/build/tests/release.test.js apps/api/tests/hosted-config.test.mjs`:14/14 passed, including exact source/project/owner/target, metadata-only refusal, state mapping, stale/changed alias, unsafe smoke, conversion separation/permissions/no-overwrite/partial cleanup and actual owner-confirmation/cancel PTY restoration. No redundant full-suite rerun is claimed.
- `node apps/api/scripts/stage-operator.mjs`: staged existing156-package runtime closure in ignored build output; no dependency install or installed-tree mutation.
- `/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))' env TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local node --test --test-name-pattern='release serialization|compiled Vercel' apps/api/build/tests/integration.test.js`:14/14 passed. Twelve release scenarios cover migration failure/no deploy, known deploy failure, queued timeout, wrong commit/project, changed ID, domain failure, provider cancellation, local cancellation, timeout, success and lock serialization. Persisted reports agree with DB outcome/lock retention. Copied Vercel-mode package used full pg field remapping, socket refusal and outbound sandbox to prove TLS/readiness/guard/process exit outside cwd; **not genuine native artifact acceptance**.
- Actual safe CLI commands `npm run config:prepare --workspace=@esty-admin/api` and `npm run release:approved --workspace=@esty-admin/api` exited0 with OWNER_INPUT_PENDING and RELEASE_APPROVAL_REQUIRED. No real private directory/file read/write or provider/SQL/Git operation.
- Separate throwaway `node --input-type=module -e` smoke under the same outbound sandbox ran createApplication with Vercel composition and explicit synthetic loopback DB transport. An owned random database on55432 was migrated, then three owned app instances observed ready200→503(database_unavailable via loopback port1)→200, live200/denied401/OPTIONS204/authorized unknown404 throughout; observed total request-series times38/6/15ms. This is application behavior, not cloud TLS/native/cold-start proof.

New failure disclosure: the first smoke assumed foundation_local already held application history and got503 instead of200. Subsequent read-only to_regclass diagnosis proved the base history absent; no base schema was changed. The replacement throwaway script initially had an import nested inside try and failed parsing before any DB action. Corrected imports plus an owned migrated disposable database produced the results above; all owned resources were closed/dropped in finally. These are distinct attempts, not an invented first-pass/full-suite success.

Cleanup/limits: remaining foundation_test_* databases=0; test-owned files, PTYs and processes closed/removed, no throwaway script file written. Existing standalone55432 and Supabase-local54322 volumes were not stopped/reset/removed. Root package/lock/ignore/pointer hashes match pre-source capture. Final read-only Git check confirmed main@d286335 and empty index; no mutation/publication. No actual owner private/auth/cache, account/provider API, remote SQL, DNS/deployment or paid operation occurred. Old active Render adapter/entrypoint references are absent from API source/tests/contract. The source handoff stopped at READY_FOR_REVIEW with writes PAUSED; the coordinator subsequently completed T055 and authorized only T056 documentation closeout below. T054/actual hosted/FE/Hobby gates remain pending.

### New Vercel review and documentation closeout — T055/T056

Coordinator verified actual gpt-6-luna runtime availability with REVIEW_MODEL_READY and completed exactly one independent read-only review, session01a186d0-f5ff-7a80-9210-aaf9cb2a8d40, exit0. OMP read /private/tmp/esty-vercel-review-result.txt: “No confirmed actionable findings in the scoped Vercel adaptation.” Reviewer made no edits and ran no tests/build/provider calls. No confirmed source fix or affected/full-suite rerun is needed; this closeout preserves all current source and all distinct earlier check/failure records. Review explicitly does not prove genuine native T054, live project settings, Supabase cloud behavior or api.lovora.us domain/deployment binding.

Coordinator-confirmed disk checks: /private/tmp/esty-vercel-correction-baseline.json exists independently of the lost OMP in-memory snapshot; all55 protected root/FE public files equal its pre-plan SHA values. README FE003 protected section and PROJECT_STATE FE003 tail match /private/tmp/esty-vercel-before-README.md and /private/tmp/esty-vercel-before-PROJECT_STATE.md. Coordinator confirmed empty index and clean git diff --check. These checks are attributed to the coordinator, not rerun or misrepresented as OMP's lost-snapshot proof.

T056 is limited to current review-status/evidence synchronization in the existing authorized documentation under the fresh FE docs lease. README retains the single Vercel-only owner checklist; publication needs a separate request, owner-only conversion preserves real originals, and actual project/native/eligibility/private credentials/settings/DB migration/release/domain/DNS/TLS/HTTP gates remain open. No source/runtime/test/build/install/Git/private/auth/cache/cloud action or new reviewer is part of closeout. Coordinator returns the lease and final receipt after STOP WRITES.

T056 documentation checks passed:10 authorized documents have balanced fences/no trailing whitespace;47 local file links resolve;56 task IDs are unique/sequential. All original T001–T048 rows, historical A+C/Render/old-Luna/failure evidence and FE protected sections match this closeout's documentation baseline. Nine documents changed; data-model.md is intentionally unchanged because no review-status field is affected. One active Vercel-only owner checklist remains at README.md:349. Final task state45 complete/11 pending: T014–T016, T020, T027–T031, T048, T054. READY_FOR_OWNER_MANUAL_ACTIONS; STOP WRITES. No new source fix or affected/full-suite rerun; coordinator returns the lease and final receipt.



## Source/local execution — 2026-10-28

Authorization: the owner explicitly resumed A and C source/local work in this existing OMP pane as sole writer, without waiting for FE increment B. Initial read-only Git inspection showed main@d286335, exactly ten unstaged planning documents and no staged changes. Those planning changes were retained; AGENTS, architecture, root package/lock/ignore and shared feature pointer were not edited. A current explicit FE pause receipt granted only narrow README/PROJECT_STATE updates; all FE003 evidence/T013 pending/preview/gallery content is protected. No install, reviewer, Git mutation, actual private credential input/read, provider setup or DNS operation was performed by this increment.

### Implemented decisions

- Pinned CLI2.122.0 was inspected through an empty temporary HOME/config context, not the authenticated cloud launcher. Docker29.4.0 reported9435414528 bytes available. `apps/api/supabase/config.toml` identifies only `esty-admin-local`; supported migration replay/seed flags are disabled. The wrapper permits only start/status/stop, clears inherited provider/project/profile/PG overrides, uses a dedicated bridge with `host_binding_ipv4=127.0.0.1` and checks actual published ports. The minimal supported stack is PostgreSQL-only: `public.ecr.aws/supabase/postgres:17.11.0.006`, healthy,127.0.0.1:54322. Gateway54321/Studio54323 and other services are disabled, not claimed running. Its state files are ignored by an API-owned nested ignore file. The original esty-admin-be55432 fixture and all volumes remain preserved.
- Migration status uses an explicit read-only transaction and never initializes history. The v9 custom `.mjs` loader marks the allowlisted version before action generation and preserves it through SQL execution; a connected-client observer records BEGIN/COMMIT/ROLLBACK acknowledgements without forwarding SQL/driver logs. Runner advisory locking/order/single transaction remain; `noTransaction` is refused. Reports distinguish attempted/committed/rolled_back/not_started/unknown, verify before/after history and keep report-writing separate from DB outcome. Packaged status includes its complete report/private-file/cancellation closure. Historic DB checksum tamper detection is not claimed.
- Offline public metadata contains the exact approved Session tuple. Dependency-free helper validates raw-password Unicode/reserved-character encoding and separation, defaults to OWNER_INPUT_PENDING without private output, and supports only later hidden owner TTY entry. It creates separate0700/0600/no-overwrite runtime/operator outputs and an independent preview key only during owner entry; operator confirmations remain absent. Tests create only synthetic temporary files, including real PTY hidden entry/cancel and restoration. No actual `.openai/private/backend` files were created or inspected.
- Render mode requires the real `RENDER=true` marker and PORT, loads only explicit environment, binds0.0.0.0, validates exact approved Session/TLS values, uses max2 pooling and persistent-process SIGINT/SIGTERM cleanup. Local/Vercel behavior remains verified. The separate64hex preview guard rejects invalid access before connection work on every non-preflight route; exact-origin GET/Authorization OPTIONS is data-free. Sole OpenAPI now documents conditional preview security/401 and generated BE types were regenerated; FE was not generated or changed.
- Owner-invoked release source validates exact clean main/repository/commit/manifest and separate operator/deploy files. One local run lock covers checks, status, migration, reporting, provider preflight/deploy and same-commit completion/domain smoke. It uses the documented Render API create/retrieve-deploy interfaces, not a secret deploy-hook URL or Git-push automation. Provider preflight requires the exact repository/root/build/start commands, Free/one-instance/node/region and auto-deploy Off.202/unknown identity/cancellation/timeouts are not success; uncertain outcomes keep the lock for explicit owner reconciliation. Known committed DB plus failed deploy is reported, never rolled back automatically. Account billing/Node settings and actual domain/provider proof remain owner execution gates.

### Actual commands and observed results

All Node/npm commands below used cached Node24.22.1 at `/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin`; no executable/dependency installation occurred. Environment values shown are synthetic local fixtures, not private credentials.

| Command / scenario | Observed result |
| --- | --- |
| `node apps/api/scripts/supabase-local.mjs start` | Exit0 in53.26s; unique DB-only project healthy and actual binding127.0.0.1:54322. CLI may fetch its pinned Docker image; no app migration on stack start. |
| `npm run stage:operator --workspace=@esty-admin/api`; `docker compose -f apps/api/compose.yaml up -d --wait` | Exit0; API manifest/build and156 runtime-package staging; only the existing standalone fixture was started for destructive tests. |
| `TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local SUPABASE_LOCAL_TEST_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres node --test apps/api/build/tests/integration.test.js apps/api/build/tests/supabase-local.test.js` |16/16 reported checks passed in11.77s. Supabase-local applied1 then0; actual live/ready200, client-only failure503 and recovery200. Fixture tests verified both action/SQL exact failed-version attribution, rollback, status-without-initialization and committed/report-write failure distinction. |
| `npm run supabase:stop --workspace=@esty-admin/api`; `npm run supabase:start --workspace=@esty-admin/api`; synthetic DATABASE_URL + `node apps/api/build/scripts/migration-status.js` | Exit0 in14.95s; only local project stopped/restarted, history still exactly1792972800000-foundation, pending/unexpected empty. Volumes/history retained. |
| `npm run codegen --workspace=@esty-admin/api`; `npm run check --workspace=@esty-admin/api` | Exit0 in7.88s; sole contract regenerated, codegen/manifest drift/typecheck/build passed and22/22 config/HTTP/release-boundary/offline checks passed. |
| `node apps/api/scripts/stage-operator.mjs`; fixture `node --test --test-name-pattern='portable operator\|compiled Render\|release serialization\|read-only status\|report-write' apps/api/build/tests/integration.test.js` | First new artifact pass:13 passed/1 failed; copied status/report/migration commands and release cases passed, Render readiness503 exposed the transport-fixture issue below. Not recorded as a pass. |
| `npm run stage:operator --workspace=@esty-admin/api`; fixture `node --test --test-name-pattern='compiled Render\|release serialization\|cancelled migration' apps/api/build/tests/integration.test.js`; `node --test apps/api/tests/hosted-config.test.mjs` | Exit0 in8.70s: corrected targeted integration11/11 and offline5/5. Actual compiled Render main ran outside repo cwd, denied before DB, reached real local TLS/history, returned authorized readiness200/unknown404 and stopped on SIGTERM. Release cases include rollback-blocked deploy, committed-DB/deploy failure, queued, wrong commit, cancellation, timeout, success and competing lock. |
| `node --test --test-name-pattern='private reads\|terminal output failure' apps/api/tests/hosted-config.test.mjs` |2/2 passed; no directory creation on missing private read,0600/symlink enforcement and raw terminal restoration even when output fails. These extend the existing offline suite; no claim of one later24-test full check run. |
| `npm run build --workspace=@esty-admin/api`; fixture `node --test --test-name-pattern='release serialization' apps/api/build/tests/integration.test.js` | Final affected release check9/9 passed in4.08s after ordering lock cleanup before final report persistence; tests consume persisted reports and verify their lock state against the actual filesystem. Unaffected passing suites were not rerun. |
| `npm run supabase:status --workspace=@esty-admin/api`; `node apps/api/scripts/prepare-hosted-config.mjs`; `node apps/api/build/scripts/release.js`; synthetic Supabase-local DATABASE_URL + `node apps/api/build/scripts/migrate.js` | Exit0: sanitized healthy status, OWNER_INPUT_PENDING, RELEASE_APPROVAL_REQUIRED/no external action, migration0 applied/committed/report written. Actual safe report is `.openai/reports/migrations/23eecf8d-f2d0-4070-b461-4dd8b08c6468.json`. |

Separate throwaway staged-process smoke, not just test assertions: three owned compiled API processes ran from OS temp cwd against actual Supabase local, a passive loopback failure peer, then restored local configuration. Observed live200 throughout; ready20025.93ms → ready503/database_timeout1008.64ms → ready20012.90ms. Each child stopped and the passive peer closed; no temporary script or shared database mutation. This is a client-config restart recovery check, not interruption of Supabase system services.

### Failures, isolation correction and cleanup

Initial offline tests exposed two issues: physical temp paths were needed because macOS `/var` is a symlink (the helper correctly rejects symlink ancestors), and initially non-flowing TTY input had to be paused again to let the process exit. Fixed fixtures/input-state restoration; actual PTY accept/cancel tests subsequently passed. A temporary edit syntax error was corrected before build; no affected broken code was run.

The first Render artifact fixture changed only `connectionParameters`, while pg.Client8.23.1 copies host/port/user fields. That failed ready503 run did not establish loopback isolation: an outbound attempt to the public Session hostname cannot be excluded. Only synthetic credentials were present; no real credentials, provider call or successful hosted SQL/DDL is claimed. The coordinator was notified. The fixture now updates both field sets, rejects every non-loopback socket and runs the macOS child under a deny-outbound-except-loopback sandbox. The corrected actual TLS/HTTP/artifact/shutdown check passed. No hosted success is inferred from either run.

Temporary schema-inspection workdir, synthetic private/TLS fixtures, random test databases, copied artifacts and test/smoke children were removed by their owned cleanup paths. The two authorized local database stacks/volumes remain available; no unrelated Docker service, host DB, FE process/build or authenticated profile was stopped or changed. No `down -v`, reset, remote migration, real owner secret input or deployment was run.

Final documentation checks passed: eight Markdown files,40 resolving local file links, balanced fences/no trailing whitespace, four parsed JSON files and48 sequential unique task IDs (36 complete;12 explicitly open). Read-only `git diff --cached --quiet` succeeded: index remains empty. No source/runtime change followed the last successful affected release test; documentation-only closeout did not rerun unaffected suites.

### Review and owner boundary

READY_FOR_OWNER_MANUAL_ACTIONS: the coordinator verified gpt-6-luna runtime availability (REVIEW_MODEL_READY) and completed one independent read-only combined A+C review, session `01a181cd-ca5d-7771-b349-34c0801402ca`, exit0. Result at `/private/tmp/esty-be-ac-review-result.txt`: “No confirmed actionable findings.” The reviewer inspected actual tracked and untracked API source/tests (excluding generated/ignored build state), the sole OpenAPI contract and relevant evidence. No reviewer edits, tests/builds or cloud operations occurred; no source fix or redundant rerun was needed. T035/T044 are complete; historical T026 is retained separately.

This docs-only closeout retains each historical run as distinct evidence and preserves the first failed synthetic Render fixture's possible outbound attempt disclosure. Actual hosted SQL, Render deployment, DNS/TLS and api.lovora.us behavior remain unverified. Required T020/T027–T031/T048 and FE T014–T016 stay open; source publication and actual private input/external operations require separate authorization. No new reviewer, source/runtime/install/private-file/Git mutation or cloud action was initiated. Coordinator returns the existing FE docs lease after closeout.

Docs-only review closeout checks passed: seven Markdown files,40 resolving local file links, balanced fences/no trailing whitespace and48 unique sequential task IDs (38 complete;10 open). Only T035/T044 changed completion state. README changed only its current BE review-status line and checklist item1; PROJECT_STATE changed only its current BE review paragraph. Byte comparisons preserved FE003/T013/preview/gallery sections, every prior execution-result block and the outbound-attempt disclosure. The single remaining manual-actions list and external/FE gates remain intact. Read-only `git diff --cached --quiet` returned success (INDEX_EMPTY). The temporary documentation checker initially had a Python bytes-literal syntax error; corrected before the successful check, with no repository mutation from that failed invocation. No application test/build or runtime operation was repeated.

README owns the single [remaining manual-actions list](../../README.md#remaining-manual-actions--one-owner-checklist), exact commands and private file locations. Do not duplicate secret-entry/provider/DNS instructions here. Final required hosted target remains https://api.lovora.us backed by existing Supabase cloud, not local Docker or provider-only proof.

Provider source references inspected without account/API execution: [create deploy](https://api-docs.render.com/reference/create-deploy), [retrieve deploy](https://api-docs.render.com/reference/retrieve-deploy) and [retrieve service](https://api-docs.render.com/reference/retrieve-service). Source checks do not verify account eligibility, actual service settings, private keys, database privileges or DNS/TLS.

## Historical execution evidence — retained verbatim

The following dated results refer to completed earlier increments. Earlier pending/deferred/Git statements inside those records describe their date, not current execution instructions. Native Vercel artifact proof was never completed and is not needed for the selected Render path. No new setup/report/Render/FE acceptance is inferred from these historical results.



## Local verification evidence — 2026-10-26

- The command-local feature prerequisite helper resolved feature 001 and its tasks; no pointer changed. No checklists or extension hooks were present. Cached Node `24.22.1` was executed directly from `/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin/node`.
- Source-only leases authorized additive `apps/api` workspace/scripts, API build ignore and scoped AGENTS/architecture notes. A later install lease authorized exactly `npm install --workspace=@esty-admin/api --ignore-scripts` with that Node directory prepended to PATH. It exited 0, added 134 packages in 83.98s and emitted a workspace-discovery warning; the API link and all direct versions were subsequently verified by `npm ls --workspace=@esty-admin/api --depth=0`. No second install, ci, prune or FE command ran.
- Authorized lock inspection against the pre-FE-publication baseline found 135 new entries, zero removed entries and zero existing package version changes. The existing `apps/web` entry was unchanged; shared dev/devOptional/peer flags reflect new backend dependency reachability. The install/lock lease was explicitly returned before checks.
- The official PostgreSQL pull first exceeded 180s; resumed quiet Compose startup succeeded in 24.64s. Compose reported healthy; actual `psql SELECT version()` returned PostgreSQL 17.11/aarch64. Digest: `postgres@sha256:b8faeff7712663c2773a190181e1246e37e364b887611c04658c28b44e2408fe`. Only project `esty-admin-be`, loopback 55432 and synthetic credentials were used.
- `npm run api:codegen` generated the checked-in types from the authoritative contract. Repeated `npm run api:codegen:check` executions matched byte-for-byte, including the final drift check. `npm run api:check` passed codegen drift, typecheck, tsc build and **7/7** config/real-HTTP tests. An initial compile exposed environment/assertion type mismatches; these were fixed before successful checks.
- Failure-before/fix-after: initial pressure tests exposed pg-pool replacement connections for expiring queued waiters. Explicit four-client admission now fails saturation immediately; actual silent connections still time out, all pool clients/waiters and peer sockets drain, and repeated rounds pass. The silent test server consumes incoming bytes without replying so FIN/close is observable. Shutdown/disconnect and real DB-down HTTP are also covered.
- `TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local npm run api:test:integration` passed **5/5** real PostgreSQL/HTTP tests: migration twice/fresh readiness/recovery, pool pressure and blocked SQL, independent 3-second deadline/client destruction, whole-batch rollback and later failed/pending migration detection. The last test's initial corrected-file retry encountered the v9 loader's module cache; using a separate corrected release fixture path proved recovery without bypassing the failure.
- A final config-test refinement replaces incidental configuration-object equality with credential/database URL decoding. A new real-connection subprocess proves exported application settings override conflicting PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE/PGSSLMODE/PGOPTIONS. `npm run api:build` and `node --test --test-name-pattern='PostgreSQL URL|real connection' apps/api/build/tests/config.test.js apps/api/build/tests/integration.test.js` (Node 24 and the same TEST_DATABASE_URL) passed **2/2** affected tests. The final suite contains 7 config/HTTP and 6 integration scenarios; the unaffected passing tests were not rerun after this test-only refinement.
- Separate compiled-program smoke launched `apps/api/build/src/main.js` on loopback 3001 with a randomized disposable database. Actual HTTP showed live=200, pre-migration ready=503/migrations_pending (33.84ms); the compiled migration CLI printed 1 applied then 0 applied, and ready became 200 (3.00ms). Stopping only the Compose postgres service kept live=200 and returned ready=503/database_unavailable (10.86ms). Restarting the dependency restored ready=200 (27.88ms) without restarting the API. SQL confirmed only `public.foundation_migrations` as a user table.
- Both BE smoke processes were stopped, the disposable smoke database was dropped, and the cleanup query found no remaining foundation_test_* databases at that checkpoint. Integration fixtures clean their own random databases. The healthy Compose fixture and named volume remain available; no down -v/reset, host DB or cloud access occurred.
- README BE hunks landed during the initial docs lease. Shared docs were then returned for the owner-approved FE-only publication; the coordinator confirms 20 FE files pushed to main@6c64eaa, an empty index and preserved BE README hunks. All writes paused during review. The renewed docs-only lease records PROJECT_STATE evidence and review completion, then returns to the coordinator at handoff. No BE Git mutation/publication occurred.

Local closeout: T001–T013 and T017–T018 complete; coordinator-reported gpt-6-luna review has no confirmed actionable findings. BE source remains uncommitted. Remaining feature work is the later FE-owned generated client, connectivity screen and browser journey (T014–T016), requiring coordinated authorization. No hosted Supabase, Cloud Run, Etsy/supplier, full feature acceptance or production approval is claimed.

Documentation closeout checks passed: six Markdown files, 19 local file links, five parsed JSON files, 12 consistent scoped root scripts and 18 task IDs with only T014–T016 pending. FE correction evidence was preserved byte-for-byte against HEAD; scoped git diff --check passed. Only documentation changed after the clean read-only review; no redundant runtime checks ran.

## Code-first execution evidence — local checks complete

- Read-only prerequisite check resolved feature001 with `SPECIFY_FEATURE_NO_PERSIST=1`; no extension hooks/checklists were present. No language server is configured, so affected exported callsites were inspected directly. Root package.json and the shared feature pointer are not edited.
- Native-build attempt: used isolated CLI65.4.0 under cached Node24.22.1, a temporary public-source copy and empty HOME/global-config. macOS `sandbox-exec` denied all network access; telemetry was disabled and no inherited provider credentials were passed. `build --help` succeeded. `build --non-interactive --global-config <empty temporary directory> --cwd <temporary API copy>` exited1 with **`project_settings_required`**: “No project settings found locally. Run pull to retrieve them, or re-run with --yes to pull automatically.” Neither pull nor --yes was run. Temporary files were removed. Native artifact/hosted verification remains pending, not a tsc pass.
- Installation: after both FE dependency-HOLD receipts and the owner's explicit final START via Ask, ran exactly `env PATH="/Users/khuonghuyhieu/.npm/_npx/ef8b185be06dfeb4/node_modules/node/bin:$PATH" npm install --workspace=@esty-admin/api --ignore-scripts`. Exit0 in2.91s, 19 packages added. Immediate pre/post lock inspection: 19 new entries, zero removed entries, zero existing package-version changes; apps/web lock entry, root package.json and shared feature pointer unchanged. Exact runtime dependency is @vercel/functions3.10.4. No ci/prune/global install or FE output mutation. Window return was recorded to FE coordinator/notification before BE tests; the initial direct OMP delivery was rejected as blocked, then the owner authorized a direct handback and that prompt was delivered successfully. No approval dialog was answered.
- `npm run api:check` under cached Node24.22.1 exited0 in6.03s: OpenAPI and migration-manifest drift checks, typecheck, clean API-only tsc build and **11/11 config/HTTP tests** passed. Existing HTTP cases retain real silent sockets, pressure, disconnect and shutdown. New config cases cover exact Session target/role/ref/port boundaries, hosted marker/binding, safe errors, separate confirmed migration mode, manifest drift and cwd-independent local/hosted env behavior.
- `TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local npm run api:test:integration` with the same Node24 PATH exited0 in15.33s. Operator staging included156 installed runtime dependency packages. **11/11 reported checks passed** (eight top-level cases plus three TLS subtests): prior real PostgreSQL migration/rollback/timeout/recovery cases, actual pg TLS trusted/untrusted/wrong-host verification over loopback, hosted two-slot admission/reuse/cancellation/idle cleanup, and copied standalone artifact migration twice/asset-drift refusal/compiled HTTP startup outside repo cwd. Synthetic certs, temporary artifacts and random test databases were cleaned by tests. No real Supabase host was resolved/contacted.
- Separate throwaway smoke launched the staged compiled API from the OS temp cwd with only synthetic settings and a randomized database on the authorized fixture. HTTP before migration:503/migrations_pending (39.26ms); staged CLI applied1 then0; ready200 (4.35ms). Disabling connections only to that disposable database gave ready503/database_unavailable (10.17ms), while live stayed200 (0.83ms). Restoring it gave ready200 (7.22ms) without restarting the API. The child was stopped and only its random database removed; Compose volume/host DB were untouched.
- No source changes followed the successful checks/smoke and no redundant full-suite rerun was initiated. T021–T024 are complete; T025's native portion, T020 and all T027–T030 external work remain pending. The coordinator subsequently completed T026, recorded below. After FE returned a short documentation window, README/PROJECT_STATE received the owner guide and actual evidence; boundary checks preserved FE/application003 and historical evidence blocks byte-for-byte, and the files were explicitly returned to FE.
- Final documentation checks passed: eight BE-owned Markdown files,14 resolving local links, balanced fences/no trailing whitespace,31 sequential task IDs (20 complete; external/native/review/full-feature tasks intentionally open) and four parsed JSON files. Root package.json and shared feature pointer remain byte-identical to the immediate preinstall baseline. No implementation completion hooks exist. README/PROJECT_STATE boundary checks and handback were completed separately before FE resumed ownership.

## Separate review closeout — T026

The coordinator reports one completed Codex **gpt-6-luna**, read-only review of T021–T025 and their checks, session **`01a17c65-9fda-7fd1-8e74-344facca83c2`**: **no confirmed actionable findings**. The reviewer made no edits and reran no tests/builds. No code fix or additional suite run was needed. This closeout updates documentation only; it does not repeat implementation or verification.

T026 is complete. Native Vercel artifact/ESM/decorator/cancellation proof, real Supabase connectivity/migration and protected HTTPS/access remain pending exactly as before. The existing local checks and separate smoke remain the actual execution evidence; review is not hosted or production approval.

## External setup preparation — 2026-10-27

After the owner requested assistant-operated setup, the coordinator used the existing isolated personal CLIs; no additional MCP, package installation or company profile changes were needed. The published BE source is commit `8558e33`, successfully pushed to origin/main from `b370578`; FE003 remained unstaged and preserved.

- Supabase CLI2.122.0 authenticated outside the sandbox and confirmed the existing `eotmpaliqcxxcotrcols` / Esty Fulfillments project ACTIVE_HEALTHY, Seoul, PostgreSQL17.11.0.003. No database credential was retrieved, SQL run, password reset or migration applied.
- Vercel CLI65.4.0 confirmed personal user `khuonghuyhieu0705` and scope `khuonghuyhieu0705s-projects`. Existing projects were esty-admin and portfolio. It then created only `esty-admin-api` (`prj_uITHKLUGGE98VxrEcs5FoktBbcls`) and configured framework `nestjs`, rootDirectory `apps/api`, nodeVersion `24.x`. No Git integration, deployment, billing or existing-project mutation was performed.
- The new BE project's protection read returned ssoProtection.deploymentType `all_except_custom_domains` and gitForkProtection true. This is configuration evidence, not an anonymous-denial or actual tester-access test. No custom domain was configured. Current official Vercel Authentication docs state Hobby allows one external access-request user; wider tester access still requires an explicit access choice, without automatically purchasing a plan or enabling a bypass.
- Supabase Session metadata and a privately supplied DB password remain missing. The owner was asked for a password-redacted Connect Session string; no existing credential files were inventoried or printed. Native build, real DB preflight/migrations, protected HTTPS and failure/recovery acceptance remain pending. T020 is partially prepared, not complete; T025/T027–T031 external gates and T014–T016 remain open.
- No root/shared-document lease was used during this preparation; README/PROJECT_STATE and FE003 were left unchanged. No application source, dependency, test/build, Git index/commit/push or preview operation occurred. The CLI metadata/setup calls do not establish deployment compatibility.

Official references checked: [Vercel NestJS](https://vercel.com/docs/frameworks/backend/nestjs), [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication), [Supabase PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres).
