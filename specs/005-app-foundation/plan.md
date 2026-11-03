# Implementation Plan: Internal App Foundation

**Feature**: `005-app-foundation` · **Spec**: [spec.md](spec.md)  
**Status: READY_FOR_OWNER_BE_HANDOFF — scoped BE source/local work and its single review accepted; code frozen, setup/FE/production gates remain.**
Existing `main` is coordinator-supplied context; no Git command or branch operation belongs to this increment.

## Summary

The owner approved one internal workspace, fixed Owner/Member, Owner team/workspace administration, self-profile for both, invite-only controlled bootstrap, Supabase email/password/recovery, minimal names and read-only Auth email. The sole OMP implemented the authorized apps/api/feature005 slice after alignment and read-only analysis; the coordinator accepted its single read-only review and authorized only this feature005 documentation closeout before stopping. No baseline question is resent. [The decision register](spec.md#decision-and-setup-register--approved-baseline-partitioned-remaining-gates) distinguishes approved policy from actual setup and resource grants.

## Current authorized BE slice and resolved engineering choices

- Preserve existing source/dirty FE and feature001/003/004 bytes and the running FE session6634. No apps/web, `.next`, BFF, browser checks, new writer/pane/reviewer, Git or real provider action.
- The API stays opt-in through `APP_FOUNDATION_ENABLED`; disabled is not fake success. Hosted activation additionally requires an explicit retention-policy identifier and reviewed setup. No duration/purge is invented. Current production release continues to reject the new migration manifest.
- Keep `Authorization: Bearer PREVIEW_ACCESS_KEY` technical protection before any DB access. New `/v1/app/*` routes additionally require `X-App-Access-Token`; local app-enabled verification explicitly requires the technical key too, while existing feature-disabled local health behavior remains unchanged. No cookie auth or browser technical key is added to NestJS.
- Exact `jose`6.2.15 was installed as the sole API runtime dependency under the granted serial window, then the window was immediately returned. Existing transitive5.10.0 and every preexisting dependency version remain unchanged. Use maintained signature/claims validation, ES256/RS256 only, configured issuer/audience, required exp/sub/session_id and non-anonymous authenticated users; no embedded keys/HS256 fallback. Fixed JWKS URL, bounded public-key cache/fetch/cooldown and no positive session/membership cache.
- Use bounded native-fetch adapters for documented Supabase Auth REST operations; no full data/storage SDK. Current session lookup uses only the approved app-owned boolean interface by verified session_id+sub, not direct runtime Auth-table reads. Current user/verified email is obtained through trusted Auth behavior, never editable metadata. Auth owns all Auth schema migrations.
- Ordinary logout uses explicit `scope=local`; recovery uses the provider challenge/password update then explicit global signout and fresh login. Verify actual provider behavior locally rather than assume password change alone revokes JWTs. No paid timebox/inactivity controls are assumed. Row existence is not a promise of instantaneous cancellation of in-flight writes.
- App invitation expiry is seven days, role Member only; new identities use provider invite and existing verified identities use provider OTP with creation disabled. Auth email proof and app POST acceptance are separate. Sender is disabled/fail-closed by default until explicit real setup; tests use only synthetic local capture. No fallback from an uncertain invite send into another email action. Reserve durable intent; a timeout/crash/unknown outcome fences resend/reinvite until an explicitly recorded reconciliation. No raw provider payload/link/token is logged.
- One app schema, one configured workspace, profile UUID separate from membership. Serialize workspace/actor/target writes; guard last active Owner at the DB boundary as well as services. Strict revisions, private scoped queries and atomic append-only audit. Names are trimmed/nonblank1–100 Unicode code points; Auth email is read-only; audit read Owner-only.
- Default-deny for unknown capabilities/roles, cross-workspace/direct-object access and stale membership. Exact current permission check is repeated under transaction locks before mutation. Existing pool/TLS/attachDatabasePool, cancellation/shutdown and health liveness remain intact.
- Future BFF/cookie/CSRF/browser design remains a FE handoff, not a BE source prerequisite. Prefer a server-only HttpOnly Auth boundary for that future integration; it must implement the whole Auth lifecycle instead of marking standard browser SDK cookies HttpOnly. No FE dependency or implementation is selected/installed now.

### Current grants versus independent gates

G0 baseline and G1 apps/api+005 source authority are granted after alignment/analysis; exact canonical OpenAPI/BE-generation ownership is confirmed. The dependency install completed under its separate fresh receipt; no further package/lock mutation is authorized. Dedicated Auth fixture startup/corrections have separately bounded root receipts recorded in research; healthy service status alone is not application acceptance. Actual owner/sender/SMTP/retention, future FE/browser and G3/G4 remain separate gates. READY_FOR_REVIEW requires actual BE checks, not merely source or build completion.

### Actual ownership and execution receipts

Canonical OpenAPI0.4.0/BE types were updated; exact delta/hash was sent to FE without touching its generated consumer. The fresh FE p0 pause allowed only small additive005 alignment in001 plan/tasks; both leases were returned directly. No further001 plan/tasks, README or STATE writes. Initial blocked coordinator prompts remain historical; later explicit dependency/resource receipts superseded only those pending actions, not other scope boundaries.

The selected application module, operator CLI, new versioned app migration and guarded real-Auth journey exist. Config/HTTP/startup and synthetic artifact/CI/release checks have actual, separately reported results and retained failures. Dedicated fixture startup required public Compose discovery, the narrow Auth-role namespace correction and a no-login/no-power `postgres` compatibility role required by pinned GoTrue migrations; no broad grants, image changes or private config reads were used.

Actual internal-network host publication was repaired through the separately approved fixed-target loopback helper without changing the healthy containers/network. The guarded journey reached migration apply/replay and real Auth verification, then proved managed-session RLS filters column-only runtime reads (admin matching row1, runtime0, no policies). Root explicitly approved the D06 technical correction below; this is not a hosted setup grant.

### D06 correction approved before implementation

- Append exactly `1792972800002-app-session-check.mjs` in the same migration history; preserve already-applied `1792972800001-app-foundation.mjs` byte-for-byte. Keep current production manifest rejection.
- Add only app-owned `app_private.has_current_session(uuid, uuid) RETURNS boolean`, SECURITY DEFINER with fixed `search_path=pg_catalog`, fully qualified parameterized reads of `auth.sessions` id/user_id/not_after and no dynamic SQL/raw-row output. Explicitly reject active RLS for the definer owner as dependency failure (safe503), not false401. Use only existing fixture migration-owner privileges; never grant BYPASS/superuser or alter managed Auth RLS/schema.
- Revoke PUBLIC execution and grant only `app_runtime`; switch the service to the boolean interface. Revoke only this run's obsolete runtime SELECT grant on the exact three Auth-session columns. No wildcard/preexisting/shared/hosted privilege changes. Record real function owner/ACL/read denial and wrong-user/session/revocation behavior.
- Make local reruns failure-safe only after exact loopback/current-database/current-user/run-marker checks: delete rows from allowlisted app tables without touching history/markers; Auth identity removal goes only through fixed local GoTrue admin API for identities proven in a run-owned UUID/email/nonce creation registry. No direct managed Auth data SQL, arbitrary/external deletion or blind cleanup retry/success.
- Hosted function ownership, exact privileges and managed-schema compatibility remain future activation gates. Update actual evidence and obtain the single coordinator-run review only after authorized local acceptance; no FE/browser/cloud claim.

Actual correction acceptance: the real guarded journey passed9/9, and its affected concurrent-admission/registry rerun passed9/9; config/HTTP28/28 and exact three-file current-schema rejection1/1 passed. Applied001 stayed immutable. Both registered-identity cleanups and exact fixture/helper teardown were confirmed. The live fixture did not exercise a non-NULL session-timebox boundary; expired recovery and synthetic expired JWT denial were covered. Exact source hashes, commands, retained failures and remaining gates are in [quickstart.md](quickstart.md) and [research.md](research.md). The subsequent [accepted scoped BE review](quickstart.md#accepted-scoped-be-review) resolves the review gate without a source fix or check rerun; it does not authorize publication or close FE/hosted/product acceptance.


## Historical planning detail — retained, superseded where the current slice resolves it

The sections below preserve the initial owner-review draft. Their blanket unapproved/source-stop wording is historical; the current decision register and BE slice above govern execution. FE/BFF/browser and real setup/release requirements remain future acceptance rather than being deleted.

## Technical context and constraints

- Retain installed TypeScript/Next.js/React and Node24/NestJS modular-monolith direction. No framework/runtime switch, dependency install or root package/lock change now. Supabase Auth SDK/JWT-library versions and SSR beta compatibility require later dependency approval; do not assume they are installed.
- Reuse `apps/api/src/` transport → application → adapter boundaries, existing pool/TLS/cancellation controls, generated contract and migration metadata. Preserve the current `attachDatabasePool` lifecycle and bounded request/query cancellation.
- Existing Vercel FE/BE projects and final `api.lovora.us` + Supabase-cloud acceptance remain the hosting direction. This draft neither accesses nor changes those resources.
- One internal workspace proposed; no fabricated user count, latency SLA or paid-tier session feature. Added Auth/JWKS/DB work must fit existing request/function deadlines; verification must measure the actual path and cancellation rather than increase limits silently.
- Only new `specs/005-app-foundation/**` documents are written now. Existing README, PROJECT_STATE, architecture, feature001/004, shared pointer, source and workflows remain outside the write set.

## Constitution check

| Principle | Planning assessment | Execution gate |
|---|---|---|
| I: Evidence before stack selection | Existing stack retained; official Auth research cited; no live configuration claims | D01–D06 answers and explicit implementation authority required |
| II: Small executable architecture | One FE, one modular API, one DB; no queue/service/shared package; one canonical OpenAPI | Approve minimal SDK/verification dependencies and exact integration paths |
| III: Verify each deliverable | Planned functional, Nest HTTP+DB, local Auth and genuine browser E2E are distinct | No runtime test/build/SQL run authorized in this increment |
| IV: One current context | Feature documents own this proposal; register in spec, execution tasks in tasks; no duplicate roadmap | Draft exception is owner-requested; unresolved policies block a resolved plan |
| V: Scope/UI discipline | No business modules; feature004 examples do not define policy | FE source cutover needs coordinator ownership and relevant UI/React skills |

No architecture-principle exception is requested. The owner-requested unresolved planning draft is explicitly not implementation readiness. No new issue/Notion tracker, reviewer, writer or pane is created.

## Approval gates and delivery order

1. **G0 — Owner policy/flow approval:** Resolve D01–D05, including bootstrap identity procedure, actual capability matrix, invitation/recovery/email behavior, settings/retention and caller/session choice. Record the actual response/source without inventing an approval date.
2. **G1 — Explicit source/local scope approval:** Resolve D06, dependency/version plan, canonical-contract ownership, FE/BE boundaries, fixture resources, commands and stopping point. This gate precedes ANY source/Auth/migration implementation. Policy approval alone is not a writer lease.
3. **G2 — Local implementation verification:** Only under G1, implement and test approved paths. Local Auth infrastructure and loopback fixtures need explicit resource authorization; preserve shared services/volumes. Use only coordinator-approved exact endpoints; the existing BE fixture convention is loopback55432 and is not newly authorized here.
4. **G3 — Schema-changing delivery handoff:** Before a schema-changing release, feature001 must gain separately approved and verified migration-before-deploy integration. Keep current-schema-only rejection intact until that work is complete.
5. **G4 — Publication/setup/hosted acceptance:** Separate approvals for Git publication, real Auth/email/provider configuration, SQL, artifact release and deployment. A local functional or browser pass does not satisfy G4.

No gate is marked complete. Later source/local work can be considered only after G0/G1; no automatic continuation from this planning handoff.

## Candidate capability matrix — proposal only

D01 must accept or replace this fixed-role baseline. These are not the Admin/Operator/Viewer policies from feature004, and the display names themselves are unapproved. Unknown roles/capabilities deny. Only active members of the configured workspace are considered.

| Operation / capability | Candidate Owner | Candidate Member | Additional server condition |
|---|---|---|---|
| Read own profile / `profile.read.self` | Allow | Allow | Subject derived from verified Auth UUID |
| Edit own display name / `profile.update.self` | Allow | Allow | Approved field allowlist and revision |
| Read team roster / `team.read` | Allow | Allow | Minimal approved fields only; D01 confirms visibility |
| Invite member / `team.invite` | Allow | Deny | Approved role only; owner grant is not an invitation default |
| Revoke/reinvite / `team.invite.manage` | Allow | Deny | Same workspace; current inviter authority rechecked |
| Assign role / `team.role.assign` | Allow | Deny | Explicit owner promotion/transfer, concurrency invariant |
| Disable/reactivate member / `team.membership.manage` | Allow | Deny | Last-owner rule; reactivation is explicit, never recovery side effect |
| Read workspace settings / `workspace.read` | Allow | Allow | Approved projection only |
| Edit workspace name / `workspace.update` | Allow | Deny | Approved field allowlist and revision |
| Read audit / `audit.read` | Allow | Deny | D05 retention/visibility and bounded pagination |
| Create/delete workspace, arbitrary permission editing | Deny | Deny | Not in proposed baseline |
| Delete Auth identity, impersonate or bootstrap via HTTP | Deny | Deny | No public app capability; controlled operator procedure only |

Password recovery, sign-in and logout are Auth lifecycle operations, not workspace-role grants. A valid identity with no membership may complete recovery or accept its valid invitation, but cannot read workspace data. Role policy is server-owned/versioned code in this proposal; role assignments/status are DB state. If the owner requires dynamic role definition editing, amend this model/contracts/tasks before implementation rather than ship a disabled substitute.

## Hosted caller and authentication boundary — D04 proposal

### Recommended path

Browser → same-origin Next.js Auth/session handling and allowlisted business BFF → NestJS → PostgreSQL. Supabase Auth remains the credential/token issuer; the BFF does not implement passwords or business authorization.

For future `/v1/app/*` routes, retain the existing API `Authorization: Bearer PREVIEW_ACCESS_KEY` technical gate, then require a user JWT in the proposed `X-App-Access-Token` header. This keeps the existing technical guard on every non-preflight API route, including health and unknown routes, rather than adding public JWT-only exceptions. Header naming and routing are proposals, not a changed contract. Existing health endpoints keep their current technical-only semantics and are not exposed by this BFF.

The BFF authenticates the user before attaching the technical key, rejects unknown method/path/body combinations, selects a fixed configured API origin and constructs headers itself. It never forwards arbitrary URLs, client-supplied technical headers, body-supplied actor IDs or arbitrary downstream paths. Public Auth sign-in/recovery/callback routes communicate with Supabase under the selected Auth flow, not an unauthenticated technical-key proxy to NestJS. A user without membership is denied by NestJS before any workspace data access. CORS and platform deployment protection are not authentication.

Alternative: conventional `Authorization: Bearer user-JWT` plus a dedicated server-only technical header would require explicit changes to the existing guard and health/unknown-route contract. Direct browser→API JWT-only routes would remove the current technical requirement and are not the recommendation. Neither alternative is silently permitted.

### Token and request lifecycle

Use the documented SSR browser/server cookie lifecycle only if D04 accepts browser-readable user tokens. The technical API key is never in browser cookies, bundles, HTML, `NEXT_PUBLIC_*`, client headers or screenshots. A server-only HttpOnly Auth adapter is an alternative requiring an explicit final design; do not claim that setting HttpOnly on the standard browser SDK is sufficient.

Server clients are request-scoped. Use HTTPS Secure/host-only cookies and an approved SameSite policy; local HTTP exceptions must be loopback-only. Cookie-authenticated BFF mutations require exact allowed Origin and a bound anti-CSRF mechanism, not CORS or SameSite alone. Callback types/PKCE state and return destinations are allowlisted; no arbitrary redirect. User/session responses are private/no-store, never authenticated ISR or shared cached responses with Set-Cookie.

NestJS first applies technical protection, then verifies the user JWT against configured issuer/audience/algorithm/expiry and UUID `sub`/`session_id`. Require an ordinary authenticated, non-anonymous identity, not a service-role API key. Fixed JWKS origin, bounded cache, one bounded unknown-key refresh and explicit rotation policy prevent attacker-chosen key fetches; failure remains closed. Do not import a signing secret or silently enable an alternate signing mode.

After cryptographic validation, check the matching Auth session still belongs to that user and the current membership is active. Proposed narrow read-only session-existence access must be approved/tested; do not modify Supabase-managed Auth tables. This denies replay after confirmed sign-out but does not claim timebox/inactivity enforcement solely from row existence. If the owner requires those limits, D04 must specify enforceable rules without assuming a paid tier.

Refresh uses documented provider semantics, with bounded browser request coordination and no indefinite retry. Separate server instances do not share an in-memory lock. Expired access can trigger one controlled refresh; invalid/reused refresh requires reauthentication. Concurrent tab/SSR refresh, late Set-Cookie, logout and membership-disable cases need explicit functional/browser proof. A stale UI/cookie cannot authorize access after server revocation. Normal logout proposes explicit `local` scope; reset/global signout semantics remain D03 decisions. Do not report provider timeout as confirmed revocation.

## Authorization, persistence and concurrency

NestJS application services own authorization. Validated Auth UUID and the configured internal workspace derive scope; UI role state and JWT metadata never grant capabilities. Every persistence query uses parameterized scope predicates. Object lookup must not disclose foreign IDs; known-scope missing/foreign objects share a safe404, while authenticated users without required capability receive403 before mutation.

For membership/settings mutations, establish one lock order: workspace row, acting/target membership rows in stable UUID order, target record, then audit insert. Recheck actor authority while holding the serialization boundary and use row revisions for stale-edit conflicts. Last-owner disable/demotion/removal must count active owners under the workspace lock, including simultaneous requests. Ownership transfer first establishes the confirmed successor and then removes old ownership in one transaction, never an intermediate ownerless state. A DB-level membership deletion/demotion safeguard should defend any approved non-HTTP mutation path; no direct operator bypass is assumed safe.

Reads use current membership per request. The authorization decision is the admission point; an already admitted read may finish while a later disable commits. A write's authorization and mutation are serialized so a demotion/disable cannot be ignored at its effective mutation boundary. No cross-request positive authorization cache initially. Dependency failure is503/timeout, not permission to use stale membership. Audit failure rolls back local security/settings mutations.

Use a non-exposed app schema and explicitly revoke browser-role access; only NestJS runtime operations receive narrowly required privileges. Supabase Data API access to these tables is not a second frontend data path. RLS/grants must be tested with actual intended roles if adopted; an existing direct PostgreSQL owner connection does not automatically carry per-user RLS context. Prefer the smallest approved runtime/operator separation; do not claim it exists now.

## Bootstrap, invitation and recovery

The bootstrap is a later explicitly approved operator command, not a route: verify a supplied Auth UUID/email ownership through trusted Auth administration, serialize workspace initialization and create exactly one initial Owner membership plus audit record. Exact replay is idempotent; a different identity against initialized state conflicts. No first-login ownership, embedded production UUID, public signup privilege or automatic bootstrap reopening.

App invitations carry a bounded membership offer independently of Supabase sign-in. Acceptance requires the matching currently verified Auth email/identity, current invitation state/expiry, approved target role and a transaction lock. GET/email preview does not accept membership. Accepted replay by the same identity is idempotent; another identity cannot claim it. Reinvite supersedes/revokes the previous offer and challenges; disabling a member must not be reversed by an old invitation.

D03 must approve how both newly invited and existing Auth users receive the offer and authenticate. Provider invite APIs and generated links have different email-delivery responsibilities. An Auth-created user with no accepted app invitation has no workspace access. Delivery is outside the DB transaction: reserve a unique operation, record outcome as confirmed/failed/unknown, and reconcile uncertain acknowledgement before an explicit resend. Do not promise exactly-once email or auto-delete orphan Auth users. Recheck issuer authority before accepting a previously issued offer; demoted/disabled inviters cannot leave a live privilege-granting channel.

Recovery uses a flow-bound provider challenge and approved password update, with generic public request responses. Validate expiration/reuse/type and safe redirect handling. Password/email changes cannot enter through the profile patch. Lost-final-owner email access needs verified operator recovery with separate explicit approval and audit; no role inferred from claiming the same email or knowing the technical key.

## Settings and audit

Propose only `profile.displayName` and `workspace.displayName`, each trimmed/nonblank and1–100 Unicode code points; confirm limits under D05. Auth email is read-only in baseline UI and read from trusted Auth data, not editable profile metadata. If email editing is approved, add a dedicated verified Auth flow and its tests before implementation. Never persist feature004 fixtures wholesale.

Use revision-based optimistic concurrency, reject unknown patch fields and retain disabled memberships for audit rather than hard-delete them. Audit events store actor/target identifiers, action, field names, revisions, outcome and request correlation, not token/email-link/password payloads or full profile before/after snapshots. D05 decides retention, audit readers and invitation-email deletion/anonymization. Local data mutations and audit are atomic; provider operations need separate intent/outcome evidence because an HTTP Auth/email call cannot share the SQL transaction.

## Migration and release handoff

Reuse `apps/api/migrations/`, node-pg-migrate history, generated manifest and existing report contract. New migration files must append to the approved history; never edit an applied migration or create a parallel Supabase migration ledger. Auth schema is provider-owned; app migrations may reference its stable primary key and approved read interface, not rewrite its internals.

Feature001's current-schema-only CI intentionally rejects a new manifest. Its [future integration proposal](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only) is not implemented permission. A separate handoff must approve old→target manifest hashes, exact reviewed source/tree/immutable artifact, operator privileges, predecessor compatibility and migration-before-deploy serialization. Feature005 cannot bypass this by updating the baseline checksum.

Require confirmed migration/history completion before provider creation/promotion. Confirmed SQL commit followed by lost acknowledgement/deploy failure must not replay DDL; unknown outcomes fence new releases until separately authorized reconciliation. Plan additive schema compatible with the still-serving predecessor; rollback of application code is not automatic destructive schema rollback. No production DDL, provider setup or workflow activation occurs here.

## Project structure and ownership proposal

Current documents: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/proposed-api.md`, `quickstart.md`, `tasks.md`, `checklists/requirements.md` under this feature only.

Future proposed backend module: `apps/api/src/app-foundation/{transport,application,adapters}/`, wired through existing `apps/api/src/app.ts` and config. Future operator procedure: `apps/api/scripts/bootstrap-app-owner.ts`. Extend existing API HTTP/integration/config test files rather than make a second delivery suite. Exact new migration name is allocated only after approval, under `apps/api/migrations/`.

Future FE integration stays in existing workspace-foundation screens/routes and application shell; use `apps/web/src/features/app-foundation/` for real session/caller integration, not a duplicate preview app. Coordinator must settle FE source ownership first. Existing functional/E2E suites are extended. Apply installed frontend/Doodle/accessibility/React skills at that future source stage and preserve public routes/readability.

The existing sole authoritative OpenAPI is `specs/001-connectivity-foundation/contracts/openapi.json`. These prose notes propose additions; a future explicitly authorized handoff extends that same schema and generates FE/BE transport types. No second OpenAPI or manually duplicated transport types are created now.

## Verification design

See [quickstart.md](quickstart.md) for separated evidence levels and [tasks.md](tasks.md) for dependency-ordered work. Cover policy allow/deny, JWT/session rejection, cross-object isolation, invitation/recovery lifecycle, concurrent owners/refresh, settings conflicts, audit atomicity, private-data grants and migration uncertainty. Keep existing health/technical-access/cancellation/public-route regressions. Only actual coordinated browser→local Auth→Nest→DB interactions count as local E2E; HTTP tests and mocked Auth do not. Later real hosted checks remain a separate approval/evidence gate.
