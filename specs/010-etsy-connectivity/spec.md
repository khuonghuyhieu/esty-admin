# Feature Specification: Existing Etsy Account and Shop Connectivity

## Accepted recipient bridge review — documentation-only closeout

**FROZEN BE_RECIPIENT_BRIDGE_SOURCE_LOCAL_REVIEW_ACCEPTED; STOP WRITES.** Coordinator t151 accepted existing t175's actual final: **no confirmed actionable findings in this frozen bridge scope**. The reviewer ran no checks and did not reassess earlier features. This is a separate bridge review, not a rewrite of lookup/Auth/prune/packaging history or an all-checks-green claim.

FE acceptance remains17/18 plus affected1/1, not a single clean18-case run; the earlier actual006 group remains6/8 with role-change503 of unconfirmed cause. Source135 records, canonical and BE types remain frozen at the identities in the validation guide. This closeout changes only the five existing010 documents; no execution or resources were restarted.

t151 reports the reviewed canonical handshake delivered to FE/root; this does not claim FE generation or review completed. Root owns serial integration/release and remaining hosted/provider gates. Ownership returns to t151. All following capture-time statuses, failures and review distinctions are retained as historical snapshots.

## Current recipient bridge increment

**FROZEN READY_FOR_BE_RECIPIENT_BRIDGE_REVIEW; STOP WRITES.** T040–T043 source/local execution, separately owned FE acceptance and owned cleanup are complete; the new scoped review is pending. Upstream start requires the native API/callback Host, exact invitation Origin and existing technical bearer before body/service; callback remains bearer-free. FE owns explicit confirmation and strict manual303 validation. Production configuration, CORS, other guards and accepted lookup behavior are not broadened.

The011-only fixture reused006 lifecycle and pinned actual GoTrue/PostgreSQL with fresh owned loopback resources and explicitly synthetic Etsy. BE proof includes real login/refresh/logout/current session, Owner demotion, invitation/start/replay, PKCE callback and persisted status. FE reported17/18 plus affected1/1 across1440/360/390, not one clean18-case run; independent counters were verified. All owned resources and identities were removed after handback. The earlier unrelated role-change503 remains disclosed with unconfirmed cause. Ownership returns to t151 for existing t175 review; root owns serial integration/deployment. Earlier lookup paragraphs remain historical; no new review, hosted or real Etsy acceptance is claimed.

## Accepted lookup baseline — historical

