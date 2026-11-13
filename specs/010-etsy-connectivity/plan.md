# Implementation Plan: Existing Etsy Connectivity

**Status**: READY_FOR_OWNER_PLAN_REVIEW — proposed source/local and external execution tasks remain unapproved and unchecked.
**Spec**: [spec.md](spec.md) · **Working branch**: existing owner-reported main, not changed or independently probed. Helper output BRANCH=010-etsy-connectivity is a feature identifier, not evidence of a Git branch.

## Summary

Add one bounded Etsy integration module to the existing NestJS application and workspace. Early initiation is an explicitly approved operator-assisted workflow, not a public connect endpoint. The sole proposed browser-facing bearer exception is exact GET `https://api.lovora.us/integrations/etsy/callback`, authenticated by a short-lived server-bound state/PKCE transaction and current Owner authority. Verify the actual granting Etsy user and approved shop before activation; read only account/shop identity metadata with shops_r. Protect credentials with versioned authenticated encryption and use durable CAS/fencing for refresh/reconnect/disconnect.

No code, schema, generated types, provider configuration, browser feature or hosted route is delivered by these documents. [Research](research.md) resolves public protocol choices while retaining external facts as gates. [Contracts](contracts/proposed-api.md), [data model](data-model.md) and [validation guide](quickstart.md) define the future observable behavior.

## Technical context

| Area | Selected context / constraint |
|---|---|
| Runtime | Existing Node24.22.1, TypeScript and NestJS12.2.0 modular backend; preserve canonical listening/bootstrap, cancellation, pool and hosted duration controls |
| Dependencies | Existing native fetch/URL/crypto, maintained installed PostgreSQL and migration tooling; no Etsy SDK, Express server, new auth library, queue, scheduler or new hosting platform selected |
| Storage | Existing PostgreSQL app_private schema; additive scoped tables/functions in the same version/checksum history; no managed Auth mutation |
| Authentication | Existing005 current Owner membership and app policy; Supabase remains internal authentication. Etsy OAuth only grants access to the bound shop, never app admission |
| Hosting | Existing Vercel API project and final api.lovora.us target; existing Supabase-cloud direction. No new hosted connectivity/app-readiness claim |
| Dataset | getMe + bound getShop; exactly etsyUserId/shopId/shopName/currencyCode; shops_r only; one application connection per configured workspace |
| Budgets | Five-minute consent attempt;8-second whole operation; token HTTP3s, each metadata HTTP1500ms,64KiB bodies;15-second refresh fence; existing shorter DB budgets preserved |
| Verification | Existing test conventions; real owned HTTP/PostgreSQL lifecycle with synthetic Etsy transport, isolated automated callback browser journey, then separately authorized real consent/read evidence |
| Unknown execution inputs | Existing-app type/approval/access, exact intended shop/account, registered callback and website return origin, secure credentials/keyring, hosted log/access behavior and migration adoption |

## Constitution check — before research and after design

- **Evidence/stack**: Uses ARCH-001's existing Nest/Vercel/Supabase choices, official Etsy sources and005/006 interfaces; no tutorial-selected framework or invented account status.
- **Small architecture**: One backend, workspace, database history and canonical API. Operator and HTTP adapters share one application service; no microservice, background sync or second login system.
- **Verification**: Meaningful behavior/concurrency/failure tests and actual browser/HTTP/DB proof precede local completion; actual Etsy and hosted evidence are separate mandatory gates, not simulated claims.
- **Single context**: New010 artifacts only. C2-01 remains the existing milestone tracker. README/STATE/AGENTS/architecture,005–009, canonical schema and shared pointer are not planning write targets.
- **Scope/UI**: No order/fulfillment business features or new frontend UI; fixed Owner/Member maintained. Local TLS simulation is not a public tunnel or deployment.

No constitutional exception is selected. The proposed callback exception is an explicit future security design change requiring implementation/review/hosted approval; current005 guards remain unchanged now.

