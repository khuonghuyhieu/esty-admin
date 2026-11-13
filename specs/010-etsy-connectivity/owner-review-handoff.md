# Owner Review Handoff: Etsy Connectivity

**READY_FOR_OWNER_PLAN_REVIEW — docs only.** This packet proposes an early BE connection to the existing Etsy account/shop; it does not implement or enable any endpoint, credential store, migration, app registration, deployment or provider action. Existing owner-reported main is unchanged by this work; no Git inspection/publication or new agent/reviewer was performed.

## Proposed owner decision

Keep **account/shop identity metadata only** as the first dataset: actual granting user ID, approved shop ID, shop name and currency code, with only shops_r. Recommended: approve this operator-first baseline. If receipts/orders are required now, request an explicit dataset/scope/privacy/acceptance amendment before code; do not silently add transactions_r, buyer data, imports, writes, shipping or test orders.

Use the **existing app**. Its actual type/status/approval/access is UNKNOWN. The coordinator-retrieved historical C2-01 intent (own shop plus other sellers; possible Personal→Commercial on the same app) is retained as dated intent, not current entitlement or permission to create another app. Existing [C2-01](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) remains the tracker; no external writes or duplicate tracker were created.

## Packet

1. [Specification](spec.md): three user journeys,18 functional requirements and five measurable success criteria.
2. [Plan](plan.md): existing-stack design, sole callback exception, source ownership and seven execution gates.
3. [Tasks](tasks.md):26 future unchecked tasks; US1 has7, US2 has3, US3 has5; setup/foundation6 and final integrated/external acceptance5. No implementation task is marked complete.
4. [Research](research.md): official sources, exact endpoint/security/schema evidence and explicit tutorial/prose conflicts.
5. [Data model](data-model.md): scoped intent/credential/refresh records, short-lived proof, encryption, CAS/fencing and additive migration proposal.
6. [Proposed contracts](contracts/proposed-api.md): private operator initiation, exact GET callback, fixed upstream protocol and proposed authenticated operations; not a second live OpenAPI.
7. [Validation guide](quickstart.md): local HTTPS options, functional/HTTP/DB/browser matrices and separately authorized real Etsy acceptance.
8. [Requirements quality checklist](checklists/requirements.md):10 inspected documentation-quality criteria, not implementation or independent-review passes.

## Security and integration decisions for review

- Early initiation is explicitly operator-assisted and bound to current Owner/workspace/target shop. No public connect endpoint, new role/password system or browser technical key. Future Owner self-service requires006 acceptance and a separately scoped capability/BFF/UI extension.
- Proposed real callback is exactly GET `https://api.lovora.us/integrations/etsy/callback`; its pending transaction replaces the unavailable browser technical bearer only on that route. All other guards remain. State/PKCE,300-second expiry, single claim, current Owner checks and epoch fencing are mandatory.
- Clean303 return goes to the owner-confirmed existing public website root without query/fragment. It is neutral, not a success page. Privileged status/read proves the result; no second public result-route exception is proposed.
- Use form-urlencoded code/refresh exchanges, S256, exact HTTPS registration, x-api-key KEYSTRING:SHARED_SECRET and complete user bearer. `refresh_token` is the table/example grant value; `refresh_code` prose is not adopted. The reference confirms token URL/security but has no standalone token request schema; no false enum-verification claim.
- getMe with shops_r establishes the actual granting user/shop; getShop verifies the same owner/shop and projects minimal fields. Public metadata or token-prefix decoding alone is insufficient.
- Authenticated encryption has key/version/row/purpose binding. Refresh is serialized in the DB with CAS, durable receipts and lost-ack fencing; no old-token retry based on lease expiry or guessed provider rotation grace.
- Local disconnect is not remote revoke. Etsy documents user-managed Revoke; no programmatic revoke endpoint was established. Real lifecycle outcomes remain explicit acceptance gates.
- Additive schema work uses the same migration manifest/history and001 delivery prerequisite. Existing005 local verification and001 hosted health proof do not establish005/010 cloud readiness. Canonical/generated/schema/source files remain untouched by planning.

