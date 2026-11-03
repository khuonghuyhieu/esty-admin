# Backend API and Future Caller Handoff

**BASELINE_APPROVED. Contract design notes, not a second authoritative schema.** The coordinator confirmed p12 ownership of the sole [`specs/001-connectivity-foundation/contracts/openapi.json`](../../001-connectivity-foundation/contracts/openapi.json) plus BE generated `apps/api/src/generated/api.ts`. FE generated `apps/web/src/lib/api/generated.ts` remains FE-owned and must not be regenerated here; notify exact contract delta/hash for a later coordinated FE handoff. No other feature001 documentation lease is active without fresh FE whole-file pause.

## Backend boundary and deferred FE handoff

- Browser/BFF/cookies/CSRF/callback behavior remains FE-owned and unimplemented by this BE increment. The earlier standard Supabase SSR-cookie alternative is not an approved browser implementation; the server-only HttpOnly tradeoff must be resolved before that FE work.
- A future same-origin BFF must use an explicit method/path/schema allowlist, reconstruct trusted headers and forward only to the fixed API origin. It may not proxy health/operator/arbitrary paths or accept a caller-selected origin.
- Existing NestJS `Authorization: Bearer PREVIEW_ACCESS_KEY` remains required on all non-preflight routes, including app-enabled local mode. App operations additionally receive `X-App-Access-Token`, verify signature/claims/current Auth identity/session, and evaluate current membership. Duplicate/malformed user-token headers deny; neither credential substitutes for the other.
- CORS, frontend route hiding, Vercel platform protection and successful Auth alone do not grant app capability. No current guard exception or browser-visible technical key is authorized by these notes.
- Cookie-authenticated mutations require the approved Origin/CSRF protocol. User responses, session callbacks and Set-Cookie responses are private/no-store. Auth callback types, PKCE state and return paths are constrained; provider token/link secrets never enter normal app response bodies or logs.

## Canonical backend operations

Canonical OpenAPI0.4.0 adds12 app operations and20 app schemas; SHA256 `41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad`. Existing health operation objects remain semantically unchanged. BE generated types are updated and their Node24 drift check passed. FE generation remains deliberately untouched; the exact delta/hash was sent to FE without requesting FE build/runtime work.

`{memberId}` is the target Auth UUID inside the configured workspace. No browser-supplied tenant identifier grants scope.

| Nest operation | Authorization after technical/JWT/session checks | Behavior |
|---|---|---|
| `GET /v1/app/me` | Active membership; `profile.read.self` | Own profile, read-only trusted Auth email, workspace summary, current role/capabilities/revision; never tokens or sample defaults |
| `PATCH /v1/app/me` | Active membership; `profile.update.self` | Only approved display name plus required current revision; actor always JWT subject |
| `GET /v1/app/team` | `team.read` | Bounded cursor page of approved roster fields; no Auth admin dump or unnecessary email disclosure |
| `POST /v1/app/invitations` | `team.invite` | Email and required idempotency UUID; target role is always Member. Reserve offer and return200 with separate delivery state, not membership acceptance |
| `GET /v1/app/invitations` | `team.invite.manage` | Bounded workspace-scoped offer page including state/delivery projection |
| `POST /v1/app/invitations/{id}/revoke` | `team.invite.manage` | Same-workspace offer revocation with expected revision/state; no Auth-account deletion |
| `POST /v1/app/invitations/{id}/reinvite` | `team.invite.manage` | Explicit superseding offer and idempotency key; unknown earlier delivery must be reconciled before resend |
| `POST /v1/app/invitations/{id}/accept` | Authenticated current session + verified matching offer identity; no pre-existing membership required | Narrow admission operation; transactional current offer/issuer/role checks; no workspace data reads beforehand |
| `PATCH /v1/app/team/{memberId}` | `team.role.assign` and/or `team.membership.manage`, checked for each changed field | Explicit allowed role/status transition with required revision; atomic last-owner protection; reject extra fields |
| `GET /v1/app/workspace` | `workspace.read` | Only approved internal-workspace settings and revision |
| `PATCH /v1/app/workspace` | `workspace.update` | Only approved workspace display name plus revision |
| `GET /v1/app/audit` | `audit.read` | Bounded cursor page of explicit redacted audit fields; no arbitrary filters |