## Current planning and resource boundaries

The initial directory listing contained001–009 and no010; t4v assigned the sole writer and coordinated other lanes. Use command-local `SPECIFY_FEATURE_DIRECTORY=specs/010-etsy-connectivity SPECIFY_FEATURE_NO_PERSIST=1` for helpers. Read local specify/plan/tasks/analyze skills and templates; `.specify/extensions.yml` was absent. Do not run create-new-feature/branch helpers, persist the shared feature pointer or treat a template copy as project readiness.

The006 browser lease had priority. Planning did not disturb its resources. After t4p explicitly released FE browser/web, the previously authorized006 cleanup completed separately: owned API/control, original run-bound forwarder and original fixture stopped in order; source and shared volumes preserved. This is not an010 runtime check and grants no reuse of those ports/resources. No010 runtime, test, build, install, Git, provider/account, secret or Notion-write action occurred.

## Proposed source organization and ownership

All paths below are future targets, not new files delivered now:

| Owner under future grant | Target | Responsibility |
|---|---|---|
| BE source writer | apps/api/src/integrations/etsy/application/service.ts | One bounded state machine for initiation, verification, reads and credential lifecycle |
| BE source writer | apps/api/src/integrations/etsy/adapters/provider.ts | Fixed-origin protocol, headers/form encoding, schemas, deadlines and safe error classification |
| BE source writer | apps/api/src/integrations/etsy/adapters/credentials.ts | Versioned AES-256-GCM envelopes, AAD/key selection and secret-safe validation |
| BE source writer | apps/api/src/integrations/etsy/adapters/postgres.ts | Workspace-scoped persistence, ownership checks, CAS/fencing, cooldown and audit |
| BE source writer | apps/api/src/integrations/etsy/transport/controller.ts | Narrow callback and authenticated status/read/disconnect operations |
| BE source writer | apps/api/scripts/etsy-connection-operator.ts | Explicit approved operator adapter and private authorization-link handoff |
| BE source writer, narrow existing-file scope | apps/api/src/app.ts; apps/api/src/config/config.ts; apps/api/src/app-foundation/application/policy.ts | Disabled-by-default configuration, exact guard routing and additive Owner capabilities; preserve every existing boundary |
| BE migration owner, fresh permission | apps/api/migrations/; apps/api/src/generated/migrations.ts | Allocate one additive migration, generate the same manifest, enforce immutable historical checksums |
| Assigned canonical owner, serialized lease | specs/001-connectivity-foundation/contracts/openapi.json; apps/api/src/generated/api.ts | Approved operation/error/capability delta and BE generation; no second OpenAPI |
| FE writer, separate later scope | apps/web/src/lib/api/generated.ts and future explicitly scoped BFF/UI files | Generated consumer and Owner self-service only after006 integrated acceptance; not an010 operator-first deliverable |
| Coordinator / owner | Shared docs, resources, publication, actual credentials/provider setup and reviewer | Fresh explicit leases/grants; this planning packet does not assign new people or start an agent |

Tests extend existing suites where appropriate; new uncertain integration logic belongs in proposed `apps/api/tests/etsy-connection.test.ts`, `etsy-connection.integration.test.ts` and a scoped browser journey under the existing `apps/web/tests/` harness only through FE ownership. A future integration helper may reuse existing owned-fixture lifecycle conventions without adopting the old006 fixture or changing its preserved evidence. Root package/lock changes require a serial dependency lease if a demonstrated need arises; none is selected now.

## Phase 0 — decisions and readiness

1. Owner reviews the metadata-only baseline, intended existing app/account/shop and operator-assisted boundary. Public docs cannot settle actual app type/approval/access.
2. Record the confirmed callback registration and clean website return origin only under a later setup grant. Do not replace the callback with the public landing/privacy route or infer that api.lovora.us already accepts Etsy callbacks.
3. Before source work, resolve file ownership and the small existing-source/canonical deltas above, dependency status, isolated resources and separate reviewer ownership. Existing005 code/local proof remains historical evidence; hosted adoption is not presumed.

