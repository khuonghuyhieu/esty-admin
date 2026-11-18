# Tasks: Existing Etsy Connectivity

## Accepted scoped recipient bridge review

**FROZEN BE_RECIPIENT_BRIDGE_SOURCE_LOCAL_REVIEW_ACCEPTED; STOP WRITES.** Coordinator t151 accepted t175's actual final: **no confirmed actionable findings in this frozen bridge scope**; no reviewer checks or prior-feature reassessment. T040–T043 retain their source/local execution and cleanup evidence, now with this separate scoped acceptance. All earlier task identities/checkmarks and review/failure snapshots remain unchanged.

This fresh five-document closeout changes no source or execution evidence. Preserve FE17/18 plus affected1/1 and earlier actual0066/8/role-change503, cause unconfirmed. Source135/canonical/types remain frozen. t151 reports the reviewed canonical handshake delivered to FE/root; downstream generation/review is not inferred. Root owns serial integration/release. Ownership returns to t151; STOP WRITES.

## Accepted scoped lookup review

**FROZEN BE_LOOKUP_SOURCE_LOCAL_REVIEW_ACCEPTED; STOP WRITES.** t151 accepted t175's actual FIX-ONLY final: **original lookup P3 resolved; no further confirmed findings in FIX-ONLY**. Original lookup review remains one confirmed P3, separate from Auth/prune/packaging history. The reviewer ran no checks or broader review. T037–T039 source/local implementation and independent scoped review are accepted; no overall feature, hosted or release completion is inferred.

This closeout updates only five existing010 documents and preserves source426d2567/canonicalbe9a6e76/generated75429df8 identities; no checks/build/runtime/Git action reran. Root owns serial integration. Recipient bridge stays **PROPOSAL ONLY/no source grant**; FE compatibility, exact artifact/secure bindings and hosted/provider/deployment gates remain separate. Ownership returns to t151.

All prior task IDs/checkmarks, freeze statements, failures and review blocks below remain historical snapshots; earlier pending-review statuses do not override this accepted receipt.

## Current lookup schema review correction

**FROZEN READY_FOR_BE_LOOKUP_SCHEMA_FIX_REVIEW; STOP WRITES.** The coordinator recovered the original lookup review as one confirmed P3 canonical int64-pattern gap, with no other confirmed actionable findings. Two canonical string constraints and one existing-file schema boundary test are corrected locally; BE regeneration is byte-identical. Generation/check, compile and focused schema test1/1 passed. No runtime/fixture behavior changed or DB/provider/full-suite/native/staging checks reran. t151 alone requests one FIX-ONLY review. Exact before/after scope and hashes are recorded in quickstart.md and the fix manifest; hosted/FE/artifact/deployment gates remain open.

All task IDs/checkmarks and prior freeze/review/failure statements below are retained as historical evidence, not a claim that this fix has already passed review or is deployable.

**Current status:** READY_FOR_BE_SETUP_PUBLICATION. t151 accepted existing t175's actual FIX-ONLY result: original setup Auth P2 resolved, no further confirmed findings in that recheck. Original setup one-P2, historical prune and packaging reviews remain distinct. Docs-only closeout retains all nine source/test hashes and135-file digest4f762865; no test/build/runtime rerun. Ownership returns to t151 for existing-branch publication; writer STOP WRITES. OWNER_INPUT_PENDING / HOSTED_NOT_RUN.
**Inputs:** [spec](spec.md), [plan](plan.md), [contracts](contracts/proposed-api.md), [data model](data-model.md), [validation](quickstart.md).

T001–T026 retain their original identities/checkmarks but their proposed contents/order are amended for the current layered direction. Original U1 resolution/hashes remain historical in the handoff, not a hash claim for this amendment. No task is completed by documentation.

## Layer1

- [x] T001 Record owner decisions, supplied D1/D2/login/app-access facts and exact source/canonical/FE ownership in plan.md. Current grant authorizes sequential BE layers1–4 with a Layer1 self-check, then frozen coordinator review; no external or FE execution. FR-017–019.

