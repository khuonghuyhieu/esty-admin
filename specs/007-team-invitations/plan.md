# Implementation Plan: Team and Invitations

**Status**: READY_FOR_OWNER_PLAN_REVIEW — no implementation started.
**Inputs**: [spec](spec.md), [tasks](tasks.md), [006 shared contract](../006-login-session/contracts/session-bff.md), [005 accepted contract notes](../005-app-foundation/contracts/proposed-api.md).

## Purpose, technical context and exact delta

Complete Owner invitation→recipient verified acceptance→real team membership, plus current role/status administration. Reuse installed Next16/React19/Node24, accepted Nest005 and Supabase Auth; no SDK/dependency/schema/new business module.006 owns common caller/session/CSRF/cookies and isolated test infrastructure. This bounded plan embeds its small research/data/interface/validation sections instead of copying006's design artifacts.

Observed source: BE `AuthAdmin.sendInvitation` sends `redirect_to=<BROWSER_ORIGIN>/auth/invitation?invitation=<uuid>`; only a conclusive422 `email_exists` permits the existing-user OTP fallback (`create_user:false`), never an unknown send. API already covers all seven team/offer operations. Roster AppMember contains userId/displayName/role/status/revision, not email. Owner can manage offers; Member has team.read only. Preserve these semantics, not the old illustrative Admin/Operator/Viewer fixtures.

Missing source is FE transport/UI/callback integration, not Nest business behavior. Missing environment behavior is a compatible provider invitation and magic-link email template. Default provider verification can redirect access/refresh tokens in a fragment, which is rejected by006's server-only design. A real email-template fixture and later approved provider configuration are required; no browser fragment extraction fallback or password-reset substitution.

## Routes and operation mapping

| Web/BFF path | Existing upstream / shape | Guard and state |
|---|---|---|
| `/settings/team` | GET `/v1/app/team?limit=...&cursor=...` | Current admitted user, team.read; page-local search only unless all pages explicitly loaded; do not claim global search |
| GET `/api/app/team`; PATCH `/api/app/team/{memberId}` | GET team; PATCH `{role?,status?,revision}` with at least one changed field | Owner field capabilities for mutation; active/disabled and owner/member only |
| GET/POST `/api/app/invitations` | GET paginated offers; POST `{email,idempotencyKey}` | Owner-only offers; role always Member; success200 still has separate delivery state |
| POST `/api/app/invitations/{id}/revoke` | `{revision}` | Current same-workspace offer, Owner capability |
| POST `/api/app/invitations/{id}/reinvite` | `{revision,idempotencyKey}` | Explicit new offer; unknown prior outcome fences it |
| POST `/api/app/invitations/{id}/accept` | `{displayName}` | Valid current Auth session, verified matching identity; deliberately do NOT require a successful me first |
| GET `/auth/invitation` | Capture validated invitation UUID and typed token-hash challenge only | No provider verify/app write on GET; strip secrets via303 to `/auth/invitation/accept` |
| POST `/api/auth/invitation/verify` | Auth `/verify` with exact `invite` or `magiclink` and server-held token_hash |006 begin/context/CSRF; purpose-restricted invitation session, no general app data |
| POST `/api/auth/invitation/password` | Auth `/user` password update for the NEW-user invite flow only | Restricted verified invitation session; provider policy/error mapping, no app password storage |

Generated Nest payloads/responses remain the sole types. BFF auth-only DTOs are small local contracts, not a second OpenAPI. Bound list limits1–100, default50; UUID cursors, required revisions1–2147483646; display names trimmed/nonblank1–100 Unicode code points without controls/malformed Unicode. Do not send sample fields or recipient email in the membership patch.

AppMemberPage/AppInvitationPage carry the canonical pagination envelope; PATCH member returns AppMemberResult. Create/reinvite/revoke return AppInvitationResult; accept returns AppMemberResult, so it is not a substitute for the subsequent AppMe admission read. AppInvitation carries id/email/fixed member role/status/delivery/revision/expiresAt. No new persisted entity, migration or copied authoritative schema is introduced.

## Journey-to-contract and evidence matrix