Accepting one's invitation is a verified resource-specific grant, not a general exception to authentication or scope. A signed-in identity without active membership otherwise receives403 on app data routes. An old offer never silently reactivates a disabled member or upgrades an existing role. Fixed Owner/Member are owner-approved; no dynamic role-definition endpoint, public bootstrap, workspace creation, Auth-user deletion or impersonation endpoint is included.

## Auth lifecycle contract, not another password API

Supabase owns password verification, access/refresh tokens and email challenges. The frontend must show distinct signed-out, session-refreshing, authenticated-but-unadmitted, admitted and dependency-error states without presenting preview data as real results.

- Sign-in: generic invalid-credential response; successful provider authentication still requires server membership admission.
- Refresh: bounded coordination, correct cookie propagation and no user-client reuse across requests. Old/invalid refresh tokens must not be retried indefinitely. Expiry recovery does not alter app permissions.
- Sign-out: ordinary action explicitly uses `local`. The next API request checks the actual current session and membership; a still-valid signature alone cannot preserve access after confirmed revocation.
- Recovery: provider challenge verification and password update, followed by explicit global sign-out and fresh sign-in. This does not reactivate disabled membership. Actual local provider evidence is separate from synthetic signature/provider-failure checks; hosted/browser proof remains deferred.
- Invitation email: distinguish provider acceptance, actual email receipt, Auth account verification and app membership acceptance. Link GET is not membership acceptance. New and existing Auth users require separate approved flow tests; do not use password reset as team invitation.
- Bootstrap/reconciliation: `apps/api/scripts/bootstrap-app-owner.ts`, explicit operator configuration/approval, separately verified Auth identity, no HTTP route. Bootstrap stores the original request fingerprint for safe retry even after later display-name changes. Pending/unknown delivery requires explicit evidence-backed reconciliation before resend; lost-owner recovery is not a public feature.

## Validation and error semantics

Requests use strict field allowlists and reject privilege-bearing extras. Trimmed profile/workspace names allow1–100 Unicode code points, excluding malformed Unicode/control characters. Role/status changes require current revision and field-specific capabilities. Page limits are1–100 (default50); cursors are UUIDs resolved within the configured workspace. Idempotency binds workspace/actor/key and the operation/input fingerprint; same key with different input conflicts. No last-write-wins mutation is permitted.

| Result | Meaning |
|---|---|
| `200` | Confirmed app read/mutation; invitation response separately exposes delivery pending/confirmed/failed/unknown. It never proves email receipt or membership admission |
| `400` | Malformed/unknown fields or invalid transition input, without sensitive provider detail |
| `401` | Missing/invalid API technical credential, invalid/expired user token or confirmed revoked session; BFF must not turn a server technical-configuration failure into a misleading user-password prompt |
| `403` | Valid user but no required app admission/capability or failed CSRF/Origin check |
| `404` | Unknown or inaccessible foreign scoped object; do not reveal cross-scope existence |
| `409` | Revision/idempotency conflict, invalid offer state, existing disabled membership, initialized-bootstrap mismatch or last-owner violation |
| Provider throttling | Classified as failed delivery when the provider definitively rejects a send; no hidden resend/retry or invented app429 contract |
| `503` / bounded timeout | Auth/JWKS/DB unavailable or indeterminate outcome; no stale authorization fallback |

App error payload is exactly `{code, requestId}` with safe allowlisted codes. The existing technical guard retains `{status: "unauthorized"}`. No raw SQL, environment values, provider payload, bearer/refresh token or recipient-existence detail is returned. App responses are private/no-store.

## Separate acceptance gates

Source/BE generation exists; only actually exercised checks count as behavior evidence. Current verification and retained failures live in `../research.md` and `../quickstart.md`. Future FE regeneration/BFF/CSRF/callback/browser acceptance is separate. Shared FE contract-drift success is not claimed while the FE-owned generated consumer intentionally remains unchanged.
