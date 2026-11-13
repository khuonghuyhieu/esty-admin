# Research: Existing Etsy Connectivity

Documentation research only. No Etsy account, app settings, keys, consent, token endpoint or business API was accessed. Public documentation and the public reference schema are not provider acceptance.

## Primary sources and observed contracts

| Source | Observed fact | Planning consequence |
|---|---|---|
| [Authentication](https://developers.etsy.com/documentation/essentials/authentication/) | Authorization-code flow, PKCE S256, exact registered HTTPS redirect; form-urlencoded exchange and refresh; access lifetime documented as one hour and refresh lifetime90 days | Mandatory state plus PKCE; always include the exact redirect URI even where the current guide permits omission; use returned expires_in and bounded clock skew, not an invented perpetual lifetime |
| [Request standards](https://developers.etsy.com/documentation/essentials/requests/) | Every v3 request uses x-api-key containing KEYSTRING:SHARED_SECRET; scoped requests additionally use the complete user-prefixed bearer token; api.etsy.com and openapi.etsy.com are equivalent documented hosts | Fixed api.etsy.com adapter; both credentials remain server-only; do not reconstruct or strip the provider bearer prefix |
| [Quickstart](https://developers.etsy.com/documentation/tutorials/quickstart/) | Existing apps may be reused; approval/active key is prerequisite; GET /v3/application/openapi-ping returns application_id | Owner must confirm the existing app; ping alone proves neither consent nor shop access; no new Express app or package installation |
| [Overview](https://developers.etsy.com/documentation/) | Seller App is own registered-shop only; Personal App supports approved limited-scale use; Commercial Access is an upgrade path for an approved Personal App | Existing app type, approval and entitlements remain UNKNOWN. No automatic new registration, assumed five-shop allowance, sandbox, policy eligibility or Commercial approval |
| [API reference](https://developers.etsy.com/documentation/reference/) and [its official schema](https://www.etsy.com/openapi/generated/oas/3.0.0.json) | Exact operation security, paths and response schemas listed below | Select endpoints and scopes from the actual schema rather than tutorial examples |
| [Rate limits](https://developers.etsy.com/documentation/essentials/rate-limits/) | API-key-level QPS/QPD limits; rolling24-hour QPD;429 and Retry-After seconds | No invented quota values or midnight reset. Persist bounded per-app cooldown and require explicit later read rather than sleeping/retrying inside a serverless request |
| [Official app removal help](https://help.etsy.com/hc/en-us/articles/360001931728-How-to-Use-Apps-to-Manage-Your-Shop) | Account settings → Apps → Connected apps → Revoke; previously received data may remain | Owner-controlled remote revocation is separate from local disconnect and local data deletion |

The reference page initially rendered only “Loading ...”. Its linked public JavaScript identified the official schema URL. The reader's large-schema artifact ended mid-JSON, so the complete public document was parsed separately in memory:966623 bytes, SHA256 `4d6b2a4af50c8a72b32bd1980d66f1c420f42b25b1c7e71ca4d98c3f928ee95d`, OpenAPI3.0.2/info version3.0.0. No provider schema copy or second live contract is checked into the repository. This hash identifies the observed public document, not a permanent provider-version guarantee.

## Exact selected operations and minimal dataset

| Operation reference | HTTP path on https://api.etsy.com | Security in observed schema |200 schema / selected use |
|---|---|---|---|
| [ping](https://developers.etsy.com/documentation/reference/#operation/ping) | GET /v3/application/openapi-ping | api_key | Pong.application_id, positive int64; optional separately approved key-readiness probe, not a runtime public proxy |
| [getMe](https://developers.etsy.com/documentation/reference/#operation/getMe) | GET /v3/application/users/me | api_key AND oauth2 shops_r | Self.user_id and Self.shop_id, both positive int64; mandatory grant/identity proof |
| [getShop](https://developers.etsy.com/documentation/reference/#operation/getShop) | GET /v3/application/shops/{shop_id} | Inherited api_key; no additional OAuth scope declared | Shop.shop_id, user_id, shop_name, currency_code; ID must come from validated getMe and equal the approved target |
| [getShopByOwnerUserId](https://developers.etsy.com/documentation/reference/#operation/getShopByOwnerUserId) | GET /v3/application/users/{user_id}/shops | Inherited api_key | A single Shop, not a paginated list. Not needed because getMe supplies shop_id; do not use it as OAuth proof |
| [getUser](https://developers.etsy.com/documentation/reference/#operation/getUser) | GET /v3/application/users/{user_id} | api_key AND oauth2 email_r | User profile; primary_email also has app-specific restrictions. Excluded: unnecessary profile/email scope and fields |
| [getShopReceipts](https://developers.etsy.com/documentation/reference/#operation/getShopReceipts) | GET /v3/application/shops/{shop_id}/receipts | api_key AND oauth2 transactions_r | Later dataset only; not requested, implemented or called in the baseline |

Selected consent scope is exactly `shops_r`. Selected business projection is `etsyUserId`, `shopId`, `shopName`, `currencyCode`; safe status/revision/observedAt fields are application metadata. Do not persist or return the full Shop/User payload. No buyer email, address, orders, receipts, personalization, pagination loop, import/sync, listing/order write, shipping, supplier submission or test-order generation is included. The chosen single-object endpoints have no pagination task; pagination and field-availability proof must be designed if the owner later approves receipts.

The observed Self/Shop schemas omit required arrays. The application nevertheless requires the selected identity fields for activation, validates exact types and compares both user and shop IDs. Missing fields fail closed; do not fabricate null/default identities. Treat user_id and shop_id as distinct identifiers despite ambiguous Self.user_id prose. Preserve positive int64 identity losslessly as decimal strings; reject a decoder's rounded/unsafe numeric value instead of authorizing it. Shop names/currency values are data, never HTML or routing instructions.

## Conflicting examples resolved explicitly

- Quickstart uses an HTTP localhost callback, JSON token request examples and diagnostic logging of the PKCE verifier/authorization URL. These are not the project's protocol/security contract. Authentication requires HTTPS and form-urlencoded bodies; credentials, verifier, code, state and full authorization/callback URLs must not be logged. Token-bearing tutorial responses/redirect patterns are not adopted.
- Authentication refresh prose says `grant_type=refresh_code`, while its parameter table and request example say `refresh_token`. Select `refresh_token`. The [reference OAuth2 scheme](https://developers.etsy.com/documentation/reference/#section/Authentication/oauth2) confirms the token resource at `https://openapi.etsy.com/v3/public/oauth/token`; request standards permit the chosen api.etsy.com equivalent. The observed reference has no standalone token path/request-body operation, so it does not independently specify a grant enum. Do not claim it does.
- Some quickstart token examples omit the x-api-key header. Current authentication/request standards and the reference api_key description require KEYSTRING:SHARED_SECRET on v3 requests; include it server-side, including token requests. The consent URL uses the public client_id, never the shared secret.
- Example refresh responses do not establish refresh-token reuse, rotation grace, idempotency, old-token validity, or renewed90-day lifetime. Persist a confirmed returned token pair atomically, whether the strings change or not; do not infer those guarantees or retry an uncertain submission.
- The inspected reference exposes no OAuth token/revoke path operation. Implement local disconnect and support owner-performed Etsy revocation with honest evidence; do not invent a programmatic revocation endpoint.

## Decisions, rationale and rejected alternatives

1. **Existing Nest modular backend and workspace.** Reuse005 current membership and operation layering. Reject a second Express sample, password system, workspace bootstrap or role taxonomy.
2. **Operator-assisted initiation first.** A bounded, explicitly approved operation creates one actor/workspace/shop-bound transaction. It is not an HTTP public connect route or an ongoing operator login credential. Reject browser-visible technical keys. Future Owner self-service depends on006 acceptance and separate FE/capability authorization.
3. **One exact callback exception.** Propose only GET `https://api.lovora.us/integrations/etsy/callback`; authenticate the pending transaction before any provider side effect. All other routes retain the technical guard. Reject broad “OAuth routes are public” bypasses.
4. **Minimal verified metadata.** getMe with shops_r proves the granting identity; getShop verifies the expected shop and projects two additional fields. A public getShop response alone cannot prove access; getUser/email_r adds unnecessary privacy scope.
5. **Protected durable transaction and credentials.** Use existing PostgreSQL, versioned authenticated encryption and database CAS/fencing. Reject plaintext environment token storage, browser token stores, process-only refresh locks, a new queue or a new secrets platform selected without need.
6. **Conservative ambiguity handling.** Single-submission attempts, durable phases and explicit reconnect after unresolved exchange/refresh. Reject blind retries, lease-expiry replay and claiming a timeout rolled back a provider mutation.
7. **Source/local proof before separately authorized live acceptance.** Local HTTPS simulation exercises handlers and DB behavior, not real Etsy policy, TLS routing, consent or token semantics. Reject any automatic tunnel, deployment, registration, secret read or live request during planning.

## Existing tracker context and execution unknowns

Coordinator read C2-01 without writing it: status Doing, last-edited2026-10-25/unverified; historical23Oct intent covers own shop plus other consenting sellers and possible Commercial upgrade on the same Personal App. Stale foundation/hosting progress in that page is not copied as current state. The current owner instruction narrows this plan to the initial metadata connection; historical eventual fulfillment fields do not expand it.

Unknown external facts are implementation/acceptance gates, not guessed values: existing app ID/type/status and actual approval/access; intended consenting Etsy account and target shop; accepted dataset; exact registered callback and production reachability; approved secure app/keyring provisioning; actual granted scope/rotation/revocation behavior; hosting log redaction and callback platform access;005 cloud adoption and001 migration-delivery integration. [The owner handoff](owner-review-handoff.md) collects the bounded decisions without asking for secrets.
