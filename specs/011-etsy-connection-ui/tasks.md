# Tasks: Etsy Connection UI Preview

Input: [spec](spec.md), [plan](plan.md). Sole implementation writer; no parallel workers. Local feature selection only; existing branch retained.

## Design and prerequisites

- [x] T001 Verify clean selected base, read governance/010/generated/006/003/004 and UI skills, observe public reference; record decisions in `specs/011-etsy-connection-ui/plan.md`.
- [x] T002 Write compact `specs/011-etsy-connection-ui/{spec,plan,tasks}.md`; verify acceptance and scope consistency before source implementation.

## US1 — Owner sample management

- [x] T003 [US1] Add typed local preview transitions and ID/cancellation/disconnect boundaries in `apps/web/src/features/etsy-connection/preview-state.ts` with focused `apps/web/tests/functional/etsy-preview.test.ts`.
- [x] T004 [US1] Build connection details, invitation history, create/inspect/copy and confirmation dialogs in `apps/web/src/features/etsy-connection/etsy-connection-screen.tsx` and scoped CSS.
- [x] T005 [US1] Add protected `/connections/etsy` page and narrow config/provider/proxy/shell registration, preserving006 admission and header/main behavior.

## US2 — Boundaries and local recovery

- [x] T006 [US2] Cover empty/pending/connected/reconnect/unknown/loading/failure, Member affordance and keyboard/focus/clipboard boundaries in the feature component and existing Playwright harness.
- [x] T007 [US2] Run affected functional/session-navigation checks, production build/typecheck/lint, automated preview journey and1440/360/390 visual/overflow comparison; record actual results in `plan.md`.

## Review handoff

- [x] T008 Freeze changed paths/hashes/screenshots/commands and evidence in feature011; send READY_FOR_FE_ETSY_UI_REVIEW directly to root-assigned reviewer t18d (company Codex gpt-6-luna medium), then STOP WRITES pending review.
- [x] T009 Receive the assigned review; correct the confirmed P2 desktop screenshot evidence without source changes; obtain same-reviewer fix-only acceptance and record final ownership handback in `plan.md` and `handoff-manifest.json`.

Dependencies: T001→T002→T003→T004→T005→T006→T007→T008→T009. Test assertions are consumer-visible boundaries, not source snapshots or duplicate full-suite coverage. Confirmed review findings receive only scoped fixes/affected reruns and fix-only inspection; final ownership handback goes to t12p. No Git/deployment or recipient/integration work.


## Owner feedback: table-first and shop discovery — 2026-11-18

