# Feature Specification: Login and Current Session

**Feature**: `006-login-session` · **Status**: READY_FOR_OWNER_PLAN_REVIEW — planning only, implementation not started.
**Input**: The owner's direct four-feature decomposition supersedes the old monolithic005 planning proposal. This does not approve or answer another pane's dialog.

## Purpose and authority

Deliver one usable journey: sign in → current identity/membership → protected application → sign out. A completed FE lane or an already-tested BE endpoint alone does not complete this feature. Keep the accepted005 source/history/documents unchanged; use its real API rather than rebuild authentication or membership.

The approved baseline remains one workspace, Owner/Member, invite-only admission and Supabase email/password. No registration, password store, new business module, role-policy question, recovery or invitation implementation belongs here. All source, tests/builds, servers, dependencies, Git, Auth/DB/provider/cloud/private/setup and shared-document actions need later authorization. Existing owner preview3000 and shared services remain untouched.

## User Scenarios & Testing

### US1 — Sign in to the protected application (P1)

**Value**: An admitted user reaches the existing application with their actual identity, not a sample user.
**Independent acceptance**: Use an approved synthetic admitted identity with real local Auth, Nest and PostgreSQL, through the actual production-built web UI.

1. Valid credentials and active membership lead from `/login` to `/application`; header/profile show the current `/me` identity and capabilities.
2. Invalid credentials show a generic error; no protected data or success navigation occurs.
3. Valid Auth without active membership shows an access-unavailable state with sign-out, not the dashboard. Disabled membership is not reactivated.
4. Direct access, refresh and back navigation to `/application`, `/settings` or `/settings/team` never render admitted content before current admission. The latter two remain clearly non-operational previews until007/008, not real settings/team data.

### US2 — Maintain and end a session safely (P1)

**Value**: Refresh does not change identity/permissions; sign-out cannot be undone by a late request.
**Independent acceptance**: Two browser tabs, a real supported refresh and local-scope logout against the same Auth fixture.

1. Expired access with valid refresh restores the same admitted identity once; invalid/revoked refresh ends access without a retry loop.
2. Current membership disable/role change is enforced on the next request without waiting for JWT expiry.
3. Confirmed local sign-out clears browser admission; replay of the old session fails through Nest. Another independent login is not claimed globally revoked.
4. Delayed refresh/read responses cannot restore a signed-out identity or overwrite the displayed identity after another sign-in. Uncertain provider sign-out is reported as uncertain, never as confirmed revocation.

### Edge cases and user states

States: signed out, submitting, restoring, authenticated/unadmitted, admitted, signing out, local signed out/provider outcome unknown, dependency unavailable. Handle duplicate submits, expired/tampered cookies, two users in separate browser contexts, multiple tabs, unsupported coordination APIs, inaccessible Auth/JWKS/API/DB, unsafe return URLs, technical-key misconfiguration and missing app configuration. No sample-data fallback for any of these states.

## Requirements

- **FR-001**: Authenticate through existing Supabase Auth and admit only after the real current identity/membership API succeeds; no metadata-derived role or public bootstrap.
- **FR-002**: Protect all three application routes on direct server rendering and navigation; preserve public home/privacy and the existing shell visuals/sample-project boundary.
- **FR-003**: Keep access/refresh/technical/admin credentials out of browser JavaScript, storage, URLs, HTML/RSC payloads and logs. Use the resolved server-only caller/cookie contract in the plan.
- **FR-004**: Require exact same-origin and CSRF checks on cookie-authenticated mutations, including sign-in/refresh/sign-out; allow only enumerated methods, paths, fields and return destinations.
- **FR-005**: Coordinate refresh and authentication transitions across tabs; reject stale generation/results, never refresh in server rendering or indiscriminately retry a mutation.
- **FR-006**: Distinguish invalid session, unadmitted identity and dependency/configuration failure; keep all user/session responses private/no-store.
- **FR-007**: Ordinary logout uses provider scope `local`, confirms only observed outcomes and prevents later browser restoration. No global revocation claim on timeout/failure.
- **FR-008**: Provide meaningful functional tests and real browser→Auth→BFF→Nest→DB acceptance, including failure/race cases, before feature completion.