## Phase 1 — scoped persistence and protocol foundation

Propose additive `etsy_connections`, `etsy_authorization_attempts`, `etsy_credentials`, `etsy_refresh_attempts` and per-app cooldown persistence as specified in the data model. Use app-owned indexes/constraints, bounded SQL, existing lock order and only necessary role/function grants. No startup DDL or alteration of applied migration bytes. Never assume the operator can create arbitrary workspaces or write managed Auth.

Future server-only configuration names: `ETSY_ENABLED` (default false), `ETSY_CLIENT_ID`, `ETSY_SHARED_SECRET`, `ETSY_CALLBACK_URL`, `ETSY_RETURN_ORIGIN`, `ETSY_TOKEN_ACTIVE_KEY_ID`, `ETSY_TOKEN_KEYRING`. Validate the exact callback target for hosted mode; validate an owner-approved existing public HTTPS return origin without credentials/path/query/fragment. Keyring contains1–4 explicitly named32-byte keys, active ID present; no key value in examples, logs or reports. Fixed provider hosts are source allowlists, not arbitrary configuration URLs. Synthetic provider/TLS overrides exist only in an approved test adapter, never as a production SSRF switch.

Use native AES-256-GCM with fresh IV/tag and purpose/row/version-bound AAD. Reject wrong keys, tampering, malformed response/token data and unsafe numeric decoding. Secrets exist only in protected configuration, bounded server memory and encrypted DB records. Rotation of encryption keys is separate from OAuth refresh; no background key service is introduced.

## Phase 2 — US1 operator-assisted consent through verified activation

- `begin` checks explicit operational approval, current Owner membership, configured workspace and target shop, then reserves one five-minute attempt and advances the connection epoch. First-link and reconnect attempts put the connection into verification_pending; any previous credentials are unusable while it is unresolved. Generate state/verifier per attempt and provide only a private0600 authorization-link artifact.
- The browser visits Etsy, consents, and returns to the exact GET callback. No browser technical bearer is needed only on that precise route. Reject malformed query/method/path before DB use, and reject unbound/stale/expired/replayed state before any provider side effect.
- Atomically claim the attempt, release SQL locks, exchange once with the stored verifier, encrypt/persist candidate tokens, then call getMe and getShop under the total deadline. Compare the actual user, approved shop and shop owner, granted shops_r and current Owner authority. Only fenced activation exposes an active connection.
- The callback redirects303 to the fixed existing public website root with no result/token query. This is a neutral landing; authorized operator/API status is the result authority. A callback HTTP response alone never proves active linkage.
- Distinguish denial, known failure, verification_pending and exchange_unknown. If tokens were durably staged, explicit verification may retry only safe metadata reads before token expiry. If a submitted exchange has no provable token persistence, never replay the code; require new intent/consent.

## Phase 3 — US2 explicit minimal read

An active Owner performs an explicit operator read or future approved POST read. The application selects only its bound connection. GET status is local/read-only and never refreshes. For metadata, use a valid committed credential (one fenced refresh if needed), call getMe then bound getShop, validate/project the four business fields, and recheck admission/connection epoch/version before returning. No provider response caching as fallback, arbitrary target IDs or public shop lookup presented as OAuth proof.

No profile email is needed; getUser/email_r is deliberately excluded. Receipts/orders/transactions_r are a later dataset decision with independent schemas, pagination, personal-data and testing constraints. Never send order writes, import/sync, shipping or synthetic purchases to Etsy as a connectivity test.

## Phase 4 — US3 credential lifecycle and failures

Reserve one durable refresh attempt before submission. No process-only mutex or transaction held across network calls. Commit a complete confirmed pair under the current attempt/epoch/version/fence, then erase superseded secrets. A losing/stale response cannot change state. Unknown submission/commit acknowledgement is reconciled only against the exact durable receipt; absent proof, fence usage and require reconnect. Expired lease does not grant old-token reuse.

