# Tasks: Existing Etsy Connectivity

**Status:** READY_FOR_OWNER_NEXT_LAYER — coordinator accepted the original P2 resolution after independent fix-only recheck; T023 complete for this BE increment. T019 operational prune and FE/browser/hosted/real-provider gates remain open. Source/docs ownership returned to t151; STOP WRITES.
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