### Routes, reused API and missing delta

Reuse `GET /v1/app/me` and existing technical/JWT/current-session/membership checks from the sole [OpenAPI](../001-connectivity-foundation/contracts/openapi.json). Supabase owns password/refresh/logout operations; these are not new Nest password endpoints. Missing: FE generated consumer update, server-only fixed-origin caller, BFF auth routes/cookies/CSRF, route admission, real identity/sign-out wiring and browser integration. No required new BE business endpoint or app migration is identified. See [the exact BFF contract](contracts/session-bff.md).

### Key entities and ownership

Auth session and app membership/profile/workspace are existing005 entities. New browser session state is a server-sealed transport envelope and generation/CSRF context, not a password database. FE owns `apps/web/**`; BE owns existing `apps/api/**` acceptance and confirmed defects only after a fresh scope grant; the coordinator owns resource/contract/shared-file leases and integrated acceptance. Exact file ownership and serialization are in [plan.md](plan.md).

## Success Criteria

- **SC-001**: A real admitted user completes sign-in, protected-page reload, supported refresh and local logout; subsequent protected access is denied.
- **SC-002**: The defined invalid/unadmitted/disabled/unavailable/CSRF/tampered-cookie/two-tab/late-response scenarios expose no forbidden data or false success.
- **SC-003**: Browser-visible traffic/storage/rendered content contains no protected credential; public routes and keyboard/mobile usability remain functional at existing1440/360/390 viewports.

## Dependencies and completion boundary