Use explicit new same-account/shop approval for reconnect; increment epoch before old work can finish. Disconnect increments epoch, removes usable credentials and candidate verifiers, cancels pending attempts and returns only local confirmation. Provider revoke is owner-controlled through Etsy's documented account UI; real denial and previous-data retention are recorded separately.

429 applies a bounded per-app cooldown, not guessed quotas or unbounded automatic backoff. Metadata may be requested explicitly after cooldown; token-mutation uncertainty never silently retries. Keep no pending background job after request completion. Audit only safe actor/workspace/action/attempt/outcome fields, with no provider exception/body leakage.

## Verification and acceptance gates

| Gate | Required observable proof | Not established by that gate |
|---|---|---|
| Plan quality | Requirement/task coverage, exact official endpoint/security/schema citations, local links, protected-file preservation | Source implementation or provider approval |
| Source/local | Real owned Nest HTTP + PostgreSQL, synthetic HTTPS Etsy transport; code exchange/state/crypto/identity/fault/CAS behavior and clean teardown | Real Etsy consent, key validity, redirect registration or platform logs |
| Automated journey | Operator intent → simulated consent → HTTPS callback → verified projected read → reconnect/disconnect; browser-visible secret scan | Live Etsy acceptance or Owner self-service UI |
| Coordinated review | One separately authorized read-only reviewer of the scoped source and evidence; fix only confirmed findings | Tests not actually run or hosted setup |
| Hosted adoption | Approved source/artifact,001 migration-before-deploy integration,005 schema/Auth adoption, separately authorized release and exact callback/platform/logging checks | Etsy app approval or real shop grant |
| Actual Etsy | Owner-approved existing key/app readiness, real intended-account consent, exact HTTPS callback, encrypted persistence, getMe identity + matching getShop read and separately approved lifecycle outcomes | Orders/fulfillment, other-shop entitlement or general product readiness |

[Quickstart](quickstart.md) owns this feature's validation design; runnable implemented commands remain README-owned only under a later docs lease. No full-suite rerun, real provider probe or execution command is authorized by this plan.

## Execution gates and remaining owner decisions

- **G1 — Plan/source scope:** Approve this operator-first, one-shop metadata baseline and exact future source/canonical ownership. No source authority exists yet.
- **G2 — Existing app and target:** Confirm non-secret existing app identity, type/status/approval/access and intended consenting account/shop. Reuse that app; do not automatically register or convert it.
- **G3 — Secure inputs and retention:** Owner supplies app credentials and versioned encryption keys through an approved local secure mechanism later, never chat. Approve operational tombstone/audit retention and protected backup/key lifecycle; preserve all existing owner files.
- **G4 — Local resources and checks:** Explicit fresh nonce/ports/DB/Auth/TLS/browser ownership and teardown grant, with no adoption or eviction. The old006 resources are already released/cleaned, not an allocation for010.
- **G5 — Hosted prerequisite and setup:** Separate001 versioned migration-delivery approval,005 hosted adoption, source publication/artifact/release authority, callback registration/platform route access and logging redaction. Vercel/Supabase remain the chosen direction; no paid upgrade or new platform implied.
- **G6 — Real provider acceptance:** Explicit consent/read/refresh/revoke permissions and safe evidence policy. Approval/key/setup facts reported by the owner are recorded, not automatically re-read or redone.
- **G7 — Future self-service/data expansion:**006 integrated session plus approved Owner capability/BFF/UI work before a browser Connect action. Orders/receipts, additional shops or other-seller product use require a dataset/access amendment, not an automatic widening of this plan.

The concise dataset decision is: **keep account/shop identity metadata only (recommended), or explicitly request a later receipts/order-read scope amendment**. No new role/hosting/auth baseline question is opened. Unknown external facts block the relevant future execution gate, not this documentation deliverable.