- [x] T002 Implement server-only validation and secret-free setup in config/config.ts and .env.example: disabled default, complete enabled configuration, exact origins/callback, keyring and explicit invitation TTL/retention. No secret read, setup replay or live ping. FR-007, FR-018–019.

- [x] T003 Run focused synthetic enabled/disabled/missing/malformed configuration and secret-safe diagnostics; actual commands/results in quickstart.md. Layer1 self-check passed before the already-authorized sequential continuation. FR-007, FR-019, SC-006.

## Layer2

- [x] T004 Prepare reproducible server-only upstream OpenAPI transport types/provenance/drift checks and an approved-operation client boundary. Layer2 does not modify the Lovora canonical schema or expose an arbitrary proxy. FR-006, FR-019, SC-006.

- [x] T005 Implement/test credentials.ts authenticated encryption and fixed-origin provider.ts request/response validation, exact forms/headers, precision, deadlines, bounded bodies and safe error classification. Only exchange/refresh/getMe/getShop executable. FR-006–009, FR-013–014.

## Layer3

- [x] T006 Record explicit runtime policy bounds and synthetic expected-shop/origin/TTL/retention inputs; allocate fresh owned resources. Live values, FE ingress, key/backup lifecycle and hosted privacy remain named external gates, not guessed owner decisions. FR-018, FR-020.

- [x] T007 Define Owner invitation list/create/cancel and connection status/read/disconnect capabilities in canonical OpenAPI and regenerate BE types; record exact consumer delta without editing apps/web. Preserve005/006 auth/session/CSRF. FR-002, FR-015, FR-017, FR-020–021.

- [x] T008 Add one migration/manifest for connections, invitations, OAuth attempts, encrypted credential versions, refresh attempts and cooldown/receipts. Preserve applied checksums, privileges, lock order and one history; no startup DDL or managed Auth mutation. FR-004, FR-007, FR-010–011, FR-015, FR-020.

- [x] T009 Implement Owner create/list/cancel: persist before private URL once, hashed secret, scoped cursor pagination, current authority and revision/idempotency receipts; one outstanding invitation/attempt, one shop, safe history. FR-001–002, FR-004, FR-020.

- [x] T010 Run owned isolated DB/HTTP tests for Member/foreign/demoted Owner, concurrent creates/claims, expiry/cancel/reissue, lost create response and migration apply/replay/scoped denial. Failures disclosed in quickstart.md. FR-002, FR-015–017, FR-020, SC-002.

## Layer4

- [x] T011 **BE portion only:** exact explicit same-origin bounded POST start, scoped proof and atomic claim into fresh300-second PKCE/state attempt; GET preview remains protected and side-effect-free. Fragment confirmation/inspection UI is explicitly deferred to T020; no extra public GET exception or prefix bypass. FR-004–005, FR-014, FR-020.

- [x] T012 Implement exact GET callback envelope/method/path/Host guards, denial handling, state expiry/single claim and private clean303 return; neighboring routes remain protected. No callback query/body leakage. FR-003–006, FR-014, SC-001–002.

- [x] T013 Implement one exchange, encrypted candidate persistence, getMe/getShop identity/ownership checks and current-Owner/invitation-expiry/epoch-CAS activation; exact receipt reconciliation after DB ack loss, no replay on uncertainty. FR-003–004, FR-007–008, FR-011, SC-001–002.

- [x] T014 Test wrong shop/user, missing scope/fields, unsafe IDs, concurrent callback, cancellation/demotion/expiry during exchange, candidate failure/ack loss and generic outcomes using actual owned Nest/DB plus synthetic HTTPS. FR-003–009, FR-016, FR-020, SC-001–002.

- [x] T015 Implement zero-provider GET status and explicit POST read: getMe then bound getShop, exactly four business fields, safe observation and final authority/epoch/version check. Provider denial is distinct from internal session expiry. FR-002, FR-008–009, FR-013, FR-021, SC-003, SC-007.

