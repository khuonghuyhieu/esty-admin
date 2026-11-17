# Implementation Plan: Existing Etsy Connectivity

**Status:** READY_FOR_OWNER_NEXT_LAYER — coordinator accepted the confirmed P2 resolution after independent fix-only recheck; T023 complete for this BE increment. Operational prune, FE/browser, hosted and actual-provider gates remain open. Source/docs ownership returned to t151; STOP WRITES.
**Context:** `feat/etsy-connectivity` at base `a9b3d70ceff042b893fa06877eca197d3d31c06c`, dedicated Etsy worktree. Feature routing labels are not Git branch evidence.
**Inputs:** [spec](spec.md), [research](research.md), [data model](data-model.md), [contracts](contracts/proposed-api.md), [tasks](tasks.md), [validation](quickstart.md).

## Latest sequencing — BE acceptance before FE

Owner defers FE until BE work is finished. Continue with the [BE-first acceptance packet](quickstart.md#be-first-acceptance-packet--fe-deferred-by-owner): reviewed source publication, clean exact artifact, new010 environment/migration/release, then separately authorized real consent/read via approved private operator handoff. The Owner table/recipient confirmation/main FE browser journey remains deferred; BE-only acceptance does not close overall feature acceptance. Existing source remains reviewed/frozen; this is a documentation-only sequencing amendment and does not grant external actions. The final review manifest is retained as a historical closeout snapshot; later planning-document hashes differ, source hashes remain unchanged.

## Current implementation grant — 2026-11-17

Coordinator t151 forwarded explicit owner authorization for sequential BE implementation, synthetic/local verification and010 evidence. This supersedes planning-only wording and the configuration-only review stop retained below; Layer1 must pass its self-check before Layer2, without another permission request. The nine pre-existing dirty010 documents are intentional coordinator work and are preserved as the starting baseline. No Git mutation/publication, dependency install, additional worker/reviewer, shared-document/root changes, FE/session/browser changes or real private/provider/database setup is authorized.

The backend owns exact invitation-start transport and callback only, not the recipient confirmation page. Production remains disabled by default; the missing FE ingress/main-browser journey and hosted privacy/routing verification remain adoption gates. Do not create a JavaScript page or broaden cross-origin/bearer exceptions to compensate.

Runtime invitation TTL and operational retention are explicit bounded inputs, not implicit24-hour policies. Live values, approved origins and target shop remain OWNER_INPUT_PENDING; synthetic tests supply independent values. Expected shop is an Owner-authorized creation input. No automatic prune or key rewrap exists. After confirmed review P2, PUBLIC/app_operator/app_runtime cannot execute retained prune code: operational prune requires a future verifiable current-Owner/purpose-bound authority flow and real actor attribution, not supplied UUIDs. T019's prune portion and key/backup policy remain open.

Before writing, cwd/branch/HEAD matched the assigned worktree, `feat/etsy-connectivity` and base above. Requirements checklist:13 checked,0 unchecked. Command-local prerequisites passed; extension configuration was absent. No language server is configured. The frozen review-manifest.json retains all nine initial coordinator document hashes separately from final worker hashes.

## Current owner decisions and evidence boundary

The owner confirmed an existing registered developer app with Etsy access and sufficient resources. Do not reopen registration/access approval, request secret values, inspect accounts or automatically repeat setup. Exact app configuration is supplied later through an approved secure mechanism; its absence in these documents is not a source/local blocker.

Root reports D1 CURRENT_CONFIG_ATTESTED and D2 BE_ACCEPTED, existing Hieu/Lovora/Owner and successful app.lovora.us login after the Auth URL correction/password reset. Accepted BE candidate: `dpl_7M1zdXedTx62ch7t5wdEDWXcS1p7`; journal675 has32 events, next=fe. These are supplied facts, not new probes. PROJECT_STATE and older architecture/010 gate descriptions are stale on these points. No roles, migrations, bootstrap, D1 or D2 replay; retained f162 is historical, not current source identity. New010 schema/release and callback acceptance remain distinct future work.

The owner selected an Owner-created invitation link, privately shared with the shop operator, a managed table and manual Check status/Sync shop info. No automatic polling, SSE, WebSocket or background synchronization. This supersedes the original operator-only/no-Owner-UI initiation boundary. The recipient grants Etsy access, not Lovora membership or Owner privileges. One shop connection per workspace and the four-field dataset remain the initial limit; multiple historical invitation rows do not authorize multiple shops.

## Technical context and constitution check

Use existing Node24.22.1/TypeScript/NestJS12.2.0, Vercel API, Supabase, native fetch/crypto and the one canonical API/migration history. Keep the current listening bootstrap, verified TLS, bounded pools, cancellation and hosted duration controls. No new framework, Etsy SDK, queue, scheduler, auth system or infrastructure is selected. Frontend work later reuses006 session/BFF/current-membership/CSRF rules under a separate FE lease. Current FE navigation owns apps/web, session helpers and browser fixtures and is untouched.

One modular backend owns transport → application → adapters. Etsy OAuth grants shop access only; it does not admit a user to Lovora. Persistence is additive in app_private with existing role/lock/audit policy. Local evidence distinguishes synthetic protocol checks from actual provider results. No governance exception is selected; shared docs, FE, root manifests and shared pointer remain unchanged.

## Layer 1 — developer-app environment and configuration

**Implemented and self-checked before continuation.** Server-only configuration and secret-free examples use strict validation and nondisclosing errors. Default ETSY_ENABLED=false preserves existing behavior and ignores unused secrets; enabling refuses partial/invalid inputs before provider work.

| Configuration | Purpose / validation |
|---|---|
| ETSY_CLIENT_ID, ETSY_SHARED_SECRET | Existing app identity and server credential; no frontend/public environment exposure or value echoes |
| ETSY_CALLBACK_URL | Exact hosted HTTPS `https://api.lovora.us/integrations/etsy/callback`, no caller override |
| ETSY_RETURN_ORIGIN | Approved fixed existing HTTPS website origin; no credentials/path/query/fragment; clean root return |
| ETSY_TOKEN_ACTIVE_KEY_ID, ETSY_TOKEN_KEYRING | Versioned AES-256-GCM keys; active ID present,1–4 named32-byte keys; fail closed on unknown keys |
| ETSY_INVITATION_ORIGIN, ETSY_INVITATION_TTL_SECONDS | Fixed approved Lovora ingress origin and bounded invitation lifetime; TTL is independent of the300-second OAuth attempt |
| ETSY_RETENTION_SECONDS | Explicit bounded operational retention; no automatic prune or implicit24-hour policy |

No secret settings screen, credential-in-chat handoff or new credential store is implied. Original owner files remain untouched. Live invitation TTL/origins and retention/key/backup policy remain pending; synthetic local values are not owner decisions. Hosted registration/log privacy requires later authority. Configuration errors name safe fields/categories, never values; application ping and real consent are excluded.

**Exit met locally:** enabled/disabled/missing/invalid configuration and nondisclosing failures passed; setup procedure is in quickstart.md. The explicit sequential grant allowed continuation after this self-check, not automatic external setup.

## Layer 2 — reusable Etsy protocol and schema foundation

The official [OpenAPI document](https://www.etsy.com/openapi/generated/oas/3.0.0.json) remains upstream transport, not Lovora's canonical API. The implemented reproducible generator pins full-source digest/bytes/tool version, validates selected operations and produces minimal selected types with offline drift checks. It never refreshes at runtime or exposes a universal proxy.

Use a fixed-origin server adapter with composite x-api-key, full scoped bearer, form-urlencoded token requests, no redirect following, lossless positive int64 IDs and explicit safe errors. Token schemas follow the authentication guide where the reference lacks a token operation. Retain8-second whole-operation budget,3-second token/1500ms metadata calls,64KiB bodies, shorter DB deadlines and cancellation. Reuse database cooldown/fencing; no hidden retries.

Only code exchange, refresh, getMe and bound getShop are activated for010. Broad schema availability is not permission to request broad OAuth scopes, persist full payloads or implement order/listing writes. Later datasets require selected scopes, validation, privacy and tests; new scopes require consent again. Selected metadata remains shops_r and exactly etsyUserId/shopId/shopName/currencyCode.

**Exit:** synthetic request/schema/error/precision/deadline and credential-envelope checks; no provider, DB or FE resource needed for pure foundation checks.

## Layer 3 — invitation persistence and Owner management API

Create a durable invitation row before returning its privately shareable URL. Bind creator/current Owner, workspace, existing app, expected shop, scope policy, expiry and connection revision. Store only a hash of the random invitation secret. Return the full URL only on explicit authorized creation; list/status responses omit it. Owner may cancel and issue a replacement if the original is lost; no recoverable plaintext link store by default.

Support list/create/cancel through existing authenticated Owner capabilities/BFF conventions. Multiple safe invitation-history rows are permitted, with one outstanding invitation/attempt and one shop connection for the workspace. Never grant a Member Lovora integration management because they received a link. Expected shop must be confirmed before activation; no arbitrary shop accepted from callback.

Invitation states are pending, in_progress, connected, declined, expired, cancelled, failed and outcome_unknown, separate from connection health. Opening a URL is read-only and does not consume it: chat previews/prefetch must not begin OAuth. An explicit recipient Continue action atomically claims a valid invitation and creates a fresh300-second state/PKCE transaction. Concurrent starts cannot create two provider exchanges. Cancel/expiry, creator demotion and connection-generation changes fence stale work. No recipient Lovora login is required; the scoped invitation authenticates only this transaction. No shop data or management authority is exposed to the recipient.

Additive schema/manifest uses the existing history and exact scoped privileges; no applied migration edits or startup DDL. New010 migration delivery later needs its own release authority, not replay of accepted foundation setup.

**Exit:** real isolated DB tests for ownership, uniqueness, expiry, cancel/replay, scoped access, creator demotion and apply/replay; fresh resource grant required.

## Layer 4 — consent, callback and verified connection

Implement only exact explicit POST invitation start and exact GET Etsy callback as backend transaction-authenticated bearer exceptions. Recipient confirmation/fragment UI and any inspection transport are deferred to FE ownership; no public GET invitation exception is implemented. All neighboring routes retain existing guards; no route-prefix exemption.

Recipient Continue → Etsy consent → registered callback → single code exchange → encrypted candidate → getMe plus matching getShop → current-Owner/generation-checked activation. Callback commits the result without the Owner pressing Check status. A short-lived invitation remains bound server-side; Etsy account consent does not log the recipient into Lovora. Return only to the fixed clean website root; no tokens or result authority in a redirect URL. Callback query, invitation secrets and authorization links must not reach retained app/platform logs.

Maintain encrypted versioned tokens/verifiers, at-most-once durable exchange/refresh submission, exact lost-ack receipts and CAS/fencing. Unknown outcomes are never success or automatic replay. Reconnect requires new intent and the same account/shop; disconnect removes locally usable credentials and fences all in-flight work. Local disconnect is not remote revoke.

**Exit:** actual owned Nest/DB with synthetic HTTPS provider proves grant/denial, wrong shop, replay, expiry, authority loss, concurrency, commit uncertainty and lifecycle; separate scoped review before hosted adoption.

## Layer 5 — Owner table and explicit actions

A later FE-owned increment provides Create connection link, private copy after creation, invitation/connection table, Check status, Sync shop info, cancel and applicable reconnect/disconnect controls. Owner submits actions through the existing authenticated BFF; never expose technical bearer, app secrets or OAuth credentials. Resolve fresh FE source/test ownership first; do not interrupt the navigation lane.

Table displays safe shop label/ID, invitation status, separate connection status, creation/expiry and last successful provider observation. Check status reads saved local state only: zero Etsy calls, refreshes or reconciliation writes. Initial page load and explicit button presses fetch state; no timers, focus-triggered polling, subscriptions or background jobs. If callback finishes while the table is open, it updates on the next explicit check/reload. Sync shop info explicitly calls getMe/getShop and may perform one fenced refresh; it shows observedAt and classified failures, never stale success. A disconnect/reconnect/demotion during sync discards the result. A closed Owner page does not prevent callback completion.

**Exit:** separate FE-owned functional/browser acceptance for create/share/recipient consent/manual check/sync/cancel and local teardown, with no periodic requests; visual and hosted owner acceptance remain separate.

## Layer 6 — hosted adoption and actual Etsy acceptance

Reuse the accepted BE/Auth foundation. Authorize only the new010 source/artifact, additive migration-before-deploy, explicit ingress/access/log configuration, secure environment injection and exact callback registration verification as required. No re-registration, roles/bootstrap/D1/D2 replay or private-file discovery. Owner-confirmed setup is reused, not automatically redone.

After affected local checks and a separate scoped review, separately authorize real intended-account consent, exact callback, encrypted persistence and four-field read. Refresh/reconnect/local disconnect and owner-performed Etsy revoke need their specific live grant. Record source/artifact/deployment identity and safe outcomes. Existing app access and D2 acceptance do not prove010 is hosted or Etsy consent succeeded.

## Execution gates and remaining owner decisions

- **G1:** The scoped BE review and confirmed P2 fix-only recheck are accepted; T023 is complete for this increment. Docs-only closeout returns source/docs ownership to t151. No further source work, runtime check or reviewer starts without a fresh grant.
- **G2:** App registration/access and resource availability are owner-confirmed. Later exact non-secret app/shop binding and secure configuration use the existing resources; no setup redo or secrets in chat.
- **G3:** Explicit validated synthetic TTL/retention/origin/shop values support local proof. Live invitation lifetime, fixed ingress/page ownership, target shop and key/backup/retention policy remain owner adoption inputs; no proposed24-hour value was silently accepted.
- **G4:** Fresh canonical/source/isolated DB/TLS/browser leases; FE owns apps/web/session/browser helpers. Root dependencies/shared pointer/shared docs remain untouched without separate authority.
- **G5:** New010 publication/migration/release/ingress/privacy and real consent/lifecycle require separate external grants. No live provider/cloud DB call, deploy or paid action occurred.
- **G6:** One shop/metadata baseline. More shops, orders/import/fulfillment, webhooks and general seller self-service are deferred. Broad upstream types do not implement those products.

## Planning validation and limitations

Original U1, pre-fix freeze, original full review's one P2 and all failures remain historical in the handoff. The fix-only pass found no further confirmed actionable finding in its scope; coordinator accepted resolution. T001–T018 retain local evidence, T011 remains BE-only and T023 is complete. T019 operational prune and T020–T022/T024–T026 remain open. Prior runtime results were not rerun during docs-only closeout; only document/diff and unchanged source/root identity checks occurred. No hosted/provider or full-product success is claimed.
