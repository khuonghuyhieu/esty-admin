# Implementation Plan: Account and Workspace Settings

**READY_FOR_OWNER_PLAN_REVIEW — planning only.** [Spec](spec.md) · [tasks](tasks.md) · [single session/BFF contract](../006-login-session/contracts/session-bff.md).

## Technical context and decisions

Reuse installed Next16/React19/Node24,006 session/caller/generated consumer, accepted005 Nest settings/audit and one PostgreSQL history. The completed FE gap inventory reports sample local state and inert Save in `settings-screen.tsx`, not API persistence. No FE re-audit, source edit or runtime check was performed for this plan.

Decision: two independent forms/actions for self profile and workspace. The backend has two revisioned transactions, not a Save All transaction; serially sending two writes would not make them atomic. Reject automatic rollback/merge, extra persisted preferences, new settings storage and a new audit dashboard. Existing Auth email is display-only. This bounded plan contains its research rationale, entity/interface mapping and validation guide rather than duplicating006's transport artifacts.

## Journey-to-contract and evidence matrix

The sole [OpenAPI0.4.0](../001-connectivity-foundation/contracts/openapi.json) SHA256 is `41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad`. FE's observed health-only generated consumer needs006 regeneration; this feature does not mutate canonical or BE generated files. [Retained005 receipt](../005-app-foundation/quickstart.md#actual-backend-verification-receipt): T041/T042/T043 cover persistence/reload, audit rollback/scoping and denial within config/HTTP28/28 and real Auth→Nest→DB9/9 plus affected9/9. These are historical BE results, not new checks or browser proof.

| Journey | Actual operation/schema/error | Implemented BE evidence | FE task / missing work | Joint acceptance |
|---|---|---|---|---|
| Read/save my profile | GET me → AppMe; PATCH me AppNamePatch → AppProfileResult;400 invalid_request,401,403,409 revision_conflict,503 dependency_unavailable | T041/T042/T043 self-only revisioned update/read | T003–T005: real initial state, exact self PATCH, menu revalidation | Member/Owner save→new me→reload preserves name and trusted read-only email |
| Read/save workspace | GET/PATCH workspace → AppWorkspaceResult, PATCH AppNamePatch; same errors, current403 capability denial | T041/T042/T043 Owner write/Member read and current authority | T003/T006: separate Owner form, Member read-only state, explicit conflict recovery | Owner save persists for another browser; Member direct write and demoted Owner deny |
| Conflict/partial outcome/audit | Expected revision on each separate patch; GET audit → AppAuditEventPage; scoped cursor/limit, Owner-only read | T041/T042/T043 no orphan audit on rollback, redaction and scoping | T007–T009: draft/latest separation, safe unknown result, approved acceptance reads | Concurrent stale save does not overwrite; one form's success remains true when another fails; persisted successful change has matching scoped/redacted audit |

Canonical app errors retain `{code,requestId}`.006 handles missing/current session and technical guard401 `{status:"unauthorized"}` → safe503 rather than a password loop. There is no missing Nest password/settings operation to implement.

## Routes, fields and state transitions

| Browser route | Fixed upstream | Exact behavior |
|---|---|---|
| `/settings` | Server current me and workspace reads | Requires current006 admission; no RSC refresh/cookie writes; render sanitized real data only |
| Existing GET and added PATCH `/api/app/me` | GET/PATCH `/v1/app/me` | GET AppMe; PATCH body only `{displayName,revision}`, output AppProfileResult; never accept target userId/email/role |
| GET/PATCH `/api/app/workspace` | GET/PATCH `/v1/app/workspace` | Same AppNamePatch input; output AppWorkspaceResult; no caller-selected workspace ID or nested proxy |
| No new audit browser route | Existing GET `/v1/app/audit` from approved server-side acceptance caller | Owner-only bounded audit assertions; do not expose technical credentials/operator functions or invent an audit UI |

Reuse generated AppMe/AppProfile/AppWorkspace and result wrappers; do not flatten response envelopes into guessed DTOs. Names are trimmed, nonblank1–100 Unicode code points, no controls/malformed Unicode. Expected revision is an integer1–2147483646. Auth email is never copied into a writable app profile field. No new table, revision counter or migration is planned. Audit records remain the existing redacted entities and opaque scoped cursors; do not invent an audit field/search contract.

