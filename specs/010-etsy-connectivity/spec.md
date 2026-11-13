# Feature Specification: Existing Etsy Account and Shop Connectivity

**Feature**: `010-etsy-connectivity` · **Status**: READY_FOR_OWNER_PLAN_REVIEW — documentation only; no implementation or external action approved.
**Working context**: Existing repository and owner-reported `main`; no branch created or verified through Git. The owner delegated this planning scope through t4y/t4v to sole writer t4q.

## Purpose and authority

Let the owner explicitly authorize the existing Etsy app to access one approved shop in the existing internal workspace, prove which Etsy user granted access, and read a minimal account/shop identity projection. Connection approval is not app approval, workspace admission, or permission to import orders. This is an early BE integration in the existing application, not another authentication system or a public seller-connect product.

Reuse [005's authorization boundary](../005-app-foundation/contracts/proposed-api.md) and the fixed Owner/Member policy. [006's browser session](../006-login-session/contracts/session-bff.md) is a separate integration dependency, not proof that an Owner-facing Etsy action exists. Early initiation is an explicitly approved operator-assisted action bound to a current Owner; later self-service must use the existing authenticated Owner session and a separately approved capability/FE extension.

Existing [Notion C2-01](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) remains the milestone tracker. Its historical own-shop/other-seller and Personal-to-Commercial intent does not establish current app type, approval, entitlements or this increment's dataset. No duplicate tracker or external update is created.

## User Scenarios & Testing

### US1 — Authorize the intended existing account and shop (P1)

**Value**: The owner can prove a real consent grant belongs to the approved shop without exposing credentials or opening public connection creation.
**Independent acceptance**: An approved operator starts one bound attempt; the intended Etsy account consents; the registered callback establishes the verified account/shop binding. Local simulation and real Etsy acceptance are reported separately.

1. Given a current Owner, an explicit operator approval and a confirmed target shop, initiation creates one short-lived attempt and privately provides the authorization link. It does not mark the shop connected.
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

- **FR-001**: Use the existing app, workspace and explicitly approved target shop. The initial application limit is one connection per workspace, not an assertion about Etsy account limits. No public initiation or new app/account creation is included.
- **FR-002**: Bind each privileged action to an explicit operator approval and current Owner membership, or to a separately authorized future current-Owner session capability. Members cannot initiate, read, refresh, reconnect or disconnect this integration. Recheck authority before committing an activation or returning data.
- **FR-003**: Complete initiation, consent, registered secure callback, protected code exchange, protected credential storage and actual granting-user/shop verification before reporting an active connection.
- **FR-004**: Each attempt is single-use, expires after five minutes, and is server-bound to actor, workspace, intended shop, app identity, purpose, fixed return destination and connection generation. Reject replay, mismatched proof and cross-workspace/relink substitution.
- **FR-005**: The browser callback has a narrowly defined transaction-authenticated exception, because it cannot provide the API technical bearer. Every other route retains its existing technical and applicable user/session boundaries. No wildcard or deployment-wide bypass is permitted.
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
- **FR-017**: Preserve005–009, public pages, current application behavior, shared resources and existing evidence. No implementation, migration, installation, source/shared-doc modification, publication or provider action follows from this plan.
- **FR-018**: Keep existing-app approval/type/access, target account/shop, minimal dataset approval, callback registration/reachability and future secure configuration as explicit owner/execution gates. Never request secret values in chat or automatically repeat setup.

### Key entities

Existing workspace and current Owner membership; purpose-bound operator approval; expiring authorization attempt; workspace-scoped connection; encrypted credential version and refresh attempt; redacted audit event. See [data-model.md](data-model.md). No Etsy password, browser password store, order model or new role taxonomy is introduced.

## Success Criteria

- **SC-001**: One explicitly approved real account completes consent and callback and is bound to exactly the intended shop; no active status precedes verified identity and shop ownership.
- **SC-002**: Replay, expired state, wrong identity/workspace, stale generation, Member and revoked-actor cases activate zero connections and expose zero unauthorized metadata.
- **SC-003**: A successful minimal read returns only the four approved business fields; missing permission, revocation and dependency failure never appear as successful reads.
- **SC-004**: Concurrent refresh submits at most once per credential version; disconnect or newer consent wins against every older in-flight response, including lost-acknowledgement cases.
- **SC-005**: The acceptance record distinguishes documentation, synthetic/local checks and actual provider proof, with no credentials in retained evidence and no unauthorized resource or scope changes.

## Assumptions and dependencies

The proposed baseline is account/shop identity metadata only. Owner review may change that dataset, but doing so requires revisiting endpoint, scope, privacy and test contracts before code. App type/status/access remain UNKNOWN rather than guessed Seller/Personal/Commercial classifications. Existing005 local evidence is not005 hosted readiness;006 session completion does not install an Etsy capability. Later FE self-service, shared contract edits, dependencies, isolated resources, migration delivery, publication, secure configuration, real consent and deployment each need their own explicit ownership/authorization gates in [plan.md](plan.md).
