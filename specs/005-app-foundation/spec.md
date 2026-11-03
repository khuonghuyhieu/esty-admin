# Feature Specification: Internal App Foundation

**Feature identifier**: `005-app-foundation` (not a new Git branch)  
**Working branch**: Existing `main`, supplied by the coordinator; not rechecked with Git in this planning increment.  
**Status**: **READY_FOR_OWNER_BE_HANDOFF — scoped BE source/local work and single review accepted; not FE/browser/hosted/product-ready**
**Input**: Implement the approved backend foundation in the existing sole OMP pane after plan alignment and read-only consistency analysis. FE/BFF/browser implementation is a separate future handoff.

## Authority and boundaries

The owner's earlier “OWNER APPROVED BASELINE + BE SOURCE/LOCAL BEGIN” instruction authorized sole OMP p12 implementation of apps/api/feature005, separately coordinated canonical OpenAPI/BE generation, and specifically granted dependency/resource actions. Those actions are complete; the accepted single review is recorded in [quickstart.md](quickstart.md#accepted-scoped-be-review). Current authority supersedes source work with tiny feature005 documentation-only closeout, then STOP WRITES; code/config/dependencies/generated files/migrations remain frozen, with no check reruns or new resource jobs. FE generated output and future BFF/browser work require a new cross-lane handoff. Existing FE preview/shared services/dependencies, unrelated bytes, old records/artifacts and unleased shared documents remain untouched. No Git/publication, cloud SQL/Auth/email/provider/DNS/deployment/private-original/setup action is authorized. Original mixed acceptance tasks remain open; baseline policy is not re-asked.

Architecture already selects Next.js, NestJS, PostgreSQL/Supabase and Supabase Auth. Selection is not permission to activate Auth. Feature004's login/team/settings UI and Admin/Operator/Viewer examples are illustrative, not an approved access policy, real identities or persistence requirements. This feature must eventually replace relevant preview interactions with real behavior only after explicit cross-lane implementation approval; it does not reinterpret feature004's checked local UI tasks as real authentication.

**Owner-approved baseline**: one internal workspace, fixed Owner/Member roles, Owner team/workspace administration, self-profile access for both roles, invite-only admission with a controlled first owner, Supabase email/password plus recovery, minimal display/workspace names and read-only Auth email. Future workspace-aware identifiers are a boundary, not a multi-tenant product. No Etsy, orders, catalog, supplier, shops, customer onboarding, billing, queues, separate services or general-purpose permission-builder is included. Actual owner identity, sender/SMTP and retention are not supplied or implicitly approved; they gate real setup/activation, not independent BE source/local work.

## User Scenarios & Testing

### US1 — Sign in, maintain a session and sign out (Priority: P1)

An admitted internal user signs in with Supabase Auth, accesses the application under their current membership, survives a normal token refresh and signs out with an explicitly selected scope. No local password database exists.

**Independent test**: With a provisioned synthetic identity and active membership, exercise authentication and a protected NestJS operation; separate browser E2E later proves the complete journey.

1. Given valid credentials and active membership, when sign-in completes, then the application shows that identity's permitted workspace data, not preview data.
2. Given invalid credentials or an unauthenticated request, when access is attempted, then no application data is returned and a safe authentication error is shown.
3. Given an expired access token and a valid refresh session, when refresh succeeds, then the same identity can continue without changing membership or capabilities.
4. Given a revoked session or disabled membership, when a subsequent protected request is admitted, then access is denied even if an old JWT has not expired.
5. Given logout, concurrent refresh or a delayed response, when the UI settles, then stale state cannot restore access; provider failure is not reported as confirmed global revocation.

### US2 — Establish and administer the internal team (Priority: P1)

A trusted operator establishes the first owner through an explicitly approved, non-public bootstrap. An authorized owner can invite a colleague and change or disable membership within the approved policy.

