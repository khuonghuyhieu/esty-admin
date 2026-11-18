# Feature Specification: Etsy Connection UI Preview

**Branch**: `feat/etsy-connection-ui` · **Created**: 2026-11-18 · **Current status**: T016 SCOPED_REVIEW_ACCEPTED_SOURCE_RETURNED_TO_T12P_STOP_WRITES. The existing t18d GPT-6-Luna medium read-only pass found no confirmed actionable FE correctness, security, regression or test-gap findings and ran no tests/builds/writes. All117 frozen source hashes are preserved. Actual local acceptance remains17/18 plus affected1/1, with real GoTrue/BFF/Nest/owned DB and explicitly synthetic Etsy; no clean18 run or hosted/live-provider proof is claimed. Root owns serial publication/integration and remaining hosted/configuration gates. Preview requirements/evidence below are historical scope.
**Source**: OWNER START — FE ETSY UI FIRST, integrate BE LATER. Clean selected base `08e68fb91e0cfb74776494eb84709e8eb9b2244b`; feature011 absent at allocation. D1/D2 accepted, real Owner login working and this FE base deployed are owner-supplied facts, not checks to repeat. PROJECT_STATE remains dated historical evidence.

## User scenarios and testing

### US1 — Review and manage a sample connection (P1)

An admitted Owner navigates from the existing shell to `/connections/etsy`, understands the preview boundary, creates an invitation for a lossless expected shop ID, inspects and copies a nonfunctional sample value, and confirms cancellation or local disconnect.

Acceptance: empty → create dialog → pending history → inspect/copy → cancel confirmation → cancelled history. Separately select the connected sample, inspect shop identity/currency/last observation, dismiss then confirm disconnect. Every success identifies itself as preview/sample; no real connection, invitation, revocation or secret is implied.

### US2 — Understand boundaries and recover locally (P1)

Empty, pending, connected, reconnect-required, unknown, loading and failure samples have clear next actions. Check saved status reads only local preview state; Sync shop info is disabled and explained as a future explicit POST, not polling. A Member sees an explanatory read-only boundary without management controls or sample shop details. Signed-out access follows ordinary006 admission.

Acceptance: select each sample, recover from loading/error, keyboard-open dialogs, trap focus, Escape/cancel restores focus, invalid/out-of-range IDs cannot create a sample, and rejected clipboard access offers manual copy. Navigation/history preserves shell/profile and bounded display behavior.

## Requirements

- FR-001: One protected management page; reuse the established header/main transition, sidebar and paper/ink/peach visual system. No dashboard redesign, metrics, orders or charts.
- FR-002: A prominent UI-preview/sample-data notice states that changes are transient and no Etsy/API connection occurs. Reload or leaving the page may reset samples.
- FR-003: Import connection, invitation, create-input and observation shapes from committed generated FE types; preserve canonical state/field names. Positive int64 shop IDs stay decimal strings without numeric coercion.
- FR-004: Invitation creation represents Owner-created links followed by explicit recipient consent. Copy only `SAMPLE ONLY — NOT A WORKING INVITATION`, never a navigable consent/recipient URL or token. No fabricated callback or automatic consent success.
- FR-005: Creation, cancellation and disconnect operate only on local component state. Cancellation/disconnect require confirmation. Saved status and future explicit shop sync remain distinct.
- FR-006: Existing admitted Owner role plus current workspace-management capability enables **sample controls only**; Member controls/details are omitted. This does not grant Etsy authority. Integration later must use current `etsy.connection.read/manage` and server enforcement, not this preview affordance.
- FR-007: Keep shared006 admission, single-flight context/me and strict non-sliding60s sample DISPLAY freshness. Audit the new RSC tree before additive route registration. No private server data, API/BFF/handler/provider/callback, Auth simulation in shipped code or session-controller rewrite.
- FR-008: No BE/010/canonical/generated/root-doc/package/lock/pointer changes, dependencies, publication, deployment or live accounts. Test-only transport may simulate admission; evidence must not call that real Auth/Etsy integration.

## Key entities

Transient generated `EtsyConnection`, `EtsyInvitation`, `EtsyCreateInvitation`, `EtsyCreatedInvitation`, `EtsyShopObservation`; separate local preview scenario/dialog/feedback state. No persistence or operational secrets.

## Success criteria

1. Production-browser preview journey and meaningful state boundaries pass with no Etsy/business API requests.
2. Keyboard dialogs, empty/loading/error/Member/signed-out boundaries pass; screenshots at1440×1000,360×800,390×844 have no document overflow.
3. Affected lint/typecheck/build and route/session navigation regressions pass with isolated output; historical failures remain disclosed.
4. Freeze exact changed paths/hashes and local commands/screenshots at READY_FOR_FE_ETSY_UI_REVIEW; root supplies the sole reviewer. Real recipient consent, token fragments, callback handling, BFF integration and hosted acceptance remain later scope.

## Specification quality