[Amended design and FE↔BE audit](plan.md#table-first-and-shop-discovery-amendment--2026-11-18). Prior T001–T009 remain historical accepted UI-only evidence. New tasks below do not claim code or real endpoint completion.

- [x] T010 Record table-first/name-or-link→lookup→read-only ID feedback and check current BE controller/service/canonical against preview shapes. Record actual integration/rollout gaps and notify010 coordinator, without backend/runtime edits.
- [x] T011 Align fixture state/observation revisions, intended-versus-verified shop identity and post-cancel fixed binding with actual BE semantics; retain clear sample-only labels and no provider calls.
- [x] T012 Replace the large connection card with a compact main connection table plus invitation-history table; move details/actions into existing dialogs/drawer, add created/expiry fields, keep one connection and stable desktop/mobile geometry.
- [x] T013 Add local simulated name/link lookup with explicit result confirmation, read-only exact Shop ID, cancel/stale-input guards and loading/not-found/ambiguous/error states; retain unchanged create payload and one-time creation-result link UX. Do not invent or call an unavailable endpoint.
- [x] T014 Extend existing functional/production-browser preview scenarios for table→lookup→confirm→create→history/cancel/details, invalid/foreign/ambiguous/delayed inputs, no false verified identity, keyboard/focus/mobile/Member/session preservation; run affected build/type/lint and recapture matched reference/local viewports.
- [x] T015 Freeze the new scoped UI source/check evidence for one assigned company Codex review, fix confirmed findings with affected reruns/fix-only inspection, return ownership and seek owner visual feedback; no Git/deploy/live integration. Assigned t18d gpt-6-luna medium reported no confirmed actionable findings; no fix or re-review was needed. Source remains frozen for t12p handback; owner visual feedback and T016 remain separate.
- [ ] T016 Integrate real FE–BE Etsy operations under the owner START amendment below. Formerly deferred; now active, with canonical/recipient/fixture prerequisites explicit rather than replaced by mock completion.

Parallel: T011–T015 are one FE writer, independent from010 lookup design. T016 waits for both; no two writers on shared session/canonical/browser harness. No new agent or backend source grant follows from this planning update.

## T016 execution — owner accepted table UI, actual integration START

- [x] T016.1 Close exact AppMe Etsy capability and canonical error/429/retryAfterSeconds parser gaps with focused regression evidence. The two new parser cases failed before the fix; the affected session functional file then passed45/45 locally.
- [x] T016.2 Implement enumerated fixed-origin management BFF operations with strict request/response, current BE authority and existing session/CSRF/Origin/generation boundaries. Source/local boundary checks passed; actual authenticated end-to-end authority proof is recorded under T016.6.
- [x] T016.3 Consume frozen reviewed010 lookup/bridge canonical SHA, regenerate FE consumer only, and connect actual status/history/lookup/create/cancel/disconnect/explicit sync; no sample fallback/polling/mutation retries, stable revision/idempotency and creation-only links. Following t151/t12p's accepted bridge receipt, raw canonical SHA b5c540638099cd3dda5f9136d9e7294812775cef7675bb21d92a1a3f9d1b6257 matched; FE generation and exact check/typecheck passed. The final delta only updates the consent description and401 response type; generated runtime emission is unchanged.
- [x] T016.4 Deliver public recipient fragment cleanup/confirmation/start after010/root settles the cross-host transport; never spoof Host/Origin, widen CORS or invent OAuth routing. Root approved server-only public ETSY_CLIENT_ID and the fixed technical-bearer JSON bridge. Recipient/BFF regressions passed8/8; actual anonymous confirmation, exact consent navigation, callback and replay denial passed at1440/360/390. The new bridge canonical refresh is complete after the independently reviewed BE receipt.
- [x] T016.5 Extend/run focused functional and BFF boundary tests, affected lint/type/build and contract-generation checks. Session45/45, management Etsy15/15 and recipient8/8; exact frozen lookup codegen check, typecheck, corrected affected lint and isolated production builds exit0. Initial lint/type/locator failures and earlier denial-only smoke limits remain recorded in plan.md; later actual acceptance does not rewrite those checkpoints.
- [x] T016.6 Coordinate isolated real Auth/BFF/Nest/ownedDB plus synthetic Etsy fixtures with t151; run production-browser main journey and adverse/session/mobile/secret-lifecycle checks with independent call/SQL readback. The matrix passed17/18, followed by affected cross-tab1/1 after removing an unsupported redirect assertion and checking the existing concealment contract. All18 cases are covered, not one clean18 run. Actual counters/failures/commands and fixture handback are recorded in plan.md and integration-counter-evidence.json; all owned FE resources stopped, Etsy reset and Auth preserved.
- [x] T016.7 Freeze READY_FOR_FE_ETSY_INTEGRATION_REVIEW to t18d, resolve confirmed findings with affected reruns/fix-only review, return source/evidence to t12p and stop writes. Existing t18d's one GPT-6-Luna medium read-only pass reported no confirmed actionable FE correctness/security/regression/test-gap findings; no fixes, new review or reruns were needed. Root authorized011 docs/receipt-only closeout; all117 frozen source hashes remain unchanged. Final publication inventory/hashes and ownership are returned through integration-handoff-manifest.json. No worker/Git/deploy/cloud/provider action.