## Owner inputs and separate authorizations

No secret values are requested in chat. Before the applicable future gate, confirm only the existing app's non-secret identity/type/status/access, intended consenting account and target shop, metadata baseline, exact registered callback and fixed public return origin. Future owner-controlled secure configuration supplies the minimum app secret/keyring without reading or overwriting original private files.

Source/canonical/FE-test/shared-doc leases, dependency changes if actually needed, fresh isolated resources/TLS, separate scoped review,001 migration-delivery integration/005 hosted adoption, publication/artifact/release, provider registration/access-log checks and real consent/read/lifecycle actions are distinct gates. No paid upgrade, new hosting platform, automatic setup redo or remote SQL is implied.

## Scope and evidence boundary

Directory allocation was checked before writing:001–009 existed,010 did not; t4v assigned t4q sole ownership and coordinated the lanes. Four local Spec Kit workflows/templates and project governance were read. Helpers use command-local feature routing and NO_PERSIST=1; create-new-feature/branch/pointer mutators were not used. No extension hook configuration was present at preparation.

A140-file public preservation baseline was captured before010 writes across BE public source/tests/scripts/migrations, selected protected feature artifacts, shared governance/root manifests, Spec Kit and the four upstream workflows. Baseline digest: `9b358995acf70be45c55daf2cc883f337478e5916348dde8dd896fece8f4656e`. Shared pointer SHA256: `3dba5372b0dd22ba2a044fcfb2ec1355fbc364e1a45f060025041294a0d2335b`. Active006 documentation may be changed only by its assigned FE writer; such concurrent changes must be disclosed rather than overwritten or attributed to010.

Public Etsy reference research parsed966623 bytes, SHA256 `4d6b2a4af50c8a72b32bd1980d66f1c420f42b25b1c7e71ca4d98c3f928ee95d`. Only public documentation was fetched; no account/app settings, key, business API, consent or token endpoint was accessed. The large reader extraction was incomplete and was replaced by full in-memory parsing of the same official schema; no provider schema copy is committed here.

006 support had priority and was not preempted. After explicit FE_BROWSER_RELEASED, its previously authorized guarded teardown finished: API/control then run-bound forwarder then original fixture, confirmed four registered browser identities cleaned, private scratch removed, zero owned project resources,26 volume names and24 other container identities unchanged. That separate006 cleanup is not010 runtime evidence or a reusable fixture grant. No010 application test, build, install, service, private-file read, provider/account action or independent review was run.

The final read-only analysis and preservation receipt is recorded below after inspecting this completed packet. Planning readiness must not be read as permission to execute any unchecked task.

## Original read-only specification analysis

Analysis covered the completed specification, plan, task dependencies, proposed contracts, data model, validation design and constitution. This was the writer's read-only consistency analysis, not an independent reviewer pass. No remediation was applied during analysis.

| ID | Category | Severity | Locations | Finding | Proposed next action |
|---|---|---|---|---|---|
| U1 | Task underspecification | MEDIUM | contracts/proposed-api.md:9; tasks.md:26,38,46 | The operator contract includes explicit `read` and `refresh` commands. T008 names begin/status/verify/prune, while T015 and T018 target the HTTP/service/persistence implementations without explicitly assigning those two operator adapter commands. Implementing only the named targets could leave the operator-first contract incomplete despite requirement-ID coverage. | Before source approval, approve a narrow task amendment assigning operator `read` to T015 and operator `refresh` to T018, using the same authority, bounded service and operation-receipt contracts. Preserve the existing task IDs; no new feature or public endpoint is needed. |

No confirmed constitution alignment issue, HIGH/CRITICAL issue, contradictory requirement or duplicate requirement was identified in the original scoped analysis. That analysis reported one task-level ambiguity, U1; its subsequent authorized remediation and scoped resolution are recorded below. Existing-app approval, secure inputs, hosted adoption and actual provider behavior are explicit execution gates, not assertions of completed setup. READY_FOR_OWNER_PLAN_REVIEW does not mean the task packet is cleared for implementation.

### Requirement coverage

