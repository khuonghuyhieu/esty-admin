# Proposed Etsy Integration Contracts

## Accepted recipient bridge contract — separate scoped review

**FROZEN BE_RECIPIENT_BRIDGE_SOURCE_LOCAL_REVIEW_ACCEPTED; STOP WRITES.** t151 accepted existing t175's actual final: **no confirmed actionable findings in this frozen bridge scope**. The reviewer ran no checks and did not reassess earlier features. No canonical/runtime/type bytes changed during this five-document closeout; earlier contract/freeze paragraphs below retain their historical capture-time status.

Canonical SHA-256 remains `b5c540638099cd3dda5f9136d9e7294812775cef7675bb21d92a1a3f9d1b6257`; BE generated SHA-256 remains `5293b3c4088a76bfbe350b6ae29bc6ee6eaae1eb58fc5a16d3271d7a905c6ce8`. t151 reports the reviewed canonical handshake delivered to FE/root, not completion of FE generation/review. FE17/18 plus affected1/1 and earlier actual0066/8/role-change503 remain unchanged limitations. Root owns serial integration/release and hosted/provider gates; ownership returns to t151.

**FROZEN READY_FOR_BE_RECIPIENT_BRIDGE_REVIEW; new scoped review and hosted gates remain open.** The sole canonical schema is [feature001 OpenAPI](../../001-connectivity-foundation/contracts/openapi.json), with regenerated BE types. Only the existing start operation's description/security/technical401 changed in this increment; all lookup and other contract objects remain unchanged. Provider/schema evidence is in [research](../research.md), persistence/CAS in [data-model](../data-model.md). Historical proposal wording below is constrained by the current delivery boundary.

## Owner-approved shop-name discovery — source-local contract

**SOURCE/LOCAL AND INDEPENDENT LOOKUP REVIEW ACCEPTED.** Coordinator t151 accepted t175's actual FIX-ONLY final: original lookup P3 resolved, no further confirmed findings in FIX-ONLY. The original lookup review remains one confirmed P3 with no other confirmed actionable findings, distinct from historical Auth/prune/packaging reviews; FIX-ONLY ran no checks or broader review. Canonical shopId/providerCount patterns machine-enforce the exact decimal int64 ceiling9223372036854775807; only providerCount admits zero. Runtime validation and BE generated types stay unchanged. [Accepted closeout](../quickstart.md#accepted-lookup-review--documentation-only-closeout) records current identities; the focused fix and earlier functional evidence remain preserved. Existing one-shop/workspace, create/consent/target verification, scopes, migrations, configuration and reviewed release tooling remain unchanged. Root owns serial integration. Recipient bridge is PROPOSAL ONLY with no source grant; FE compatibility and exact-artifact/secure-binding/hosted/provider gates remain separate.

### Input and authority

Implemented `GET /v1/app/integrations/etsy/shops/lookup`, operationId `lookupEtsyShops`. Require existing technical bearer, current005/006 JWT/session/active Owner admission and `etsy.connection.manage`; no Member/public lookup or new capability. Recheck current Owner authority before returning provider data. The integration remains behind its existing explicit enabled/validated configuration boundary; owner-confirmed local app ping is not hosted configuration acceptance.

Strict query: required `shopName`, optional `offset` default0; reject body, duplicates and all extra parameters. Decode once, trim surrounding ASCII whitespace, require1–64 ASCII letters/digits and lowercase for canonical comparison/query binding. These are application bounds, not claims about provider naming limits. Maximum raw query1024 bytes. `offset` is only0/20/40/60/80; `limit` is fixed20, not caller-controlled. No caller shop/user/workspace/app IDs, URL, provider host, scope or token. A raw URL sent as shopName is invalid400.

FE may locally parse only HTTPS `etsy.com` or `www.etsy.com`, without credentials/custom port, exact `/shop/{one-name-segment}` with optional trailing slash; ignore ordinary query/fragment for name extraction, decode the segment once then apply the same name bounds. Reject encoded path separators, lookalike hosts, other paths and malformed encoding. Bare names use the same normalization. BE receives only the normalized name; neither side fetches a pasted URL, follows a shop redirect or scrapes HTML. Local parsing authorizes no connection.

### Fixed upstream call and response