- [x] T016 Implement durable refresh CAS/submission/receipt fencing, complete-pair replacement and unknown outcome handling; concurrent callers submit at most once and never retry old tokens after lease expiry. FR-007, FR-010, FR-013, SC-004.

- [x] T017 Implement explicit same-account/shop reconnect and local disconnect fencing/removal. Cancel pending work; no stale callback/refresh/read resurrection, cross-workspace transfer or remote-revoke claim. FR-011–012, FR-020, SC-002, SC-004.

- [x] T018 Run multi-worker lifecycle/fault cases including commit uncertainty, stale results, grants,429/cooldown, actual TLS timeout, actual SQL lock failure, config/key failure and cancellation. Final Etsy suite21/21. FR-010–014, FR-016, SC-003–004.

- [ ] T019 **Operational prune deferred after confirmed P2.** Safe audit/ordinary expiry and prior local evidence remain implemented; the supplied Owner UUID was not authenticated actor approval. PUBLIC/app_runtime/app_operator now lack EXECUTE on the retained function. Complete operational prune only after a separately approved verifiable current-Owner/purpose-bound authority flow with real attribution; do not treat an arbitrary UUID/session variable as approval. No operator adapter or background prune is supplied. FR-007, FR-014, FR-020.

## Layer5

- [ ] T020 Under a separate fresh FE lease implement Owner create/share/table/check/sync/cancel/reconnect/disconnect and scoped recipient confirmation using existing006 BFF/session/CSRF. Preserve the independent navigation lane and prohibit client secrets or new login protocols. FR-002, FR-017, FR-020–021.

- [ ] T021 Extend focused functional/browser cases for invitation table, private create/copy, manual local Check status versus live Sync, expired/cancelled/replayed links and role loss. Assert zero timed/focus/background requests while idle; no polling/SSE/WebSocket. FR-016, FR-020–021, SC-007.

- [ ] T022 Run integrated actual owned browser→Nest→DB→synthetic HTTPS consent/callback/read/reconnect/disconnect, including Owner page closed during callback and next explicit check. Record actual commands/failures, secret scans and guarded teardown; no real Etsy claim. FR-003, FR-014, FR-016–017, SC-001–005, SC-007.

## Layer6

- [x] T023 Coordinator-run scoped review completed: original company Codex gpt-6-luna medium reviewer t175 reported one confirmed P2; fail-closed correction and affected checks were followed by an independent FIX-ONLY recheck with no further confirmed actionable finding in that scope. Coordinator accepted resolution after exact hash inspection. Original finding/failures and model/runtime evidence are retained in owner-review-handoff.md; no reviewer tests/builds/edits or worker-started reviewer. FR-016–017, SC-005.

- [ ] T024 Obtain new010 publication/artifact/additive migration-before-deploy and ingress/privacy/callback verification grants, reusing accepted D1/D2/Auth foundation. Secure injection uses existing owner resources without original-file reads or setup replay. FR-005, FR-015, FR-018, SC-005.

- [ ] T025 Under explicit actual-provider grant exercise existing-app intended-account consent, registered callback, encrypted persistence and four-field read; separately authorize refresh/reconnect/disconnect and owner Etsy Revoke. Record safe outcomes and current source/artifact/deployment identity. FR-003, FR-006–012, FR-018, SC-001, SC-003–005.

- [ ] T026 Close only evidenced layers/gates in owner-review-handoff.md; keep actual-provider/hosted/visual limits explicit. Shared README/STATE and existing C2-01 updates need their own leases/write authority. No partial/local result labeled complete Etsy product. FR-014, FR-016–019, FR-021, SC-005–007.

## Dependencies and stopping points

The original scoped review's one prune-authority P2 is resolved by accepted fail-closed correction; operational prune remains deferred under T019. T023 is complete for this BE increment after independent fix-only recheck, not for future FE/hosted work. Source/docs ownership returns to t151. T020–T022 require FE ownership/browser proof; T024–T026 retain publication/hosted/provider/overall closeout gates. No new worker or reviewer starts from this receipt.