All18 functional requirements and five buildable success criteria have associated future tasks. This100% identifier coverage is not proof that the implementation exists or that every adapter detail was originally assigned. The coverage map remains unchanged after resolving U1 below.

| Requirement | Has task? | Task IDs |
|---|---|---|
| FR-001 | Yes | T001, T008 |
| FR-002 | Yes | T003, T008, T011, T014, T015 |
| FR-003 | Yes | T007, T008, T010, T013, T022, T025 |
| FR-004 | Yes | T005, T007, T008, T010, T011 |
| FR-005 | Yes | T003, T007, T009, T011, T024 |
| FR-006 | Yes | T006, T007, T009, T020, T025 |
| FR-007 | Yes | T004, T005, T010, T012, T018 |
| FR-008 | Yes | T006, T007, T010, T011, T014, T015, T025 |
| FR-009 | Yes | T006, T014, T015, T016, T025 |
| FR-010 | Yes | T005, T017, T018, T020, T021, T025 |
| FR-011 | Yes | T005, T010, T017, T019, T021, T025 |
| FR-012 | Yes | T017, T019, T020, T021, T025 |
| FR-013 | Yes | T006, T010, T015, T018, T020, T021 |
| FR-014 | Yes | T004, T008, T009, T012, T020, T022, T026 |
| FR-015 | Yes | T003, T005, T011, T024 |
| FR-016 | Yes | T007, T011, T013, T014, T016, T017, T021, T022, T023, T026 |
| FR-017 | Yes | T001, T003, T012, T016, T022, T023, T026 |
| FR-018 | Yes | T001, T002, T024, T025, T026 |
| SC-001 | Yes | T007, T010, T013, T022, T025 |
| SC-002 | Yes | T007, T009, T010, T011, T014, T019, T022 |
| SC-003 | Yes | T014, T015, T016, T020, T022, T025 |
| SC-004 | Yes | T017, T018, T019, T020, T021, T022, T025 |
| SC-005 | Yes | T013, T016, T021, T022, T023, T024, T025, T026 |

Original analysis metrics:23 requirements/criteria;26 contiguous task IDs, all unchecked;100% identifier coverage; zero unmapped tasks; one task-level ambiguity; zero confirmed duplication/constitution/Critical findings. All37 relative Markdown links and both referenced fragments resolved. No unresolved template placeholders were found. No application tests were run for010.

### Actual helper and preservation receipts

The following local helper invocations completed with exit0 during preparation, each with command-local `SPECIFY_FEATURE_DIRECTORY=specs/010-etsy-connectivity SPECIFY_FEATURE_NO_PERSIST=1`:

1. `.specify/scripts/bash/check-prerequisites.sh --json --paths-only`
2. `.specify/scripts/bash/setup-plan.sh --json`
3. `.specify/scripts/bash/check-prerequisites.sh --json --require-spec`
4. `.specify/scripts/bash/setup-tasks.sh --json`
5. `.specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks`

These are document/path/template checks, not application runtime proof. The final prerequisite invocation was not repeated after the unchanged packet's006 priority pause. Extension-hook configuration was absent at preparation and final analysis. No hook, Git, branch or shared-pointer mutation was invoked.

The original140-file preservation comparison passed140/140 before the fresh006 P2 interruption. That dated observation is retained; it is not relabeled as a new full140-file comparison. After fresh006 cleanup, the preserved current34-file BE/OpenAPI/root-lock snapshot matched exactly, the shared pointer still matched the SHA256 recorded above, and all nine010 document hashes matched their pre-teardown snapshot throughout cleanup and read-only analysis. At that original handoff, the evidence append changed only this handoff and all eight core packet files remained unchanged. The subsequent authorized U1 repair changes only tasks.md and this handoff, as recorded below.

Fresh006 P2 support was separately requested and acknowledged, with nonce `f77d6126f4f35270973c782c9c468d21`. After a second explicit FE_BROWSER_RELEASED, API/control t68 exited0 with CLEANED, original run-bound forwarder stop and t67 exited0, and original guarded fixture stop exited0. The cleanup receipt confirmed all four registered identities with no failures; scratch/config/socket were removed and project containers/networks/volumes were zero. Exact pre/post-teardown26 volume names and24 other container IDs/names were unchanged, matching startup counts. Listener metadata retained owner3000 PID66743 and shared54322 PID27478, with no55440–55444 listeners returned; the mixed-selector lsof command exited1. No shared-service health request was made. This support/cleanup is not010 verification, and FE's affected P2 test results remain FE-reported rather than independently rerun by BE.