One explicit lookup/page performs at most one server-side `GET https://api.etsy.com/v3/application/shops?shop_name={encodedName}&limit=20&offset={offset}` (`findShops`). Use only existing app credentials in the composite x-api-key header, no user OAuth token or additional scope. Fixed provider host/path, no redirects,1500ms body-inclusive provider timeout,64KiB body cap and8-second whole operation including existing shorter Auth/DB budgets. No hidden retry, background lookup/polling, cached-success fallback or automatic scan of every page. Reuse existing per-app bounded cooldown/error policy; no new persistence/table or quota value is selected.

Canonical response components are `EtsyShopLookupResponse`, `EtsyShopLookupItem` and `EtsyShopLookupPage`, all strict objects in the existing001 schema, not a second011 schema. BE types are regenerated. Lookup performs no lifecycle/credential/activation writes; an upstream429 may upsert only the existing app cooldown under the existing bounded policy. Provider401/403 maps to configuration_unavailable; generic provider400 remains upstream_unavailable.

```json
{
  "query": "examplestudio",
  "outcome": "exact",
  "items": [
    {
      "shopId": "123456789",
      "shopName": "ExampleStudio",
      "shopUrl": "https://www.etsy.com/shop/ExampleStudio",
      "match": "exact"
    }
  ],
  "page": {
    "offset": 0,
    "limit": 20,
    "providerCount": "1",
    "complete": true,
    "hasMore": false,
    "nextOffset": null,
    "truncated": false
  },
  "ownershipVerified": false,
  "observedAt": "2026-01-01T00:00:00.000Z"
}
```

The JSON is illustrative synthetic data, not a real shop or observation. `shopId` is a lossless positive decimal int64 string; providerCount is a lossless nonnegative int64 string. Validate provider `count/results` and selected identity/name fields; missing/malformed/rounded identifiers or inconsistent same-ID/name rows produce upstream_unavailable, never fabricated defaults. Return at most20 distinct items; identical duplicate records may be collapsed. Validate returned names with the same bounded name grammar and construct shopUrl locally from that name; never forward provider-controlled arbitrary URLs. No owner ID, account/profile/buyer data, raw payload, tokens, app secret or authorization URL is returned.

`match` is exact only for ASCII case-insensitive whole-name equality, otherwise candidate. `ownershipVerified` is always literal false. `observedAt` is the current successful provider observation, not a consent or cached-data timestamp.

### Completeness, ambiguity and selection rules

- `outcome=exact` only when offset0 contains the entire declared result set (`complete=true`) and exactly one distinct candidate has exact-name equality. FE may auto-fill only that ID, visibly showing the resolved name/URL. No consent status changes.
- `outcome=choose` when items are present but automatic exact selection is not justified (partial search, multiple exact-name IDs or only candidate matches). Owner explicitly selects a displayed candidate or refines the name. Never take the first/fuzzy item silently.
- `outcome=not_found` only for offset0/count0/empty items/complete=true. An empty later page, partial result or malformed/upstream failure is not evidence that the shop does not exist.
- `outcome=incomplete` for a valid but empty/inconsistent paging window that cannot establish absence; explicit restart/refinement is required. No phantom choice or connection may be manufactured.
- `complete` means the single initial response covered the full declared search result set: offset0 and all declared results were validated. Later pages never claim global completeness from their own window alone. Count/results are an observation, not a snapshot token across requests.
- `hasMore` describes providerCount versus this response's original result window. `nextOffset` is the next20-step offset only if more provider results exist and it remains below100; otherwise null. `truncated=true` when more provider results exist at the100-record window cap. An explicit choice from a displayed partial page is permitted, but it is still unverified; no global exact-match/absence claim. UI must show partial/truncated state and permit a narrower name instead of unbounded pagination. Pagination is only on explicit user action; no polling.

A selected ID flows into the UNCHANGED invitation creation input `expectedShopId`, together with current `expectedRevision` and an explicit idempotencyKey. Lookup returns no signed ownership claim or connection authority. Creation still validates Owner/workspace/current revision; callback/getMe/getShop still require the exact expected shop and actual consenting owner. Reconnect remains bound to the existing same account/shop; lookup cannot transfer, add a second connection or silently replace that binding.

### Error contract, tests and dependencies