**Independent test**: Controlled bootstrap plus two synthetic users; inspect actual membership/audit outcomes, including concurrent mutations, without browser fixtures being counted as production evidence.

1. Given no initialized workspace, when the approved operator supplies a verified Auth identity, then exactly one configured workspace and its initial owner are established atomically. Public signup cannot claim ownership.
2. Given an authorized inviter, when an invitation is created and accepted by the matching verified identity, then one membership is granted with the approved role. Delivery acknowledgement alone grants nothing.
3. Given expired, revoked, replayed or wrong-identity invitations, when acceptance is attempted, then no membership is granted or revived.
4. Given a role or status change, when the affected user makes another request, then current server policy applies without waiting for JWT refresh.
5. Given concurrent attempts to remove, disable or demote the remaining owners, when mutations finish, then at least one active owner remains; rejected mutations leave membership and audit state consistent.

### US3 — Recover access without bypassing authorization (Priority: P1)

A user follows a verified Supabase recovery flow. Losing access to the final owner's email requires a separately approved operator recovery procedure, not a public owner-reset endpoint.

**Independent test**: Local Auth/email capture or synthetic provider outcomes distinguish successful password recovery, expired/reused links and delivery uncertainty. Later browser E2E uses a real local Auth flow.

1. Given a recovery request, when an email is submitted, then the public response does not disclose whether that account is a team member.
2. Given a valid recovery challenge, when the user sets a new password, then Supabase owns the credential update and the selected session-revocation policy is enforced; membership is unchanged.
3. Given a disabled member who successfully recovers their Auth account, when application access is requested, then the member remains denied.
4. Given a lost-owner-access incident, when an operator proposes recovery, then identity evidence and explicit approval are required, the action is audited and public bootstrap remains closed.

### US4 — Save minimal settings with appropriate ownership (Priority: P2)

An active member updates their own approved profile fields. An authorized owner updates approved workspace settings. Values persist and changes have bounded audit evidence.

**Independent test**: Save/reload authorized values and assert denied/invalid/stale writes preserve stored values. Later browser E2E proves the real UI→Auth→Nest→DB path.

1. Given an active member, when their own valid display name is saved, then only that profile changes and reload returns the stored value.
2. Given a member without workspace-setting capability, when they forge a workspace update, then the server denies it regardless of hidden or enabled UI controls.
3. Given concurrent settings edits, when a stale revision is submitted, then it is rejected rather than silently overwriting a newer value.
4. Given a security-sensitive identity change, when an ordinary settings request tries to alter email/password/role, then it cannot bypass Auth verification or membership policy.

### Edge cases

Wrong issuer/audience/algorithm/key/subject/session; unsigned or expired JWT; stale JWKS during rotation; Auth or DB outage; refresh races between tabs/SSR/logout; cached user responses; unknown request fields; direct-object IDs from another scope; member disabled during a write; inviter demoted while delivery is pending; duplicate invitation requests and unknown delivery outcomes; email link scanners; existing Auth identity versus newly invited identity; changed email before acceptance; last-owner concurrent demotion; first-owner bootstrap replay; audit write failure; migration committed but acknowledgement/deployment failed.

## Requirements

### Functional Requirements

These requirements apply to the complete feature. The authorized increment implements and verifies their BE source/local portions only; FE/BFF/browser and production acceptance remain open. Routine secure technical choices are resolved in plan/research rather than sent back as baseline policy questions.