### Current core packet hashes after U1 remediation

| File | SHA256 |
|---|---|
| spec.md | `93c58e43dbee9636814142269152763a6a7c3d2aa3097249763eecbd50642631` |
| plan.md | `09f5b7659d80df24f69305eb8e55f94cf0215e94fb63ca20aaa1b20204ed979c` |
| tasks.md | `7217f1fdb3a33a4df17e6f262c9609f281a9238d0d5c79281af2f37af8fb3564` |
| research.md | `abca9ef896c8d7052a0171dfd9159ad845dafeda71de0a3cdbbe6ef609cae685` |
| data-model.md | `5272d1d047c9a50a44295b7d44a283b6664df492c514605c4bfdf39f5e24d3d2` |
| contracts/proposed-api.md | `50951d7057f4b8337107f67d0fec45e03884f6958752c14d66e6de434fa3bc7c` |
| quickstart.md | `e53a631184547ad234674463a628def646558516d26183642771d108a913c935` |
| checklists/requirements.md | `597487fadde9519dd94e9aa6a8573877d0456a7e4e61335d86d2669d96fe5765` |

## Authorized U1 remediation and scoped resolution

The coordinator confirmed the original one-MEDIUM U1 finding through read-only task/handoff inspection and explicitly authorized this narrow documentation repair under the existing PLAN-ONLY mandate. Assigning already-promised adapters does not require a new owner product-policy decision. The original finding row above is retained as history; it is not rewritten as an original no-findings result.

- T015 now explicitly assigns the operator `read` adapter in `apps/api/scripts/etsy-connection-operator.ts`, delegating to the same bounded application service with purpose-bound approval, current Owner/workspace authority, expected revision and the existing operation-receipt contract.
- T018 now explicitly assigns the operator `refresh` adapter in that same script, delegating to the same bounded service and authority with durable reservation/submission/receipt reconciliation, CAS and fencing. No separate refresh path, provider retry, operation or scope was added.
- A read-only byte comparison confirmed that only tasks.md lines38 and46 changed; every other task byte, all26 IDs/checkmarks and all requirement references were preserved. All26 tasks remain unchecked.
- The scoped consistency check found both adapters now assigned to their existing contract/service boundaries. **Current U1 status: RESOLVED.** This is a documentation-resolution check, not implementation proof or another independent review.
- The read-only coverage map still covers23/23 requirements/criteria, with zero unmapped tasks and no mapping changes. All37 relative Markdown links and both fragments resolved. Before this receipt update, the other eight documents were byte-identical to the previous handoff snapshot; the shared feature pointer was unchanged. The seven documents other than tasks.md and this handoff remain outside the repair.

Original tasks.md SHA256: `5d36a1e8fa618eb7ff0759ff6160c40ae8094755145a040b2168e0b31b0ac8bc`; corrected tasks.md SHA256 is in the current table above. Original owner-review-handoff.md SHA256: `0fe7acd7520e93777528cbef26a2f5d7313218d2b9a6346b43a5fda6388bbfac`. The final corrected handoff hash and nine-file sorted-map digest are supplied in the coordinator receipt to avoid a self-referential file hash.

No external research, application runtime/test/build, private input, Git, shared-document, source, dependency, provider/account action or independent reviewer was used for this repair. Prior140-file,34-file and006 runtime/cleanup evidence remains historical and was not rerun or relabeled.

Next action: deliver corrected READY_FOR_OWNER_PLAN_REVIEW to t4v/t4y, then STOP WRITES. The owner still decides metadata versus an explicitly amended order-read scope; actual app/access, callback, secure configuration and other execution gates remain open. This coherent plan is not implementation, publication or deployment approval; do not run `$speckit-implement` from this receipt.