Reuse current `AppError` `{code,requestId}` and optional bounded retryAfterSeconds; no new error enum is needed.400 invalid_request for query/page/URL input; existing technical401 envelope and session401 remain distinct;403 forbidden for non-Owner;503 configuration_unavailable for missing/invalid app configuration or definitive app-key rejection;503 dependency_unavailable for internal Auth/DB dependency failure;503 upstream_unavailable for provider/timeout/body/schema failure;429 upstream_rate_limited plus bounded retryAfterSeconds/Retry-After (1–86400, existing default60). Suppress raw upstream bodies/errors and credentials. Successful no-match/ambiguity/partial cases are200 with the explicit outcome, not fake404 or success implying consent. All responses private/no-store.

Focused local checks cover normalization/URL rejection; zero provider calls for denied/malformed input; exact versus ambiguous/partial/empty later pages; count/ID precision, conflicting duplicate IDs, schema/body/deadline bounds;20/100 paging limits;429/app-key rejection; current-Owner demotion/session revocation during lookup; fixed-origin/no secret projection; and selected ID through unchanged invitation/consent enforcement. Actual Nest/Auth/PostgreSQL/synthetic TLS and a separate direct capped-page selection smoke passed. This is source/local evidence only; see the validation guide for exact commands and initial failures.

Before real FE integration: FE011 regenerates its consumer under its lease and updates its AppMe parser for Etsy read/manage plus error parser for existing Etsy enums/optional retryAfterSeconds. Its local approved-URL-to-name parser and table/sample/selection UI remain separately owned; no FE or browser pass is claimed by BE. Lookup review, exact-source publication/native artifact approval and actual hosted/provider acceptance remain separate gates. No secure-input read, cloud/config/migration/deploy or new worker is authorized by this contract.

## Current backend delivery and FE consumer delta

The six authenticated operations below are mounted only with enabled Etsy configuration, behind the existing technical bearer and current user/session/Owner checks. Capabilities are `etsy.connection.read` and `etsy.connection.manage`; Member receives neither. Strict mutation bodies, revision/idempotency receipts, bounded cursor history and error codes are canonical. Provider429 adds optional bounded `retryAfterSeconds` and `Retry-After`; technical401 retains its existing Unauthorized envelope.

The newly authorized recipient bridge changes exact POST `/integrations/etsy/invite/start` to the configured API/callback Host, identical invitation Origin and existing technical bearer checked before the8KiB JSON body or invitation service. Only `{secret}` is accepted; the invitation proof still grants no app membership. The exact GET `/integrations/etsy/callback` at the configured callback Host remains bearer-free and transaction-authenticated. No GET confirmation page or inspection exception is delivered by BE; GET `/integrations/etsy/invite` remains protected and side-effect-free. FE separately owns the explicit confirmation page, transient fragment handling and same-origin BFF; it sends no cookies/caller token/Host override and validates manual303 against the fixed client/callback, scope, S256 and exact seven consent keys before200 `{consentUrl}`. BE adds no JavaScript, CORS bypass or generic proxy.

Create returns `invitationId/revision/expiresAt` and a fragment `shareUrl` once. Idempotency replay or recovered lost acknowledgement returns the receipt without the secret; cancel/reissue is explicit. Local connection status includes `attemptPhase`, timestamps and allowlisted outcome; deadline classification does not write or call Etsy. Explicit read returns only the four business fields plus connectionId/revision/observedAt, including a bounded candidate-verification retry when applicable. There is no polling, SSE/WebSocket, background sync or public result endpoint.

The separately owned FE actual Auth/BFF/Nest/DB journey with synthetic Etsy is recorded in the validation guide. Its new canonical consumer generation remains held until t151 supplies the reviewed frozen receipt. BE did not edit apps/web; existing BE006 fixture/profile/lifecycle extensions activate only in explicit011 mode. Enabled hosted ingress, logging privacy, secure runtime policy inputs and real provider acceptance remain unverified.

## 1. Owner invitation management and recipient ingress

Current direction supersedes original operator-only initiation. Every authenticated management operation uses current005/006 Owner/session/membership/CSRF checks and server-held technical credentials. The recipient may be a shop operator without a Lovora session; a link never grants workspace membership. The owner creates an invitation before receiving its private shareable URL. IDs alone do not authorize access.

Proposed authenticated operations, to be reconciled into the one canonical schema under a future lease:

| Operation | Input / authority | Result / side effects |
|---|---|---|
| GET /v1/app/integrations/etsy/invitations | Owner/read; bounded pagination only | Safe invitation rows and separate connection state; no link secret, tokens or Etsy call |
| POST /v1/app/integrations/etsy/invitations | Owner/manage; approved expectedShopId, expectedRevision, idempotencyKey | Persist invitation and return shareable URL once; no OAuth/token submission yet |
| POST /v1/app/integrations/etsy/invitations/{id}/cancel | Owner/manage; expectedRevision, idempotencyKey | Cancel scoped invitation/attempt, fence late work; no remote revoke |