- **FR-001**: Use Supabase Auth as identity/credential/session authority for sign-in, refresh, logout and password recovery; never implement another password store or infer app access from successful Auth alone.
- **FR-002**: Separate stable Auth user UUID, global app profile and workspace membership. Membership role/status belongs to the workspace; removing membership must not automatically delete the global Auth user.
- **FR-003**: Enforce the approved capability for every application operation on the server, default deny, and never trust browser state, editable user metadata or preview role labels as authorization.
- **FR-004**: Reject cross-scope/direct-object access and self-to-other profile mutations; scope persistence by server-derived identity/workspace. No public workspace creation or customer/tenant/shop selection is introduced.
- **FR-005**: Establish the first owner through a controlled, idempotent operator process with verified identity and explicit approval. No public bootstrap, first-signup auto-owner or implicit privilege-granting signup trigger.
- **FR-006**: Preserve at least one active owner through role/status/removal operations and concurrent requests; serialize the invariant and recheck the acting user's current authority within the mutation boundary.
- **FR-007**: Implement invitations with explicit pending/accepted/revoked/expired outcomes, matching verified identity, bounded expiry, idempotent creation/acceptance, revocation and reinvite semantics. Delivery failure or uncertainty must not grant access or cause blind resend/replay.
- **FR-008**: Recover credentials through verified Supabase flows without account enumeration or membership reactivation. Lost-final-owner access requires a separate controlled recovery approval and audit trail.
- **FR-009**: Verify JWT signature, configured issuer/audience/algorithm, expiry, user subject and session identifier; enforce the approved revocation policy and current membership independently of JWT role claims. Dependency outages fail closed, not as successful anonymous/owner fallback.
- **FR-010**: Treat `PREVIEW_ACCESS_KEY` as technical protection, never user authentication. Preserve the existing all-non-preflight-route guard until an explicitly approved caller transition; never expose the key to browsers or create an unauthenticated credential-injecting proxy.
- **FR-011**: Protect cookie-authenticated mutations against CSRF, constrain callback/return URLs, bound refresh/error handling, prevent user-response caching and cross-request identity leakage, and redact credentials/tokens from logs and evidence.
- **FR-012**: Persist only approved minimal self-profile and workspace fields, validate allowed fields/lengths, enforce distinct ownership and reject stale writes. Auth email/password and membership changes are separate verified operations, not generic settings fields.
- **FR-013**: Record attributable membership/invitation/bootstrap/settings changes atomically with local mutations. Keep audit visibility Owner-only; retain an explicit production retention-policy activation gate with no invented duration or automatic purge. Do not record passwords, tokens, email-link secrets or unnecessary profile values.
- **FR-014**: Add schema through the existing versioned migration/history/checksum/report mechanism only. Require an approved migration-before-deploy integration because current-schema-only delivery cannot release this feature's new schema. No startup DDL or automatically adopted checksum baseline.
- **FR-015**: Plan and later execute meaningful functional, real Nest HTTP→isolated DB, local Auth and coordinated browser→Auth→Nest→DB E2E checks. Preserve the technical health/readiness boundary and public website routes. Synthetic/local proof is not hosted acceptance.
- **FR-016**: Enforce the current scope's separate approval boundaries: baseline and BE source/local are authorized; dependency mutation, fixture startup and canonical contract ownership require their exact grants. Actual identity/email/retention setup, FE/BFF/browser, production migration integration, live SQL, Git publication and deployment remain separately gated.

### Key Entities

Auth identity and Auth session are Supabase-owned. App profile is user-owned global presentation data. Workspace is the proposed single internal team boundary. Membership connects identity to workspace and policy role/status. Invitation authorizes a bounded membership offer, not an Auth session. Audit event records approved app changes. Exact proposed fields and transitions are in [data-model.md](data-model.md), not an implemented schema.

## Success Criteria

