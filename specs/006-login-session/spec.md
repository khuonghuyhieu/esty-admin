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