Expected shop ID is a validated purpose-bound input only at creation; neither callback nor metadata read may replace it. Idempotent creation replay returns safe receipt/status only, never a second invitation or reprinted secret. If a URL response is lost, cancel/reissue explicitly. List pagination is bounded (default25/max100) with stable cursor ordering. No unbounded history response or additional active shop is implied.

Proposed exact public ingress at the separately approved ETSY_INVITATION_ORIGIN:

- GET `/integrations/etsy/invite`: render a generic first-party confirmation page only; do not claim an invitation, start OAuth, disclose shop metadata or produce personalized secret-bearing cache entries.
- POST `/integrations/etsy/invite/start`: explicit same-origin recipient action with the scoped invitation secret in a bounded request body. Validate allowed Origin, reject cross-origin form/JSON submission, enforce8KiB maximum and exact fields, expiry/hash/creator authority/app/shop/generation checks and atomic one-attempt claim. Return a303 navigation to the generated Etsy consent URL; no arbitrary next/return/provider URL.
- A suggested shareable format is the fixed invitation page plus a fragment carrying an opaque random secret. Fragments avoid sending that secret in the initial HTTP request. The page removes the fragment from browser history before any further navigation, keeps it only in transient memory, sends it solely on explicit Continue, and uses no third-party scripts, telemetry or persistent browser storage. This minimal first-party recipient page needs its own assigned frontend/server-rendered ownership; the current FE lane is not modified. A refresh after removing the fragment may require reopening the original invitation.

These are explicit proposals for later implementation, not existing routes or approved deployment configuration. Resolve exact origin/route hosting before Layer3. Apply no-store/no-referrer, log/body redaction and bounded ingress abuse controls. No query-bearing invitation token, raw token in path/access logs or route-prefix guard bypass. The exact invitation GET/POST and exact Etsy callback are the complete proposed transaction-only exceptions; ordinary app endpoints stay protected. Do not expose public invitation status/list/cancel APIs. Replayed recipient start returns a generic disposition without reissuing consent, exposing credentials or creating another transaction.

Optional operator commands remain trusted adapters to the same service, with explicit current-Owner operational approval; no daemon or alternate state machine. They do not replace the selected Owner flow.

## 2. Exact transaction-authenticated callback

**Proposed registered URI:** `https://api.lovora.us/integrations/etsy/callback`
**Method:** GET only, exact raw path and configured host; no prefix, trailing-slash, case, encoded-path, HEAD or alternate-method alias.

Alongside the exact invitation ingress in section1, this is a narrowly proposed non-preflight technical-bearer exception. The initial early router check recognizes the exact method/path/host and enabled configuration, then validates the callback envelope. It does not bypass authentication for `/integrations/etsy/*`, `/v1/app/*`, health, operator paths or any other route. Requests elsewhere retain the existing technical guard before DB work; app operations additionally retain JWT/current-session/current-membership checks. Existing OPTIONS behavior remains unchanged.

Before provider activity:

1. Enforce4096-byte raw-query maximum and exactly one43-character base64url state. Require exactly one decoded `iss` equal to `https://openapi.etsy.com` for both success and denial (the strict sole-provider policy under RFC9207); missing, empty or unequal issuer is invalid. Success accepts exactly `state,code,iss`; code is nonempty, at most2048 printable ASCII bytes without control/whitespace. Denial accepts exactly `state,error,iss` plus optional `error_description,error_uri`; total size stays bounded. Reject duplicates, mixed success/error and unknown fields. Never derive a token/provider endpoint from `iss`, follow error_uri or reflect error_description.
2. Hash state and perform only the indexed pending-attempt lookup. No global tenant data scan or arbitrary app access is allowed through this unauthenticated ingress. An invalid/missing state is rejected before exchange; a valid shape alone is not authority.
3. Verify workspace, app reference, exact callback, purpose, five-minute expiry, expected shop, current Owner membership and captured connection epoch. Lock in005 order and atomically claim pending→exchanging, then release the transaction before network work. Reject races/replay. A legitimate denial consumes the pending attempt once without calling the token endpoint.
4. Exchange once using the stored verifier. Persist encrypted candidate tokens with a durable receipt; verify actual identity and shop; activate only under current-Owner and epoch CAS. A staged verification_pending or unknown outcome is not active.