Use the frozen [OpenAPI0.4.0](../001-connectivity-foundation/contracts/openapi.json) identity recorded in006. [Accepted005 evidence](../005-app-foundation/quickstart.md#actual-backend-verification-receipt) is historical: config/HTTP28/28, real Auth→Nest→DB9/9 and affected concurrency9/9; T039/T040/T042/T043 cover these BE paths. None proves FE/browser delivery.

| Journey | Actual contract and errors | BE implemented evidence | FE task / missing work | Joint acceptance |
|---|---|---|---|---|
| Owner creates/reconciles offer | AppInvitationCreate/Reinvite/Revoke → AppInvitationResult;400,403,404,409 revision_conflict/invitation_conflict,503 delivery_unavailable/dependency_unavailable | T040/T042/T043 offer/idempotency and uncertain-send behavior | T003–T006: generated operations, real offer UI, explicit stable-key replay/status separation | Actual invite email; no new key/resend on uncertainty, state/revision survives reload |
| New/existing recipient joins | Provider invite/magiclink verify; AppInvitationAccept `{displayName}` → AppMemberResult, then AppMe;401/403/404/409/503 | T040/T043 actual new/existing users, concurrent acceptance and changed/revoked/expired offers | T007–T009: shared typed challenge transport, new-user password, explicit accept/promotion | Real captured email→Auth→explicit accept→one membership; wrong/replayed/stale/disabled paths deny |
| Current roster/role/status | AppMemberPage; AppMemberPatch `{role?,status?,revision}` → AppMemberResult;400/403/404/409 revision_conflict/last_owner | T039/T042/T043 capabilities/scoping/last-owner races | T004/T010–T012: real bounded roster, Owner controls, conflict reload and current-session invalidation | Member read-only/direct mutation denial; Owner changes persist; last active Owner survives concurrency |


## Callback and acceptance state machine

1. Under later setup authority, configure both invitation and existing-user magic-link templates to direct to the exact BE-supplied RedirectTo with TokenHash and the matching literal type. RedirectTo already carries `invitation=<uuid>`; append parameters without creating an open redirect. Use the pinned local GoTrue template mechanism during real E2E. Exact hosted callback/template delivery is a separate setup gate, never inferred from local evidence.
2. GET callback accepts exactly `invitation`, `token_hash`, `type`; validate one UUID, nonempty bounded hash and type `invite|magiclink`, rejecting duplicates/unknown fields. Apply006's [shared email-challenge extension](../006-login-session/contracts/session-bff.md#shared-email-challenge-extension-for007-and009), then303 to `/auth/invitation/accept?invitation=<validated UUID>`. No provider verify/app mutation on scanner GET. Missing/fragment-style tokens get a safe unsupported/expired-link state, not JS token extraction.
3. User explicitly continues; acquire006's transition lock, acknowledge begin, then POST verify `{generation,challengeId}` with CSRF. Shared restricted cookie purpose is invitation. Existing magic-link users are not asked to reset a password; new invite users establish a password with `{password,generation}` through Auth and record that phase before app admission. Callback cookies, expiry, challenge consumption and late-response rules are owned only by006's contract. No common `page.tsx` and `route.ts` at the same pathname.
4. Display the verified identity and request display name; explicit accept forwards exactly one app acceptance operation. No roster/workspace reads beforehand. No general proxy membership bypass. Matching already-verified normal sessions may accept their known UUID after sign-in even if me currently403; do not add a recipient offer-list API merely to render this form.
5. On confirmed accept, call current me and promote the session through the shared006 mechanism, then navigate to `/application`. An app timeout is unconfirmed: re-read current me/offer state where authorized and retry only the SAME idempotent acceptance identity if explicitly requested, not a new invitation. A committed Auth password change is not rolled back when app acceptance fails.
6. Revoke/reinvite and role/status changes reload their actual revisions. Same idempotency key+same create/reinvite input is an explicit reconciliation-safe replay; never generate a new key automatically after unknown delivery. A pending/unknown provider result requires the existing separately approved operator reconciliation; do not expose its CLI as a web endpoint.

Invite status and delivery are separate columns. Callback/acceptance states do not turn an accepted Auth challenge into membership until the backend commits. Disabled members and stale inviter authority remain conflicts; do not silently upgrade/reactivate.007 may extend006's safe return allowlist only with `/auth/invitation/accept?invitation=<validated UUID>`, never callback token hashes or arbitrary URLs.

## FE/BE/integration ownership and parallel work

- FE Team writer: existing `apps/web/src/features/workspace-foundation/team-screen.tsx`, `member-search.ts`, narrowly shared `workspace-foundation.module.css`; existing `apps/web/src/app/settings/team/page.tsx`; new `apps/web/src/app/api/app/team/route.ts`, `team/[memberId]/route.ts`, `invitations/route.ts`, `invitations/[id]/{accept,revoke,reinvite}/route.ts` under `api/app/`.
- FE invitation writer: new `apps/web/src/features/app-session/invitation.ts`, `features/workspace-foundation/invitation-screen.tsx`, `app/auth/invitation/route.ts`, `app/auth/invitation/accept/page.tsx`, `app/api/auth/invitation/{verify,password}/route.ts`. Common cookie/session/caller allowlist extensions are assigned to ONE integration owner, never simultaneous007/009 edits.
- BE owner: existing `apps/api/src/app-foundation/{application/service.ts,adapters/auth-admin.ts}` and `apps/api/tests/app-foundation.integration.test.ts`; confirm existing behavior and extend meaningful failure coverage only under later authority. No speculative BE rewrite/canonical change.
- Integration owner: existing `apps/web/tests/e2e/application.spec.ts`,006 `apps/web/tests/e2e/app-session-fixture.ts`, existing `apps/web/tests/functional/workspace-foundation.test.ts` plus new `apps/web/tests/functional/invitation.test.ts` for actual boundary logic. Own the granted local Mailpit/template fixture adaptation and cleanup receipt; synthetic IDs only.

After006 interface/acceptance, Team UI and BE behavioral work are disjoint;008 Settings and009 Recovery screen files may proceed independently.007 recipient callbacks and009 recovery callbacks share only006 helpers/config/test harness: sequence those edits, not concurrent writers. Real Auth email scenarios share a fixture and run serially. No execution or agent start follows from this planning graph.

## Functional and real E2E acceptance

Functional: exact operation/header/CSRF validation, cursor/revision input, separate status/delivery projections, idempotency-key preservation, safe role/status controls, callback type/purpose/UUID tampering, no GET verify, no raw fragment fallback and unknown outcome handling.

Real E2E: Owner login→invite NEW identity→capture actual local email→explicit verification/password→accept→persisted me/membership; repeat for EXISTING verified identity via actual magiclink without reset. Exercise Member read-only access, reload/pagination, role/status changes visible in another session, simultaneous acceptance/last-owner changes, changed email, wrong/expired/revoked link/offer, stale inviter, disabled-member re-invite and actual audit/state invariants. Provider-acknowledgement loss may use a clearly labelled synthetic adapter test; it cannot replace actual email/acceptance.

Extend the006 isolated production-build/browser setup and existing application suite, not new shared ports/default `.next` or a duplicate per-feature harness. Reuse canonical web test/lint/typecheck/build/E2E scripts only after grants; record exact affected commands/results/screenshots/cleanup in this plan when executed. Preserve keyboard access, errors, pagination and1440/360/390 overflow behavior. No tests or visual checks run in planning.

Bounded validation guide: follow [006 quickstart](../006-login-session/quickstart.md) unchanged for commands, flags and BE→FE→BE resource handoff; extend its single serial application suite with this feature's scenarios. BE owns fresh DB/Auth/mail/API identities, FE owns isolated web/browser; protect preview3000/session6634/default `.next`. Record later results here, including failed attempts and owned cleanup. No separate quickstart/model/schema copy is needed: this plan's operation/state/ownership sections are the small dependent feature's design artifacts.

## Gates and constitution

One API/history, existing entities, no new role/password subsystem, English artifacts and real journey acceptance satisfy project governance. Actual owner/sender/callback inputs, local fixture/template authority and implementation/file leases remain required; approved policy is not reopened. Production adoption depends on [001's single versioned migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only), not duplicated tasks or a bypass.005 acceptance/history/docs remain untouched; this plan does not close its mixed parents or authorize setup/publication/deployment.