Per form: read → pristine → dirty → saving → canonical saved value/new revision;400 → field error;409 → preserve draft and fetch latest, display conflict, require explicit reapply with that revision;403 → remove forbidden controls and reread me;401 →006 session recovery without replaying the write;503/network loss → outcome unknown/unavailable, reread before an explicit retry. Disable duplicate submission for the same form. Never replace another form's state or clear a draft just because a request started. Identity/generation change discards old drafts/results and private UI. Do not store drafts/identity/tokens in localStorage.

After a confirmed profile patch, fetch current me and update sanitized session/profile-menu state under the same identity/generation. If revalidation fails, distinguish saved profile from unavailable current context; do not revert a committed save or fabricate current capabilities. Workspace patch updates only its returned canonical workspace state, then verifies by new read. No batch atomicity or automatic compensating mutation is promised.

## Exact future file ownership

| Lane | Paths | Responsibility |
|---|---|---|
| FE settings | Existing `apps/web/src/features/workspace-foundation/settings-screen.tsx`, `workspace-foundation.module.css`, `apps/web/src/app/settings/page.tsx`; new `apps/web/src/features/workspace-foundation/settings-state.ts` | Real fields/two forms, conflict/outcome transitions; shared CSS edits serialized with007/009 |
| FE BFF integration owner | Existing006 `apps/web/src/app/api/app/me/route.ts`, `features/app-session/app-client.ts`, `session-provider.tsx`; new `apps/web/src/app/api/app/workspace/route.ts` | Fixed generated operations and006 rules; no simultaneous edits with007/009 shared helpers |
| FE identity integration | Existing `apps/web/src/features/workspace-foundation/profile-menu.tsx` | Consume sanitized current provider state; no fixture identity or separate cached user singleton |
| BE | Existing `apps/api/src/app-foundation/application/service.ts`, `apps/api/tests/app-foundation.integration.test.ts` | Existing settings/audit behavior and meaningful scenario support; confirmed defect requires exact new source/contract grant |
| Integration | Existing `apps/web/tests/e2e/application.spec.ts`,006 `tests/e2e/app-session-fixture.ts`, existing `tests/functional/workspace-foundation.test.ts`, new `tests/functional/settings-state.test.ts` | One serial real-Auth harness, observable conflict/denial/state tests, no duplicate suite |

FE generated consumer is `apps/web/src/lib/api/generated.ts`, already refreshed by006. BE generated/canonical source remains BE-owned/frozen, root dependencies untouched. Lane labels designate responsibilities, not invented people or leases.006 owns config/resource machinery;008 does not introduce new framework/library/helper conventions.

## Dependencies and parallel possibilities

Integrated006 is the only feature dependency.008 does not wait for007 team or009 recovery. After later grants, BE scenario support and FE settings-state/UI work are disjoint; settings UI can proceed alongside007 team and009 recovery screens. Common app-client/me/session-provider/menu/CSS, configs and application E2E are one integration writer's serialized paths. No agent or source work is started by this graph.

## Functional and real E2E validation guide

Functional tests exercise Unicode/name/revision input, current capability rendering, independent form outcomes,409 draft/latest/reapply,401/403/503/unknown outcomes and stale identity/generation discard. Do not snapshot copy or mock back the same request as proof of persistence.

Real production-browser acceptance extends the006 application suite: admitted Member and Owner each save profile/reload/menu; Owner separately saves workspace, another Member reloads it; Member direct workspace write denies; second context changes revision before save; actual role removal invalidates Owner controls and backend write; one save succeeds while another fails; invalid extras/foreign self targeting do not persist; approved backend audit reads prove redaction/scoping and no false-success event on rejected/rolled-back changes. Use real Auth/Nest/DB for the main journey; fault injection is separately labelled. Audit/UI absence is not replaced by a fake audit panel.

Use [006 quickstart](../006-login-session/quickstart.md) for exact future commands, command-local flags and owned DB/Auth/mail/API→web/browser→reverse cleanup. No extra server/fixture or default3100 build. Preserve owner3000/session6634/default `.next` and shared volumes. Record actual affected functional/E2E commands, exit codes, failures, persisted/audit outcomes,1440/360/390 keyboard/error/overflow evidence and owned cleanup here when authorized. No tests/build/browser/resources were run during planning.

## Constitution and gates

One UI/API/history, existing settings entities, no dependency or product expansion, English artifacts and whole-journey acceptance satisfy governance. Local synthetic identities/config/resources and implementation/file grants remain required; actual owner identity, retention, SMTP and hosted release do not block planning or substitute for local evidence. Production activation has the single linked [001 versioned migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only).005/source/shared docs remain untouched; no publication/deployment authority or new baseline decision is implied.