The server stores actor/workspace/shop binding; callback clients cannot supply or replace it. State/PKCE bind the OAuth transaction, not a newly invented login. Callback abuse is bounded by one outstanding invitation/attempt per workspace, fixed query/body/deadline limits, existing pool ceilings and a separately verified ingress rate-limit policy before exposure. Repeated unknown state must not exhaust an unbounded queue.

### Callback response and clean return

Use `Cache-Control: private, no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`; no third-party scripts, images or analytics. Recognized terminal callback outcomes redirect303 to the server-stored, owner-confirmed existing public website origin plus `/`, with **no query or fragment**. This neutral landing is not an Etsy success indicator; the privileged status/read operation is the only result authority. No new public API result endpoint is added, because such a page would require a second bearer exception. Invalid/missing/expired/replayed transactions receive a generic400 document with the same privacy headers and no reflected query; dependency failure may return generic503.

OAuth code/state occur only where the provider protocol requires them, never in success redirects or retained evidence; access/refresh tokens never occur in browser URLs at all. Application and platform access-log/query/body redaction must be verified before real consent. If hosting cannot meet that boundary, live acceptance stays blocked; do not silently weaken it or make all production routes public.

## 3. Fixed upstream operations

Consent navigation only: `https://www.etsy.com/oauth/connect` with `response_type=code`, existing public `client_id`, exact registered `redirect_uri`, `scope=shops_r`, random state, request-specific challenge and `code_challenge_method=S256`. Shared secret and verifier never go to that URL.

Every server v3 request uses `x-api-key: KEYSTRING:SHARED_SECRET`. Metadata additionally uses `Authorization: Bearer <complete provider access_token>`. Do not strip the user prefix or attach these credentials to a caller-selected URL/redirect.

| Operation | Method/path on fixed https://api.etsy.com | Body / selected response |
|---|---|---|
| Code exchange | POST /v3/public/oauth/token | `application/x-www-form-urlencoded; charset=utf-8`: grant_type=authorization_code, client_id, exact redirect_uri, code, code_verifier. Response requires access_token, refresh_token, token_type=Bearer, validated expires_in and scope |
| Refresh | POST /v3/public/oauth/token | Same content type: grant_type=refresh_token, client_id, server-held refresh_token. No token-bearing query, scope widening or blind retry |
| Current Etsy identity | GET /v3/application/users/me | Self.user_id and Self.shop_id; requires shops_r; match expected shop and access-token user prefix, without treating that prefix alone as proof |
| Bound shop metadata | GET /v3/application/shops/{verified_shop_id} | Shop.shop_id, user_id, shop_name, currency_code. Both IDs must match getMe and approved binding; no arbitrary shop argument |

At connection verification and every explicit metadata read, call getMe before getShop. getShop's public accessibility does not validate a bearer grant. The selected external projection maps user_id→etsyUserId, shop_id→shopId, shop_name→shopName and currency_code→currencyCode. IDs are lossless positive int64 decimal strings. Require nonempty shop_name of at most256 Unicode code points and currency_code of exactly three uppercase ASCII letters; reject missing/invalid data rather than manufacturing defaults. These are application projection bounds, not claims that Etsy declares those string limits. Extra upstream fields are discarded. No pagination applies to these single-object operations.

Whole application operation deadline8 seconds, including bodies and DB work, within existing10-second hosted limits. Token request at most3 seconds, each metadata request at most1500ms, maximum64KiB response body each, redirect following disabled and disconnect cancellation propagated. DB waits/statement budgets remain bounded by the existing shorter limits and remaining operation deadline. Cancellation after submission records uncertainty, never pretends provider rollback. No hidden request retry, sleeping cooldown or background work after the response.

## 4. Proposed authenticated application operations

These BE interfaces require a future canonical-contract/source grant; the Owner table is planned for a later separately owned FE layer, with no UI delivered now. The technical bearer and current005 JWT/session/member check are mandatory. Future BFF use additionally needs006 integrated acceptance, fixed-origin/method allowlisting and its existing CSRF/generation rules. Technical credentials remain server-only.

Proposed fixed capabilities: `etsy.connection.read` and `etsy.connection.manage`, granted only to active Owner in the existing policy; no Member grant or new role. Preserve all existing capability meanings.