Use the accepted [005 BE handoff](../005-app-foundation/quickstart.md), without changing it. Synthetic owner/workspace provisioning and isolated resources require a fresh execution grant; real owner inputs remain a separate gate, not a repeated baseline question. Production adoption additionally depends on [001's versioned migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only), linked rather than copied. Local journey completion is not hosted/product acceptance or publication authority. Features007/008/009 depend on this integrated session foundation, not merely its FE implementation.


## Owner navigation feedback — 2026-11-17

The owner requests smooth sidebar navigation between Dashboard, Settings and Team. A valid admitted session must not be reset merely because the route changes. Keep the shared sidebar, header and session lifecycle mounted; replace the route content and update its heading/active navigation. Loading feedback belongs to the content region during ordinary navigation. Initial admission, actual session invalidation, denied membership, logout and uncertain authentication remain explicit security states, not hidden success.

This is an incremental006 navigation improvement, not a redesign, new business feature, authentication replacement or authorization cache. Public routes and login remain outside the protected application shell. Preserve direct-load, reload, refresh, multi-tab/logout and current membership checks. Data APIs and mutations continue to enforce current access independently of a persistent layout. Existing local completion evidence above is historical and does not cover this increment.


## Navigation performance follow-up — 2026-11-17

**PLANNED, not implemented.** After publication of c6d7a17, the owner reported slow sidebar navigation and supplied a local CLS0.60 screenshot. Keeping the shell mounted did not meet perceived-performance expectations. Add measurable navigation latency, network-count and layout-stability acceptance without changing internal authentication or current-access requirements. Existing T017–T022 results remain valid for their tested scope, not performance acceptance.

- **NP-001**: Ordinary admitted navigation keeps the current admitted view stable until the destination is ready; never collapse main into a one-line loading placeholder. Pending indication is non-displacing and shown only after150ms of actual waiting. Known denial, logout, session change or unconfirmed admission immediately conceals sensitive content without waiting for that indicator timer.
- **NP-002**: Remove redundant current-membership lookups on the ordinary successful route path. Target one authoritative current `/v1/app/me` lookup per transition, excluding documented refresh/failure flows. Signed cookies, a cached route payload or old Context state alone never grant current access.
- **NP-003**: Prove same shell/controller identity, bounded requests, lower click-to-destination latency and CLS<=0.10 in the specified controlled desktop/mobile journeys. Publish local/synthetic and hosted measurements separately; one anonymous login result does not clear a signed-in Dashboard issue.
- **NP-004**: Use existing React/Next/native transport first. No React Query/Redux/dependency additions, authorization TTL, new backend/session framework, provider configuration, schema migration or Etsy changes. Optimize Context consumers only where Profiler evidence shows avoidable commits.

Execution update: owner START authorized T023–T028 on the dedicated `fix/fe-navigation-performance` worktree. The sample-only server-envelope/current-client-admission boundary, stable native transitions and delayed local progress are implemented. The preceding PLANNED paragraph preserves the approved baseline; actual local metrics/checks and assigned-review status are recorded in [quickstart](quickstart.md#navigation-performance-execution-evidence). No hosted performance or whole-product completion is inferred.

## Owner amendment: bounded display freshness

**AUTHORIZED FOLLOW-UP, T029–T033, base44305aba0bdf90974c7675443217b0f632e1a911.** This explicitly supersedes the preceding prohibition on completed cross-navigation reuse only for DISPLAY of the three audited sample routes. It does not introduce an authorization cache. Earlier performance evidence and the accepted history P2 correction remain historical evidence, not acceptance of this amendment.

- **DF-001**: A mounted controller may retain a verified display snapshot for strictly less than60 seconds measured by `performance.now()`, bound to its current authentication epoch, validated context generation and user/workspace identity. Navigation/focus never extends the deadline. Ordinary rerenders and fresh sample-menu/focus journeys issue zero context/me reads; a new controller/direct load still verifies current access.
- **DF-002**: Stale navigation, focus and a concurrent explicit current-check consumer share one identical in-flight context/me read for the same authentication scope. The latest route intent owns the destination; joining a read never lets an older route/result override it. There is no polling.
- **DF-003**: Hidden visibility alone retains the admitted display. A stale return revalidates in the background with an explicit non-displacing pending state, retains the last admitted identity/sample body and blocks stale body interactions. It never refreshes the router merely to repeat admission. Known denial or failed/bounded-out verification conceals the display immediately and exposes the existing actionable failure state; stale-ready is not a failure fallback.
- **DF-004**: Logout, new login, Broadcast invalidation, known401/403, membership denial and generation/identity changes invalidate display reuse and fence old completions. Only actual401 permits the existing serialized refresh, using its confirmed current-me result. Context-changing/token-writing transitions freshly validate context under the existing Web Lock; display freshness never supplies mutation authority.
- **DF-005**: Same-document history may reuse a fresh sample display, preserving the accepted delayed-history body/progress behavior when stale. Pagehide/BFcache is a separate boundary: conceal before freezing, discard display freshness and require current verification before restoration; a changed account/generation cannot reveal the old cached UI. Future real private routes/data/actions bypass display reuse and authorize at the server/API boundary.

Acceptance extends existing functional and local production-browser suites: exact fresh/stale request counts, concurrent consumers, the60-second boundary, retained shell/identity and CLS, known denial before a held context, unavailable/expiry/refresh, logout/new-login/Broadcast/late-response fences and history/BFcache restoration. Real isolated Auth/BFF/Nest/DB evidence remains distinct from synthetic clock/delay injection. No hosted acceptance or unrelated natural300-second expiry rerun is implied.

Execution update: T029–T033 are implemented, locally verified and accepted by the existing scoped reviewer. Guarded cleanup is complete; the final handback returns ownership to `t12p` with STOP WRITES / NO INFLIGHT. [Actual counts, CLS, failure history and native BFcache limitation](quickstart.md#bounded-display-freshness-execution-evidence) distinguish current evidence from the preceding increments and from hosted acceptance.