No parallel writers or workers were started. Existing developer-app access and supplied foundation acceptance are not reopened. Explicit synthetic policy/origin/shop inputs enabled local checks without choosing live owner values. No accepted foundation role/migration/bootstrap/D1/D2 was rerun against shared or hosted resources.

## Accepted BE setup increment

- [x] T027 Extend the existing runtime digest with exactly ten Etsy keys; preserve absent-key legacy digest and verify actual enabled configuration without enabling runtime.
- [x] T028 Implement offline hidden-TTY/fresh-private-file configuration and key preparation; no original discovery/overwrite, secret output or actual injection. Actual PTY synthetic preparation passed; key writer used fixed synthetic bytes only, no owner key generation.
- [x] T029 Implement the memory-only authenticated Owner client through fixed Auth/Nest endpoints; explicit revision/idempotency, private URL output, no automatic refresh/retry or prune. Actual owned HTTP/SQL/current-session journey passed.
- [x] T030 Implement the exact owner-run held CREATE → pending503 → separately approved3→4 SQL → same-ID ready200 → explicit same-ID promote → domain/ACK contract with durable intents/receipts and terminal unknown STOP. Actual isolated SQL/readiness and synthetic provider/fault/process-restart cases passed; no hosted operation.
- [x] T031 Integrate explicit operator closure; focused config/release/package checkpoint35/35, final release/package32/32, owned E2E3/3 and isolated Linux launcher boundary smoke passed. These counts overlap. Baseline native build deliberately skipped; synthetic launcher package is not native/published release evidence. Final new-source Linux artifact requires separately authorized review/publication/main binding.
- [x] T032 Record exact source/docs/evidence identities and cleanup, freeze READY_FOR_BE_SETUP_REVIEW and return ownership to t151. Only the coordinator starts existing t175 review; OWNER_INPUT_PENDING and HOSTED_NOT_RUN remain. Later08e68 FE-only main FYI is supplied, not independently verified; no rebase/build restart.

## Confirmed setup Auth P2 correction

- [x] T033 Bind Owner Auth URL and exact public-key hash to the independently approved setup/config/source/artifact boundary before settings/credentials/transport. Generate a separately digest-pinned guarded Owner launcher and exact nonsecret receipt; reject unbound login, forged approval and changed/expired bindings. No arbitrary expected-project field or decoded-JWT authority.
- [x] T034 Run focused zero-password/zero-transport refusal coverage, approved signed current-Auth/Nest/SQL Owner journey, isolated operator imports and actual Linux guarded-launcher/PTY checks. Preserve all five earlier failures plus the new fixture readonly-array compile failure; no native/live/full unrelated rerun.
- [x] T035 Freeze exact delta against setup scopea5e427 and retain all unaffected hashes, original one-P2 history, evidence/cleanup and new scope/packet identities. READY_FOR_BE_SETUP_AUTH_FIX_REVIEW; STOP WRITES and return ownership to t151. Existing t175 FIX-ONLY acceptance is pending and coordinator-owned.

## Accepted source-local review closeout

- [x] T036 Record coordinator acceptance of existing t175 Auth FIX-ONLY resolution and freeze READY_FOR_BE_SETUP_PUBLICATION with the final13-path manifest. Verify document integrity and unchanged source hashes only; return ownership to t151. Publication is coordinator-owned and not performed by this writer.

**Checked scope:** T001–T018 retain their original local/BE evidence (T011 remains BE-only); T023 retains the original scoped review; T027–T035 retain setup implementation/fix/check/freeze evidence; T036 records accepted setup review and this docs-only closeout. T035's pending recheck describes its prior freeze, superseded by T036.

**Still open:** T019 operational prune; T020–T022 FE/browser journey and acceptance; T024 new-source publication/integration, native artifact/approval and hosted schema/config/release authority; T025 actual Etsy/provider acceptance; T026 overall/shared closeout. Existing PR6 publication is historical and does not publish this new increment. Baseline native build remains skipped/NOT_RUN; no usable real launcher, secure setup or hosted pass follows from checked source-local tasks.