| Proposed Nest operation | Authority | Strict input | Result |
|---|---|---|---|
| GET /v1/app/integrations/etsy | Owner/read | No query/body IDs | Safe connection state, revision, attempt phase, timestamps and outcome; no tokens/authorization URL |
| POST /v1/app/integrations/etsy/read | Owner/read | expectedRevision only | Explicit live metadata read; at most one fenced refresh when needed.200 returns four approved business fields plus connectionId, revision and observedAt |
| POST /v1/app/integrations/etsy/disconnect | Owner/manage | expectedRevision and idempotencyKey UUID | Local credential removal, epoch fencing and safe localDisconnected/providerRevocation=not_confirmed disposition; no remote revoke call |

Use the configured workspace and actor from trusted context; extra fields including shopId, userId, actor, workspace, scope, token, return URL or origin fail400.16KiB maximum mutation body. Initiation uses the Owner-authenticated invitation operation above; reconnect uses a new explicitly approved same-account/shop invitation with expected revision. Public recipient start is scoped to its invitation, never a general connect endpoint. `read` is POST because it may refresh credentials and update durable state; GET status never refreshes or calls Etsy.

App errors retain the existing `{code,requestId}` shape with future canonical allowlisted additions:400 invalid_request;401 existing invalid session/technical handling;403 forbidden;404 inaccessible resource;409 connection_changed/connection_busy/reconnect_required;429 upstream_rate_limited with safe bounded retryAfterSeconds;503 upstream_unavailable/configuration_unavailable/outcome_unknown. A technical401 remains the existing `{status:"unauthorized"}` shape and must not become a bad-password prompt in future BFF code. Provider401/403 are integration grant/permission outcomes, not evidence that the internal Supabase session is invalid.

All app results are private/no-store. Before returning metadata, recheck current Owner admission, active connection state, link epoch and credential version; a concurrent disconnect/reconnect/demotion discards the in-flight result. A provider rejection is classified, not translated into cached/sample success.

## 5. Refresh, reconnect, disconnect and reconciliation

Use the exact durable transitions in [data-model](../data-model.md). A refresh winner records submission before POST and commits a confirmed complete token pair under attempt/epoch/version/deadline CAS. Other callers return busy/retry guidance without submitting. Returned rotation is persisted atomically even if refresh-token bytes stay unchanged. Never infer provider reuse grace or extend refresh lifetime from a sample.

After lost acknowledgement, inspect only the exact durable operation receipt/version. If committed, use that version; if indeterminate, fence access and require explicit reconnect when bounded reconciliation cannot prove a commit. Lease expiry does not authorize a second token POST. New intent/disconnect fences all old work. No generic provider retry/reconciliation endpoint is invented.

Provider429 persists a per-app cooldown derived from validated Retry-After. No automatic retry occurs. For a token mutation,429/5xx/transport loss that lacks documented no-effect semantics is handled conservatively as unresolved mutation/reconnect-required, not permission to reuse an old token. Explicit later metadata reads may resume after cooldown only with a usable committed credential. Invalid_grant or definitive permission loss requires new consent or owner remediation; do not falsely attribute every rejection to revocation.

Local disconnect removes usable local credentials and cancels pending intents, including late responses. The owner can separately use Etsy Account settings → Apps → Connected apps → Revoke, under fresh provider-action authorization. Do not claim remote revocation until its observed result and separately authorized safe denial proof exist. No revocation API path was established in the inspected reference.

## 6. Manual management actions and upstream schema preparation

Check status is a button label for fetching saved invitation/connection state. It performs zero provider calls, token refreshes or mutation reconciliation; displayed status remains the last committed observation. Callback commits independently, including while the Owner page is closed. No timer, focus polling, SSE/WebSocket or scheduler is selected. Sync shop info invokes the explicit POST read above, with at most one safely fenced refresh and getMe/getShop; failures remain visible and are not stale-success fallbacks. Reconnect/disconnect are separate deliberate management actions.

Upstream OpenAPI now supplies selected server-only transport types through the pinned reproducible generation step recorded in research.md, with provenance/drift checks and no runtime download. It is not a second Lovora canonical schema. Only approved operations are callable; no arbitrary method/path/URL/body forwarding. Authentication-guide token validation remains explicit because that path is absent as an operation in the inspected reference. Generated TypeScript types do not replace bounded runtime validation and lossless IDs.