- **SC-001**: An active member completes sign-in → protected application access → token refresh → logout in automated browser E2E; after confirmed logout, replay of the former session cannot retrieve application data under the approved revocation policy.
- **SC-002**: Every approved operation has an allow/deny policy case; missing/disabled membership, stale permission, forged metadata and foreign-object requests produce no unauthorized data or persisted changes.
- **SC-003**: Bootstrap replay and concurrent last-owner mutations cannot create unintended privilege or leave the workspace ownerless. Invitation replay grants at most one membership; expired/revoked/wrong-identity acceptance grants none.
- **SC-004**: Recovery restores credential access only for the verified identity and never changes membership implicitly; failure/unknown email delivery and lost-owner access remain distinguishable from successful recovery.
- **SC-005**: Approved settings survive reload; denied, invalid or stale writes preserve the prior state. Accepted local security/settings mutations have matching authorized audit records without secret payloads.
- **SC-006**: The approved schema transition has exact old/new migration provenance and evidence of migration-before-deploy with unknown outcomes fenced; local/native/API/browser/hosted results are reported separately, without bypassing existing health protection.
- **SC-007**: All policy choices and implementation permissions are explicit before execution; reviewable planning is never reported as working Auth, approved RBAC or deployed integration.

## Decision and setup register — approved baseline, partitioned remaining gates

Approval source: the owner's current explicit instruction in this conversation; no fabricated date, identity, sender or retention period. D01–D06 identities remain stable so prior planning evidence is traceable.

| ID | Current decision | Remaining boundary |
|---|---|---|
| D01 | **APPROVED:** fixed Owner/Member; Owner administers team/workspace; both manage self-profile. Owner-only audit and role/status administration; no dynamic role editor. | Actual users are supplied only through later approved setup. FE preview roles never become policy by inference. |
| D02 | **APPROVED:** exactly one internal workspace with workspace-scoped membership and no public workspace creation. | Workspace identity/name are explicit operator inputs, not seeded production constants. |
| D03 | **BASELINE APPROVED / SETUP DEFERRED:** controlled first owner, invite-only membership, Supabase email/password and recovery. Engineering choices: seven-day app offer, Member-only invite, current-session ordinary logout; verified password recovery followed by global signout/re-login. | Actual first-owner identity, sender/SMTP and real delivery configuration remain manual setup gates. Lost-final-owner recovery requires separate verified operator authority; never reopen public bootstrap. |
| D04 | **BE TECHNICAL DESIGN RESOLVED:** existing technical bearer before DB plus separately verified user JWT; asymmetric ES256/RS256 via maintained jose; fixed issuer/JWKS, current Auth session and current membership per request, no positive auth cache. | No browser/BFF source now. Future same-origin allowlisted BFF owns cookie/CSRF/refresh UI integration and its separate browser proof. Actual hosted signing/credential configuration is not inspected or changed. |
| D05 | **FIELDS APPROVED:** self display name/workspace name only; Auth email read-only; strict1–100-code-point names and revisions; Owner-only redacted audit. | Retention duration/deletion/anonymization not invented. No automatic purge; production activation requires an explicit approved retention-policy identifier. Synthetic local fixtures are not a production retention policy. |
| D06 | **BE SOURCE/LOCAL APPROVED:** existing layers, one canonical contract/history and bounded runtime. Proceed on independent source after scoped analysis; exact canonical OpenAPI/BE-generation ownership is confirmed. | Exact dependency window and fixture startup remain prerequisites for those actions. FE generated consumer and feature001 production migration-delivery implementation remain excluded. The narrow001 plan/tasks alignment lease was returned; shared docs are not currently writable. |

**G0 partition:** approved product baseline is satisfied. Real owner identity/email setup and retention remain explicit later gates, not blanket source blockers. **G1 partition:** apps/api and005 source/doc authority is granted; dependency/resource/contract actions wait only on their own receipts. No claim that all old D01–D06 questions or hosted gates were approved.

## Assumptions and dependencies

The approved baseline targets a small internal team without an invented capacity/SLA. Existing Next.js/NestJS/PostgreSQL and hosting selections remain. No live Supabase Auth settings, signing algorithm, SMTP arrangement or owner credentials were inspected. [research.md](research.md) records official sources and selected BE technical decisions. Public pages, previews and the owner's dev server remain untouched. [tasks.md](tasks.md) preserves T001–T033 and separates current BE subtasks from future FE/browser/release work; backend HTTP evidence never closes browser acceptance.