## Owner shop-name lookup — source/local execution

The explicit owner START authorized T037→T038→T039 in existing t15j. Four coordinator planning changes were captured as the pre-source baseline, not misreported as new writer-only edits. Reviewed lifecycle/setup behavior stays frozen except direct lookup dependencies; all earlier IDs/checkmarks/review snapshots remain intact.

- [x] T037 Add GET /v1/app/integrations/etsy/shops/lookup (lookupEtsyShops) and strict EtsyShopLookupResponse/Item/Page components to the sole canonical schema; regenerate BE and hand off the consumer delta under FE ownership. Current Owner/manage only; strict name/offset normalization, exact/choose/not_found/incomplete and explicit completeness semantics per contracts/proposed-api.md. FR-002, FR-022, SC-008.
- [x] T038 Implement fixed findShops app-key-only adapter and bounded projection: one request per explicit page,20-item page/100-record window, lossless ID/count validation, derived URL,1500ms/64KiB/8-second budgets, current-Owner recheck and existing cooldown/error contract. No new scope, provider URL switch, connection/database-schema/runtime-config write or OAuth side effect. FR-006, FR-013–014, FR-022, SC-008.
- [x] T039 Extend focused functional/HTTP synthetic checks for denial-before-provider, malformed inputs, ambiguous/partial/empty pages, count/ID precision, rate/timeout/key failures and unchanged selected-ID invitation/consent enforcement. Hand off the exact contract through t151 to FE011 for its separately owned local URL parsing/table/sample flow and AppMe/error parser compatibility; no live-provider or overall integration pass inferred. Actual checks/failures/resource receipts are in quickstart.md. FR-016–017, FR-022, SC-008.

T037→T038→T039 completed source-locally. **FROZEN READY_FOR_BE_LOOKUP_REVIEW; STOP WRITES.** Only t151 starts the existing t175 scoped review; no review result is claimed yet. FE consumer regeneration/parser/browser integration, publication, clean exact-source Linux artifact/approval and real hosted/provider acceptance remain separate. No new worker, Git, CI or deployment follows from this local freeze.

## Recipient bridge and actual GoTrue fixture — bounded source/local execution

The new grant supersedes the earlier bridge proposal-only stop, not accepted lookup history or external gates.

- [x] T040 Require exact native API Host, invitation Origin and existing technical bearer before start body/service; preserve the callback exception and all other guards. Move Owner start to the fixed API origin, align only the existing canonical start contract, and retain strict303 consent validation.
- [x] T041 Adapt existing006 lifecycle/GoTrue compose and BE fixture for a fresh011 nonce/project, ephemeral loopback services, private descriptor/control and synthetic Etsy. Preserve default006/shared resources; provide reset, Owner deny/reinstate, lookup scenarios, callback completion and independent counters.
- [x] T042 Run affected generation/compiler/functional/security and actual Auth/Nest/DB fixture checks; coordinate FE login→management→recipient→consent→callback→status acceptance with intercepted Etsy navigation. Record failures, commands, results and synthetic/hosted limits.
- [x] T043 After FE acceptance, clean up owned resources and freeze exact source/contract/evidence at READY_FOR_BE_RECIPIENT_BRIDGE_REVIEW. Return ownership and STOP WRITES; existing t175 review is coordinator-owned, and canonical consumer handoff requires the reviewed frozen receipt.

T040–T043 are checked for completed source/local execution and honest evidence, not an all-checks-green or review/hosted claim. FE matrix17/18 plus affected1/1 is split-run acceptance; the earlier actual006 role-change503 remains disclosed. Owned cleanup is confirmed. **READY_FOR_BE_RECIPIENT_BRIDGE_REVIEW; source ownership returned to t151; STOP WRITES.** No new reviewer, consumer active-copy, publication or deployment was performed.
