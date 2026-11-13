# Validation Guide: Etsy Connectivity

**Planning only.** There is no runnable010 implementation, registered callback or verified Etsy grant in this packet. This guide specifies future checks, not commands that have already succeeded. Root [README](../../README.md) remains the owner of implemented runnable commands; adding such commands requires a fresh shared-doc lease. Do not execute the following scenarios without the corresponding [plan gates](plan.md#execution-gates-and-remaining-owner-decisions).

## 1. Documentation-only checks available now

From the existing repository root, safe helper invocations use only command-local routing:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/010-etsy-connectivity SPECIFY_FEATURE_NO_PERSIST=1 \
  bash .specify/scripts/bash/check-prerequisites.sh --json --require-spec --require-tasks --include-tasks
```

This checks file availability/path resolution, not project readiness, implementation or Git branch identity. The setup helpers' BRANCH label is the feature name. No create-new-feature/Git helper, pointer persistence, agent-context update or CLI-only Spec Kit extension is authorized. `.specify/extensions.yml` was absent at preparation; the final read-only check must confirm it remains absent or inspect any new hooks without bypassing ownership constraints.

Planning validation additionally checks FR/SC coverage, ordered unique unchecked task IDs, local document links/fragments, exact one-callback/no-secret protocol consistency and the recorded protected-public-file hashes. It does not run application tests/builds. See [the final handoff](owner-review-handoff.md) for actual results rather than treating this command example as execution evidence.

## 2. Future source/local prerequisites

Require explicit source, canonical/generated-file, isolated-resource and test ownership grants. Keep005–009 behavior and historical migration bytes; use the installed Node24 and existing dependency tree. Before any resource starts, confirm no competing lease, allocate a fresh nonce/ports/database and an owned0700 scratch directory, and reject collisions rather than adopt/evict resources. The released006 fixture is not a reusable authorization or dataset.

Synthetic credentials, keyring, IDs and provider responses must be newly generated within the owned fixture only; file handoffs0600, no symlinks or secret stdout. No owner private/auth/cache file, live Supabase, Etsy account or production key is needed for source/local proof. Grant only scoped application fixture SQL and provider-simulator actions. Preserve shared54322/55432/55433/3100/4317, owner preview3000 and named volumes; do not assume an unlisted port is free.

Use real Nest handlers and real PostgreSQL constraints/transactions, not mocked repository echoes. Provider transport is synthetic and isolated; deny unintended outbound network access. Reuse existing test helpers and a disjoint fresh fixture rather than a duplicate permanent suite for copied behavior. No root dependency install is implied.

## 3. Local HTTPS options — proposal, not a tunnel

Preferred local functional/E2E option: an owned loopback TLS terminator/test server with an ephemeral test CA/certificate, exact test-only redirect registration in the synthetic provider, and a disposable browser trust configuration limited to that certificate. Never install a CA globally, disable TLS verification in application code or rewrite real production callback registration. Record any test-only browser certificate bypass as a visual/transport limit, not real browser HTTPS trust proof.

An owner-approved public HTTPS staging callback on the existing hosting direction could later prove real browser reachability, but requires separate publication/deployment/provider registration/logging authorization. A separately approved tunnel is an alternative only after a new resource/security decision; **no tunnel is created or selected by this plan**. Real Etsy's authoritative HTTPS/exact-registration requirement is not waived by quickstart's HTTP localhost sample.

## 4. Future behavioral acceptance matrix

| Check | Procedure and observable result | Evidence boundary |
|---|---|---|
| Protocol | Inspect synthetic transport requests: fixed HTTPS host/path, x-api-key composite, complete bearer where scoped, form bodies, exact redirect, S256 and shops_r only | No live key/token request |
| Initiation | Explicit current-Owner/operator approval creates one300s bound attempt and private authorization-link file; missing approval/Member/foreign workspace/extra scope refuses | Not an app login or public connect route |
| Guard | Exact GET callback transaction flow works without technical bearer; neighboring paths, trailing slash, encoded aliases, HEAD/POST and all ordinary app routes do not bypass existing guard | Observe denial before provider work and before unrelated DB access |
| State | Missing, duplicate, random, expired-at-boundary, consumed, wrong-workspace, cancelled and concurrently replayed state; at most one token POST | Real SQL claim/constraint, not an in-memory mutex |
| Authority | Disable/demote actor while consent is pending; change connection epoch or disconnect during getMe/getShop | No activation or returned stale metadata |
| Exchange | Correct code/verifier; wrong verifier; denied consent; malformed token fields/scopes; response truncation; lost HTTP response; candidate DB commit failure/ack loss | No second exchange after unknown submission; staged candidate is not active |
| Identity | Actual synthetic grant user differs from configured app registrant; getMe mismatch/no shop; Shop owner/shop mismatch; int64 precision and missing fields | Reject substituted/rounded IDs and public-only proof |
| Encryption | Inspect owned DB for plaintext absence; decrypt with correct purpose/key; wrong key ID, tag, nonce, row/workspace/version/AAD reject; key transition races with refresh | Never include ciphertext/key/token dumps in retained evidence |
| Metadata | Explicit Owner read obtains getMe then only the verified shop; output four business fields; Member/foreign/detached caller denied; extra provider fields discarded | No order/receipt/profile/email requests or cached/sample success |
| Refresh | Two independent application workers demand refresh for one version; one submission; rotated/unchanged returned refresh strings; missing fields; invalid_grant; response lost | Durable CAS/fence; no old-token replay after ambiguous outcome |
| Commit ambiguity | Lose DB commit acknowledgement after provider response; inspect exact receipt/version; simulate process loss after submission and late arrival after fence | Adopt only proven committed version; otherwise reconnect-required/unknown |
| Reconnect | New explicit same-account/shop intent; old callback/refresh/read races; different shop/account/workspace substitution | New epoch wins; no silent transfer |
| Disconnect/revoke | Local disconnect deletes usable secrets, cancels attempts and prevents late restoration; synthetic provider revocation denies next getMe | Local confirmation is not actual Etsy revocation |
| Rate/dependency |429 with valid/missing/invalid/long Retry-After; token and metadata timeouts; partial bodies; DB/Auth/key/config faults; cancellation | Bounded safe outcomes, durable cooldown, no hidden retry/background request |
| Privacy | Inspect actual browser URLs, redirects, payloads, HTML, storage and captured application/access logs with synthetic secrets | OAuth code/state only in necessary callback request; no credentials in success URL/reports; no real hosting guarantee |
| Regression/cleanup | Run affected existing guard/admission/migration tests once after fixes; original-history checksums stable; close only owned resources and verify retained evidence | No full-suite repetition without relevant reason; no shared-service reset |

Write deterministic permanent tests only for consumer-visible authorization, lifecycle, validation and concurrency risks. Use a throwaway actual HTTP/DB smoke for operational/wiring proof. Record failing-before/passing-after results and every intermediate failure rather than rebranding a targeted rerun as an entire clean suite.

## 5. Automated main journey

Through the existing browser harness under separately assigned FE test ownership: approved operator intent → synthetic Etsy consent → HTTPS callback → privileged verification/status → exact projected read → explicit same-account reconnect → local disconnect → old/stale requests denied. Include denial and expired/replayed state recovery. Drive actual Nest and DB, not a fake final success page. The clean public landing is neutral; read the authoritative connection result through the approved privileged path.

This is an automated local journey, not a new Owner Connect UI and not real Etsy consent.006's accepted session journey can support later authenticated Owner UI only after that separate scope is approved. The010 journey must not modify/reuse006's old browser secrets, case records or retired resource lease.

## 6. Future actual Etsy/hosted acceptance

Only after source/local evidence, separately authorized review, publication/artifact approval,001 versioned migration-delivery integration and005 hosted adoption:

1. Owner confirms the **existing** app's non-secret identity, type/status/access and approval, intended granting account/shop, metadata-only dataset and callback/return origins. Do not register a new app, assume a sandbox or infer Commercial eligibility from a key's existence.
2. Owner provisions the minimum server-only app credentials and versioned encryption keyring using an approved secure channel. Never send secrets through chat, argv, screenshots, reports or repository files; preserve originals and do not silently redo setup.
3. Verify exact `https://api.lovora.us/integrations/etsy/callback` registration, TLS/platform routing and query/body/header logging redaction under explicit hosted/provider authorization. Keep ordinary API bearer protection. If the platform cannot satisfy callback privacy/access, stop real consent and report the specific blocker.
4. If authorized, one server-side `GET /v3/application/openapi-ping` establishes only current application access/application_id. It does not prove user consent, shops_r or shop ownership.
5. Create one approved bound attempt; intended account performs real Etsy consent. Observe the exact HTTPS callback, single exchange, encrypted candidate, getMe identity and matching getShop projection before claiming connection active. Record actual scopes/expiry and safe IDs/statuses, never raw code/state/token/link or provider bodies.
6. Under separate explicit lifecycle permission, exercise a real refresh and subsequent identity/read, same-account reconnect, local disconnect and owner-performed Etsy Revoke. Record actual returned rotation behavior and observed denial without extrapolating token reuse/grace or global revocation. A withheld lifecycle grant remains an open acceptance gate, not a simulated pass.
7. Record statuses, safe response fields, operation receipt IDs, target source/artifact identity and limits. Restore/stop only resources created under that grant; preserve shared services, actual shop data and historical evidence.

No order creation, receipt write, listing write, purchase, shipping, import, buyer data or supplier submission is a connectivity check. No owner-side external input or action above is performed in this planning increment.

## 7. Evidence and owner review

Current packet evidence is documentation integrity only. Future reports must separately label synthetic protocol/functional checks, real local HTTP/DB/browser checks, actual Etsy consent/read/lifecycle, hosted transport/logging, source review and publication. Existing C2-01 stays the tracker; the coordinator may update it only with separate external-write authority. Keep [owner-review-handoff.md](owner-review-handoff.md) as this packet's bounded review receipt, not another product tracker.