Reviewed against the local Spec Kit checklist: scope, actors, acceptance, boundaries and observable outcomes are explicit; no unresolved owner decision. Compact spec/plan/tasks replace extra roadmap/checklist scaffolding per this task's instruction. Existing pinned skills/templates remain unchanged.


## Owner feedback amendment — table-first and shop discovery, 2026-11-18

**Owner amendment; T011–T015 implemented, locally verified and scoped review accepted. Owner visual acceptance and T016 live integration remain open.** The owner wants a management table rather than a large connection-detail card and approves entering a shop name/link instead of manually locating an Etsy numeric ID. This supersedes only the original layout/manual-input choice; keep the existing one-shop-per-workspace constraint, Owner invitation flow, preview honesty and session safeguards. Original UI-only review remains historical, not acceptance of these changes.

- FB-001: Make a compact connection table the main content. Columns: Shop, Shop ID, Connection status, Last observation, Actions. One row represents the existing one connection, including pending/reconnect/disconnected states; do not invent multi-shop support to fill the table. Details open on row action, not as the dominant page card. Keep invitation history a separate table with Expected shop ID, Invitation status, Created, Expires and Actions.
- FB-002: Main action opens name/link lookup → explicit result selection/confirmation → read-only Etsy-assigned Shop ID → create invitation. Editing the name/link clears the prior result and prevents submission until resolved again. Numeric IDs are not user-defined identifiers and never pass through JavaScript Number. Support normal HTTPS etsy.com/www.etsy.com `/shop/<name>` links by local parsing only; send a normalized name to a fixed server lookup, never ask the server/browser to fetch a pasted URL. Reject foreign/malformed links; no first-result auto-selection if ambiguous.
- FB-003: Public lookup proves only that a shop was found, not ownership/consent. Show intended/unverified identity separately from authenticated shop observations; callback getMe/getShop must still match the existing expectedShopId binding. No OAuth or connection is started by lookup. One unresolved/partial/failed response never enables Create.
- FB-004: In this UI-first increment, lookup is a clearly labeled local simulation with loading/not-found/ambiguous/error states. No real lookup endpoint is assumed implemented. Show real integration unavailable rather than silently fetching Etsy or modifying BE. Live integration requires the010-owned canonical lookup request/response/permissions/errors and generated consumer first.
- FB-005: Align all fixture states with current BE semantics and keep provider actions distinct from saved status. Fix observation revision minimum, distinguish intended Shop ID from verified connection.shopId, retain fixed shop binding after cancel and preserve one-time-link behavior. Corrected preview state is not provider proof.

The later owner-approved010 lookup proposal permits explicit selection from a partial candidate page, with ownership still unverified. FB-003 therefore forbids a partial response **by itself** from enabling Create: a validated candidate must be deliberately selected and confirmed; empty/inconsistent/incomplete responses never provide a selectable identity. No response, even exact, grants consent or verified shop access. T016 remains a separately authorized integration dependency.

## Owner START T016 — actual integration

- IN-001: Retain the accepted table/dialog layout and one workspace/connection. Replace shipped sample state/outcome controls with actual saved status/history and explicit lookup/create/cancel/disconnect/sync through same-origin fixed-backend BFF operations. No sample fallback, polling, automatic consent or mutation retries.
- IN-002: Consume only010's frozen reviewed canonical contract and regenerate FE types only. Admit exactly canonical AppMe Etsy read/manage capabilities and error codes, including optional bounded retryAfterSeconds and429. Keep006 identity, generation, CSRF/Origin, cancellation, single-flight and non-sliding display freshness; display admission is not business authority.
- IN-003: Every operation reaches current BE authority with the sealed caller access token, never browser-visible technical credentials. Mutations bind the current generation and observed connection revision; one idempotency key per deliberate user intent, never regenerated during an in-flight operation. Unknown outcomes require explicit saved-status reconciliation, not automatic resubmission.
- IN-004: Lookup is deliberate normalized-name/manual pagination only. Preserve exact int64 strings, explicit candidate confirmation, stale input/response guards and public-versus-authenticated identity labels. Copy an actual invitation URL only from its original creation response; never persist/log/reconstruct a secret from history or idempotency replay.
- IN-005: Minimal public recipient page removes the fragment immediately, holds it only in memory, requires confirmation before start, and matches the existing exact-host ingress/callback. No user-supplied upstream URL, Host/Origin spoofing, arbitrary redirect, widened CORS or invented OAuth topology. Cross-host implementation waits for the smallest reviewed010/root-approved transport contract.
- IN-006: Extend focused functional/BFF boundary tests and production browser acceptance using actual isolated local Auth/BFF/Nest/owned DB with synthetic Etsy transport. No shared services, owner credentials, actual provider/cloud calls, new dependencies/frameworks, Git or deployment. Disclose synthetic Auth separately if it cannot meet the actual Auth requirement.
- IN-007: Sole apps/web+011 writer t18c; existing t18d reviewer. Preserve all previous receipts. Freeze READY_FOR_FE_ETSY_INTEGRATION_REVIEW, obtain one scoped pass/fix-only checks, return source and actual evidence to t12p.