**Feature**: `010-etsy-connectivity` · **Status**: BE_LOOKUP_SOURCE_LOCAL_REVIEW_ACCEPTED — coordinator t151 accepted existing t175's actual FIX-ONLY final: original lookup P3 resolved, no further confirmed findings in FIX-ONLY. The original lookup review remains one confirmed P3; the reviewer ran no checks or broader review. Runtime/lifecycle behavior and historical Auth/prune/packaging reviews remain unchanged. This is scoped lookup source/local acceptance, not hosted/release completion. Root owns serial integration; recipient bridge remains PROPOSAL ONLY with no source grant. FE/browser, exact-artifact/secure-binding and hosted/provider gates remain open.
**Working context**: Dedicated `feat/etsy-connectivity` worktree; lookup-start HEAD `3c2f6f42aa08b7f64a7bb249c0ec529e7051d68c` is coordinator-reported, not re-probed by the writer. Original base `a9b3d70ceff042b893fa06877eca197d3d31c06c` is historical. Current owner direction and supplied accepted-foundation facts are recorded in [plan.md](plan.md#current-owner-decisions-and-evidence-boundary).

## Purpose and authority

Let the owner explicitly authorize the existing Etsy app to access one approved shop in the existing internal workspace, prove which Etsy user granted access, and read a minimal account/shop identity projection. Connection approval is not app approval, workspace admission, or permission to import orders. This is an early BE integration in the existing application, not another authentication system or a public seller-connect product.

Reuse [005's authorization boundary](../005-app-foundation/contracts/proposed-api.md), fixed Owner/Member policy and [006's browser session](../006-login-session/contracts/session-bff.md). Owner creates a scoped invitation from Lovora, shares it with the shop operator, and manages rows using explicit Check status/Sync shop info actions. The recipient needs Etsy consent authority, not Lovora Owner membership. This supersedes original operator-only initiation; FE implementation remains a separately owned later layer. Developer-app environment/configuration is the first future increment, before shop-connect behavior. Existing app registration/access and sufficient resources are owner-confirmed; do not repeat setup or request secrets.
Existing [Notion C2-01](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) remains the milestone tracker. Its historical own-shop/other-seller and Personal-to-Commercial intent does not establish current app type, approval, entitlements or this increment's dataset. No duplicate tracker or external update is created.

## Current owner amendment — source/local shop-name discovery

Owner approved table-first entry of a shop name or approved Etsy shop URL, resolved to the provider-assigned Shop ID before invitation creation. The subsequent explicit T037→T038→T039 source/local grant implemented the [lookup contract](contracts/proposed-api.md#owner-approved-shop-name-discovery--source-local-contract), sole canonical operation and BE generated types. FE URL parsing and integration remain separately owned. Discovery is public unverified metadata, not OAuth consent or shop ownership proof. It adds no connection, scope, role or extra shop. Owner-reported app ping succeeded for application1527398778065; agents did not read credentials or repeat the call. That report is app-access evidence only. Current local checks and initial failures are recorded in [quickstart.md](quickstart.md#current-shop-name-lookup-source-local-freeze); source review and hosted proof are separate gates.

## User Scenarios & Testing

### US1 — Authorize the intended existing account and shop (P1)

**Value**: The owner can prove a real consent grant belongs to the approved shop without exposing credentials or opening public connection creation.
**Independent acceptance**: A current Owner creates and shares one scoped invitation; the recipient explicitly starts a bound attempt; the intended Etsy account consents; the registered callback establishes the verified account/shop binding. Local simulation and real Etsy acceptance are reported separately.

1. Given a current Owner and a confirmed target shop, creation persists an expiring invitation row and privately returns its shareable Lovora link. Opening alone has no side effect; recipient confirmation starts a fresh short-lived OAuth attempt. It does not mark the shop connected.
2. Given matching consent, the callback is accepted once, credentials are protected, the actual granting user and shop are verified, and only then is connection status active.
3. Given denied consent, expired/replayed state, a disabled/demoted actor, an unexpected shop/account, or a foreign workspace, no connection is activated and no sensitive result is disclosed.
4. Given an uncertain exchange or persistence outcome, the owner sees a pending/unknown or reconnect-required state, never an invented success or an automatic second exchange.

### US2 — Read only the approved minimal metadata (P1)

**Value**: The owner can establish useful read access before expanding the integration.
**Independent acceptance**: With an active connection, an explicitly authorized read returns exactly the current granting user ID, shop ID, shop name and currency code, plus safe connection/read-status metadata.

1. The read verifies the current grant and expected identity before obtaining the bound shop's metadata; a public shop lookup alone is not consent evidence.
2. Members, foreign-workspace callers and disconnected connections receive no metadata. Caller-supplied shop/user identifiers cannot redirect the read.
3. Missing scope, malformed/missing fields, unavailable dependencies, throttling or revoked grants produce a classified failure rather than stale/sample data.
4. No receipt, order, buyer, address, personalization, listing-write, shipping or supplier operation occurs.

### US3 — Maintain, reconnect and end access honestly (P1)

**Value**: Expiry and failures do not mix identities, resurrect access or lose track of a credential mutation.
**Independent acceptance**: Exercise concurrent reads/refresh, rotating token responses, ambiguous acknowledgements, explicit same-account reconnect, local disconnect and externally revoked consent.

1. Concurrent refresh demand causes at most one provider refresh submission for the current credential version; only its fenced winner can replace the protected token pair.
2. A timeout, process loss or lost database acknowledgement never licenses replay of the old refresh token. A late response cannot overwrite a newer connection or undo disconnect.
3. Reconnect needs a new explicit approval and consent attempt, preserves workspace/account/shop binding, and cannot silently transfer a shop between workspaces.
4. Local disconnect immediately prevents subsequent app use and removes usable local credentials. It does not claim provider revocation. Etsy-side revocation and its actual denial evidence are distinct.

### Edge cases

Duplicate/malformed query parameters; missing browser technical bearer on the callback; wrong method/path/Host; callback error text containing secrets; clock/expiry boundaries; simultaneous consent callbacks; ownership changes while consent is pending; wrong encryption key/version; corrupt ciphertext; numeric identifier precision loss; omitted granted scopes; no shop; public metadata readable after private grant revocation; overlapping reconnect/refresh/disconnect;429 with malformed or long Retry-After; partial response bodies; cancellation after provider submission; database commit acknowledgement loss; missing runtime configuration; unavailable hosted prerequisites.

## Requirements

- **FR-001**: Use the existing app, workspace and explicitly approved target shop. The initial application limit is one connection per workspace, not an assertion about Etsy account limits. No unbound public initiation or new app/account creation is included; recipient start is restricted to an Owner-created invitation.
- **FR-002**: Bind each management/read/sync action to current Owner membership and existing session/capability/CSRF policy; a retained operator adapter requires explicit operational approval. The recipient invitation permits only the bound consent transaction, not app membership or management access. Members cannot initiate, read, refresh, reconnect or disconnect this integration. Recheck authority before committing an activation or returning data.
- **FR-003**: Complete initiation, consent, registered secure callback, protected code exchange, protected credential storage and actual granting-user/shop verification before reporting an active connection.
- **FR-004**: Each attempt is single-use, expires after five minutes, and is server-bound to actor, workspace, intended shop, app identity, purpose, fixed return destination and connection generation. Reject replay, mismatched proof and cross-workspace/relink substitution.
- **FR-005**: Recipient confirmation is FE-owned and explicit; a browser never receives the API technical bearer. Its same-origin BFF sends exact POST start to the fixed API origin with technical bearer and exact invitation Origin. BE requires the single native API/callback Host and checks bearer before the bounded body/scoped invitation proof. Only exact OAuth callback remains bearer-free and transaction-authenticated. No BE inspection GET exception, Host override, forwarded-host trust, CORS expansion or deployment-wide bypass is permitted; every other route retains its existing technical and applicable user/session boundaries.
- **FR-006**: Use the official provider protocol and required headers, exact redirect matching, scoped consent, verified secure transport, bounded requests and no credential-bearing request URLs for token exchange/refresh. Never copy contradictory tutorial shortcuts.
- **FR-007**: Protect credentials and proof verifiers at rest with versioned authenticated encryption and explicit key references. Fail closed on missing/wrong keys or tampering; never expose provider credentials in frontend state, successful redirect queries, logs, Git or evidence reports.
- **FR-008**: Identify the actual granting user and authorized shop through the authenticated provider identity operation. Cross-check the intended shop and shop owner; never infer identity from an app registrant, submitted shop ID, token prefix alone or public metadata alone.
- **FR-009**: Request only the permission needed for the selected minimal identity/shop dataset and return only the approved field projection. Validate provider schemas and identifier precision. Orders/receipts and their scopes remain separately approved later work.
- **FR-010**: Serialize refresh durably per connection; atomically replace a confirmed token pair using version checks and fencing. Unknown submission/commit outcomes block reuse until safe reconciliation or explicit reconnect; lease expiry is not permission to resubmit.
- **FR-011**: Reconnect requires a new bound consent attempt and explicit same-account/shop intent. New activation or disconnect fences every older callback, refresh and metadata result. No silent cross-workspace reassignment.
- **FR-012**: Distinguish local disconnect, confirmed provider rejection, owner-performed provider revocation and unknown outcome. Remove locally usable secrets on disconnect; do not invent a revocation API or claim remote erasure.
- **FR-013**: Bound deadlines, response sizes, concurrent work and rate-limit cooldowns. Classify invalid grants, missing permissions, dependency/configuration failure,429 and uncertain outcomes; avoid hidden retries, background import and stale-success fallback.
- **FR-014**: Keep scoped audit events and safe request/attempt identifiers, never raw provider payloads or credentials. Callback query/authorization-link logging and third-party callback content must be absent, including hosting telemetry before live consent.
- **FR-015**: Propose additive workspace-scoped persistence through the existing versioned migration history/manifest and existing role policy. Production execution depends on001's separately approved migration-delivery work; no second schema history or live OpenAPI is created here.
- **FR-016**: Require meaningful functional tests, real local HTTP/database fault and concurrency checks, an automated main-journey browser check, and separately authorized real Etsy consent/callback/read acceptance. Mock success is never provider acceptance.
- **FR-017**: Preserve005–009, public pages, current application behavior, shared resources and existing evidence. The current explicit grant permits only the BE source/local increment and010 evidence; no publication, hosted migration/deployment or real provider action follows. FE navigation, apps/web/session helpers and browser fixtures retain their independent ownership.
- **FR-018**: Reuse owner-confirmed existing developer-app registration/access and resources. Retain exact app/shop binding, callback registration/reachability and secure configuration as later execution inputs without reopening completed setup. Never request secret values in chat or automatically repeat setup.

- **FR-019**: Deliver configuration/secret-safe validation first, reusable fixed-origin upstream client/schema preparation second, then invitation/connect behavior and separately owned Owner UI. Generated upstream types must not expose a universal public Etsy proxy or widen consent scopes.
- **FR-020**: Persist and list invitation history with safe expiry/status and current-Owner create/cancel authority. Link secrets are hashed; no secret in table/status/logs. Replays, previews, cancellation and demotion cannot create unauthorized attempts or connections. Invitation lifetime is separate from five-minute OAuth lifetime. Runtime invitation/retention durations require explicit validated inputs; no24-hour default is accepted and live owner policy remains pending.
- **FR-021**: Check status reads local persisted state with zero Etsy calls or refresh. Sync shop info is an explicit provider verification/read. Callback completion is independent of either button. No automatic polling, focus polling, SSE/WebSocket or background sync.

- **FR-022**: An authenticated current Owner may explicitly look up a normalized shop name through fixed findShops and obtain only bounded public ID/name/derived URL choices with completeness and unverified status. Auto-fill requires one complete exact match; ambiguity/partial search requires explicit choice/refinement. URL parsing is local only, and no arbitrary provider URL fetch is allowed. Selection feeds existing expectedShopId; consent/identity/one-shop constraints remain unchanged.

### Key entities

Existing workspace and current Owner membership; scoped connection invitation; purpose-bound operator approval where used; expiring authorization attempt; workspace-scoped connection; encrypted credential version and refresh attempt; redacted audit event. See [data-model.md](data-model.md). No Etsy password, browser password store, order model or new role taxonomy is introduced.

## Success Criteria

- **SC-001**: One explicitly approved real account completes consent and callback and is bound to exactly the intended shop; no active status precedes verified identity and shop ownership.
- **SC-002**: Replay, expired state, wrong identity/workspace, stale generation, Member and revoked-actor cases activate zero connections and expose zero unauthorized metadata.
- **SC-003**: A successful minimal read returns only the four approved business fields; missing permission, revocation and dependency failure never appear as successful reads.
- **SC-004**: Concurrent refresh submits at most once per credential version; disconnect or newer consent wins against every older in-flight response, including lost-acknowledgement cases.
- **SC-005**: The acceptance record distinguishes documentation, synthetic/local checks and actual provider proof, with no credentials in retained evidence and no unauthorized resource or scope changes.

- **SC-006**: Configuration-only acceptance proves disabled/partial/malformed settings and secret-safe errors without contacting Etsy. Upstream schema preparation is reproducible and does not create executable unapproved features.
- **SC-007**: Owner creates a persisted invitation row, recipient completes consent independently, and explicit Check status observes the committed result without calling Etsy. Sync performs only the selected metadata operation; an idle table produces no periodic requests.

- **SC-008**: Exact complete search resolves the intended ID, ambiguous/partial/empty later pages cannot silently select or claim absence, and Member/foreign/stale-Owner calls cause zero unauthorized results. Lookup never marks connected; wrong-shop consent is still rejected by the existing flow.

## Assumptions and dependencies

The owner selected one-shop identity metadata and manual table actions; orders/listings/import/fulfillment/webhooks remain later scope. Existing developer-app registration/access, resources, D1/D2 and successful Owner login are supplied current facts, not fresh runtime verification. Exact secure configuration, invitation lifetime and hosted010 proof remain separate. No source approval follows from planning. The layered plan governs current scope over original operator-only/historical unknown-app wording retained in the handoff/research history.
