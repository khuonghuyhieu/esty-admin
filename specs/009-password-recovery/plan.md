# Implementation Plan: Password Recovery

**READY_FOR_OWNER_PLAN_REVIEW — planning only.** [Spec](spec.md) · [tasks](tasks.md) · [single006 session contract](../006-login-session/contracts/session-bff.md#shared-email-challenge-extension-for007-and009).

## Technical context and decisions

Reuse Next16/React19/Node24, native bounded Auth REST,006 server-only cookies/CSRF/generation and accepted005 current-session/membership checks. Recovery is not a new Nest module, owner-recovery web API, database or dependency. The completed FE gap inventory identifies missing recovery UI/callback/session wiring; it does not show a backend password operation gap. No new audit/research/runtime pass was run.

Decision: typed email TokenHash verification with server-only restricted cookies and explicit user POSTs, not browser access-token fragments or a claimed OAuth/PKCE flow. Provider templates must support this actual callback shape; default fragment redirects are rejected. Recovery password update and global logout are separate bounded operations so partial success is visible and revocation retry never repeats the password write.006 ordinary logout stays local. A recovery session can never directly promote to normal app admission.

## Journey-to-contract and evidence matrix

The sole [OpenAPI0.4.0](../001-connectivity-foundation/contracts/openapi.json) SHA256 remains `41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad`; Auth REST is its existing identity provider, not extra Nest operations. [Retained005 receipt](../005-app-foundation/quickstart.md#actual-backend-verification-receipt): T043 actual recovery/reset/revocation and expired-challenge scenarios within real GoTrue→Nest→DB9/9 and affected9/9, plus config/HTTP28/28. No FE/browser or production-mail proof and no non-NULL Auth `not_after` boundary proof is inherited.

| Journey | Actual operation/schema/error | Implemented BE evidence | FE task / missing binding | Joint acceptance |
|---|---|---|---|---|
| Request and verify recovery | Auth POST `/recover` and `/verify` type recovery; no Nest password route | T043 real provider recovery/expired challenge; no browser callback proof | T003–T005: generic entry, exact template/callback, restricted verification | Real captured email, explicit verify; registered/unregistered generic response; no GET mutation or wrong-purpose reuse |
| Change password and globally revoke | Auth PUT `/user` with password; POST `/logout?scope=global`; provider errors sanitized by006 | T043 reset/revocation/current Auth-session denial | T006–T008: phase-aware password UI/completion handler, uncertainty and reauth fallback | New password accepted, two prior sessions denied; loss of acknowledgement is not false completion |
| Fresh current admission |006 password login then GET `/v1/app/me` → AppMe or AppError401/403/503 | T038/T043 current session/membership/disabled denial | T008/T010: explicit fresh login, no recovery-session promotion or role change | Old password fails; new password works only with current membership; disabled/unadmitted remains403 |

## Exact web/Auth binding

All mutation routes require006 Origin/CSRF/context/generation checks, strict JSON/field limits, no-store and fixed Auth destination. No browser API/technical/admin token, arbitrary redirect URL or user-supplied upstream token is accepted.

| Browser path | Exact input/effect | Fixed upstream/result |
|---|---|---|
| `/forgot-password` | Public form; same-origin context bootstrap before submit | No membership requirement; no email existence lookup |
| POST `/api/auth/recovery/request` | `{email,generation}`; syntactically valid email, never caller-selected redirect | Auth POST `/recover?redirect_to=<encoded APP_ORIGIN/auth/recovery/callback>` with `{email}` and server-held API key. Eligible outcomes return the same202 generic acknowledgement; not delivery confirmation |
| GET `/auth/recovery/callback` | Exactly `token_hash` and literal `type=recovery`; shared bounds/duplicate checks | Capture shared challenge cookie only;303 `/auth/recovery`; no Auth verify/password/app call |
| `/auth/recovery` | Clean confirmation/password/completion UI | Safe challenge metadata from006 context, no hash/token rendering |
| POST `/api/auth/recovery/verify` | `{generation,challengeId}` after explicit begin acknowledgement | Auth POST `/verify` using cookie token_hash/type recovery; set shared recovery-only restricted envelope, never app session |
| POST `/api/auth/recovery/password` | `{password,generation}` with valid recovery-only restricted context | Auth PUT `/user` with current restricted access token; on confirmed update return passwordChanged and seal that phase, never echo password/tokens |
| POST `/api/auth/recovery/complete` | `{generation,confirmGlobalSignOut:true}`; known passwordChanged restricted phase, or explicitly reauthenticated ordinary006 session for a user-requested revocation retry | Auth POST `/logout?scope=global` using current server-held token; on confirmation rotate context/clear all auth cookies and return fresh-login-required. No password write, automatic refresh or hidden retry |

The completion endpoint's reauthenticated fallback permits only revoking the caller's own sessions and requires explicit confirmation; it cannot update a password, grant app admission or infer a prior password-change outcome. It exists to finish a failed/expired revocation phase, not to change006 ordinary logout semantics. An unadmitted but Auth-verified current session may revoke itself; successful me is not a prerequisite for credential cleanup.

Fallback failure cleanup follows006: clear ordinary browser admission without creating/renewing restricted state or claiming that the password changed; expose global revocation as unconfirmed. Retry requires another explicit authenticated attempt, not an automatic loop.

Request privacy: do not surface recipient-specific provider errors, existence or delivery results; normalize eligible known/unknown-recipient outcomes to the same public status/body. Only safe input validation, transport-wide throttling and dependency failures produce400/429/503; bounded retry guidance never reveals the provider payload. Do not add a new rate-limit database or invent a constant-time/non-enumerability guarantee; real known/unknown synthetic cases verify the selected response contract.

## Callback, model and partial-outcome state machine

006 exclusively defines challenge/restricted cookie names, encryption/purpose/generation, absolute expiry, Web Lock, invalidation and bounds.009 only selects purpose/type recovery and phase `passwordChanged`. No new persisted application entity, schema or copied authoritative OpenAPI. Password confirmation stays client-local; only the password field reaches Auth, never storage/logging.

1. Under a later fixture grant, configure the local recovery email template to link to the fixed RedirectTo with `token_hash={{ .TokenHash }}` and `type=recovery`. Register only the fixed callback; no caller-provided redirect. Later hosted sender/template/access-log query redaction are separate setup gates. Actual local email capture must exercise the template, not a manually fabricated callback URL.
2. Callback GET captures/cleans the URL without consuming the challenge. User explicitly continues under006 lock; begin clears normal/restricted tokens while preserving this challenge. Verification consumes the typed hash via Auth and sets only recovery-restricted state. If the exchange result is lost, show uncertainty/new-link guidance, not blind token replay or successful verification.
3. Password form validates matching confirmation and forwards one provider-governed update. Confirmed rejection leaves retryable input state within the valid challenge. Confirmed success seals passwordChanged; disable further password submissions and show separate global-signout confirmation. An acknowledgement lost after the write is UNKNOWN, not definitely changed/unchanged; do not automatically resubmit. Offer a new recovery challenge or fresh password login followed by explicit global completion, not an owner/membership bypass.
4. Completion uses only the latest known session under the browser transition lock. Confirmed global logout clears session/restricted/challenge cookies, rotates context and invalidates all private client views. Navigate to006 login for a new password grant; never reuse the recovery access/refresh token as an app session.
5. If password change is confirmed but logout fails/times out, say password changed and revocation unconfirmed. Retain only the short-lived restricted completion phase for an explicit logout-only retry. If it expires or the access token is rejected, fresh password sign-in then explicit completion may retry global revocation. Rejection of the old token alone does not prove all sessions revoked. If reauthentication fails, a fresh recovery request is available; do not invent operator privileges.
6. Every recovered identity still receives current Nest session/membership checks at the later fresh login. Disabled/unadmitted users remain denied; role/status/profile/workspace records do not change through recovery. Late restricted/session writes from older generations remain unusable per006; unknown outcomes are never converted to a completed journey by UI navigation.

## Exact future file ownership and dependencies

| Lane | Paths | Boundary |
|---|---|---|
| FE recovery UI | Existing `apps/web/src/features/workspace-foundation/login-screen.tsx` for link only; new `features/workspace-foundation/recovery-screen.tsx`, `recovery-state.ts`; new `apps/web/src/app/forgot-password/page.tsx`, `app/auth/recovery/page.tsx` | Accessible request/confirmation/password/partial-success UI; preserve public routes and existing visuals |
| FE recovery transport | New `apps/web/src/features/app-session/recovery.ts`; new `apps/web/src/app/auth/recovery/callback/route.ts`; new `apps/web/src/app/api/auth/recovery/{request,verify,password,complete}/route.ts` | Exact table above, typed provider adapter; no Next page/route at the same pathname |
| Shared FE integration owner |006 `apps/web/src/features/app-session/{cookies,auth-client,session-controller}.ts`, `session-provider.tsx`, `app/api/auth/context/route.ts`, names-only `apps/web/.env.example` if needed | Single writer serializes007/009 extensions; no alternative cookie protocol, SDK or root dependency edit |
| BE | Existing `apps/api/tests/app-foundation.integration.test.ts`, `app-auth-fixture.ts`, `app-fixture-lifecycle.ts`; accepted `apps/api/src/app-foundation/**` stays frozen absent an exact confirmed-defect grant | Actual recovery/global-revocation/current-membership support, no new password module or managed Auth SQL |
| Integration | Existing `apps/web/tests/e2e/application.spec.ts`,006 `tests/e2e/app-session-fixture.ts`; new `apps/web/tests/functional/recovery.test.ts` | Shared serial real-mail/Auth harness, meaningful partial-outcome cases, guarded resource handoff |

006 integrated session is required;007/008 are not dependencies.009 recovery-screen logic can proceed independently of007 team/008 settings after future approval; common cookies/controllers/context/config/CSS/E2E must be serialized. FE-generated consumer remains006's regenerated `apps/web/src/lib/api/generated.ts`; sole canonical/BE generation and34 source snapshot are unchanged in planning. No blanket FE source hold or agent start is requested.

## Functional and real E2E validation guide

Functional tests: generic initiation, exact callback query/type/purpose/expiry/ID, duplicate/tampered/replayed cookie rejection, no GET consumption, Origin/CSRF before provider work, bounded calls, password confirmation, known-change versus unknown-result states, completion-only retry, no automatic write replay, safe explicit reauthentication and stale-generation isolation. Existing005 tests are reused, not cloned; test actual new transition logic, not source text or mock echoes.

Real production-browser path: request via Forgot password→actual captured local email→explicit verify→new password→explicit global signout→old password rejected and both pre-existing independent sessions denied by canonical Nest→fresh new-password login/current me. Also expire/replay the challenge, use wrong invitation type, lose provider acknowledgements, revoke during another tab's request, and recover a disabled user's password without reactivating membership. Label synthetic fault injection separately from real provider/mail evidence. Do not claim non-NULL session timebox coverage unless separately exercised under an approved test method.

Follow [006 quickstart](../006-login-session/quickstart.md) exactly for future command-local isolated mode and owned fixture/API→web→reverse cleanup; local mail template is this feature's additional setup, not production SMTP. Preserve owner3000/session6634/default `.next`, other services and volumes. Record exact affected commands/exits/failures, sanitized mail/browser/state receipts,1440/360/390 keyboard/mobile evidence and owned cleanup here after execution. No runtime checks or resources were started in planning.

## Constitution and remaining gates

One FE/API/history, approved policy, existing Auth, no new dependency/storage/business module and whole-journey proof satisfy governance. No substantive baseline product decision remains. Fresh implementation/resource/config grants and proven local template/callback/session behavior are execution gates, not reasons to request real SMTP/owner/retention now. Production activation links [001's existing migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only), plus separately approved hosted sender/callback/privacy configuration. Planning or local acceptance does not authorize deployment/publication or005 rewrites.
