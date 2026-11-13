# Proposed Data Model: Etsy Connectivity

Design only; no table, migration, role grant or managed Auth change is executed. Extend the existing `app_private` schema and node-pg-migrate history after authorization. Reuse [005's workspace, membership, audit and lock conventions](../005-app-foundation/data-model.md); no Etsy password or second identity system.

## Trusted context and common constraints

- Every row carries the configured workspace UUID and an application-generated UUID identity. Request-supplied workspace/actor values never establish authority.
- Existing Owner/Member remain the only roles. A current active Owner is mandatory for operator-approved intent and later user-session operations. Operator approval is a bounded operational authorization record, not a new user role or a public bearer credential.
- Provider IDs are canonical positive decimal int64 strings at application boundaries and bigint in PostgreSQL; range1–9223372036854775807. Decode without rounding; reject an unsafe/lossy decoder result. Etsy user ID, Etsy shop ID and internal Auth UUID are different identities.
- Server/database clocks own timestamps and expiry. Revisions and fencing epochs increase monotonically; clients cannot supply replacements. Foreign keys and unique constraints include workspace where applicable.
- Acquire locks in existing order: workspace → sorted relevant memberships → connection → attempt/credential. Keep SQL transactions short; never hold a transaction or pool client across provider HTTP calls. Commit checks repeat current authority and compare the captured epoch/version.

## Connection: `app_private.etsy_connections`

| Field | Constraint / meaning |
|---|---|
| id, workspace_id | UUID primary identity and existing workspace FK; unique workspace_id for this initial one-connection application scope |
| app_ref | Immutable non-secret binding to the exact client_id and owner-confirmed existing app identity, not a shared secret or reassignable label. A changed client_id is a different app; pending transactions reject changed app/callback/scope configuration |
| intended_shop_id | Required confirmed positive int64 shop ID before initiation; not editable by callback/query parameters |
| etsy_user_id, shop_id | Nullable until verified; actual grant user and shop. Once linked, same-account/shop reconnect only |
| state | `unconnected`, `verification_pending`, `active`, `reconnect_required`, `refresh_unknown`, `disconnected` |
| link_epoch, revision | Nonnegative monotonic counters; every accepted new intent, activation or disconnect fences older work as specified below |
| active_credential_version | Nullable pointer to a verified credential version; never points to a candidate or unknown attempt |
| verified_at, last_read_at | Nullable server timestamps, not a promise that cached metadata remains authorized |
| last_outcome | Allowlisted safe code only; no provider error text/payload |

Unique `(app_ref, shop_id)` when shop_id is bound prevents silently sharing a shop across workspaces. A conflict returns a non-disclosing conflict/denial, not the other workspace's identity. This is a conservative project constraint, not an Etsy shop-count entitlement. Disconnect retains a safe binding tombstone; reconnect reuses it for the same account/shop. Different-shop replacement or cross-workspace transfer needs separate reviewed scope, not a callback overwrite.

Do not store full Shop/User documents. Live metadata projection is returned only by an authorized explicit read. An inactive connection's timestamps cannot be presented as a fresh successful read.

## Authorization attempt: `app_private.etsy_authorization_attempts`

- UUID id; workspace_id, connection_id and actor_user_id bound to existing membership/profile identities; app_ref; purpose `connect|reconnect`; explicit operator approval ID and approved scope fingerprint.
- `expected_shop_id` required; `expected_etsy_user_id` required for reconnect and optional for first link when not yet known. Initial activation still verifies actual getMe user and Shop.user_id equality.
- `state_hash`: unique SHA-256 of32 cryptographically random bytes encoded unpadded base64url for the authorization flow. Raw state is not stored in reports or ordinary logs.
- `verifier_envelope`: authenticated encrypted PKCE verifier; freshly generated32 random bytes as43-character base64url, S256 challenge. AAD binds purpose/version/workspace/attempt/app/key reference.
- Exact callback URI, literal granted-request scope policy `shops_r`, fixed return destination equal to the owner-confirmed existing public website origin plus `/` (no query/fragment), expected connection epoch, created_at and expires_at exactly created_at+300 seconds. No new public API result route is introduced.
- State: `pending`, `exchanging`, `verification_pending`, `completed`, `denied`, `expired`, `failed`, `exchange_unknown`, `cancelled`. CAS `pending→exchanging` consumes state once before a provider request. Duplicate callbacks cannot submit again.
- One outstanding attempt per workspace. A new attempt refuses a live predecessor unless an explicit cancel/supersede is approved. Expired attempts are marked expired and their verifier/candidate secrets removed under the next guarded operation or explicit operator prune; TTL authorization does not depend on a background job.
- `submission_id`, `submitted_at`, deadline, reserved candidate credential version and safe outcome distinguish a request never submitted from a potentially consumed code. A stored non-secret receipt ID supports exact DB reconciliation, not provider replay.

After receiving tokens, persist a protected candidate before identity reads. State remains verification_pending until getMe/getShop and current Owner checks succeed. Read failures after candidate persistence permit an explicit bounded verification retry with that still-valid candidate, not another code exchange. An expired candidate requires reconnect. Failure or timeout before token persistence after submission is exchange_unknown; never resubmit the code. Destroy verifier/code material when no longer needed; the authorization code is never persisted.

## Credential version: `app_private.etsy_credentials`

- Composite key `(workspace_id, connection_id, version)`; version positive, monotonically allocated under connection serialization. Gaps after failed attempts are allowed.
- State `candidate|active`; only the connection's active pointer is usable for normal reads/refresh. Replacement/disconnect removes obsolete token ciphertext in the same transaction; no token history archive.
- Envelope fields: format_version1, key_id (validated1–64 `[A-Za-z0-9_-]` characters), fresh96-bit nonce, ciphertext and128-bit tag. AES-256-GCM with a32-byte key selected by key_id. AAD binds provider, app_ref, workspace, connection, credential version, key ID and purpose.
- Encrypted plaintext contains only the complete access token, refresh token, token_type, actual granted scopes and necessary expiry metadata. Tokens are nonempty, at most8192 bytes each, with no control characters/whitespace usable for header injection. Bound the full provider token response to64KiB. No plaintext columns or token hashes in public reports.
- expires_in is a validated positive integer no greater than the documented3600 seconds for this baseline; shorter values are honored. Calculate access_expires_at from receipt time conservatively and a30-second refresh margin. Document90-day refresh lifetime, but do not extend/restart that lifetime on refresh without provider evidence.
- Exact requested/granted scope policy is shops_r. Missing/unsupported scope, missing required token fields, unexpected token type or user-prefix mismatch fails closed; no fabricated refresh token or old-token fallback.

Only the active key encrypts new records; retained explicitly configured previous key IDs decrypt old records. Unknown key IDs and authentication-tag failure stop access. Key replacement/removal and any rewrapping require a separately approved procedure that races safely with credential CAS and accounts for retained backups; database ciphertext deletion alone is not a promise of cryptographic erasure from backups.

## Refresh attempt: `app_private.etsy_refresh_attempts`

UUID attempt_id; scoped connection; captured link_epoch and credential_version; operation receipt ID; state `reserved|submitted|committed|rejected|unknown`; submitted_at;15-second fencing deadline; safe error classification. One unfinished attempt per connection. Reserve before network use; record submitted before POST. Atomic commit checks attempt ID, current epoch/version, non-disconnected state and nonexpired fencing deadline, then replaces both credentials and appends audit.

The request budget is8 seconds; the15-second fence is a bookkeeping upper bound, not a claim about platform termination. Expired submitted attempts become unknown, never automatically available for another POST. A process loss after marking submitted is conservatively unknown even if no bytes left the host. A DB acknowledgement loss is resolved by reading the exact operation receipt/version: committed means use the committed version, otherwise remain unknown. If a returned new pair is still available in the same authorized process, only a fenced DB commit reconciliation may use it; never call the token endpoint again. Unknown tokens are not used for reads or refresh; require explicit reconnect when reconciliation cannot establish a committed version.

## Connection transitions and stale-work fencing

| Transition | Required evidence and atomic effect |
|---|---|
| unconnected/disconnected/reconnect_required/refresh_unknown → pending attempt | New explicit approval and current Owner; fixed same bound shop/account where already established; increment link_epoch, reserve one attempt and fence prior operations |
| active → reconnect attempt | Explicit same-account intent; fence old operations and suspend normal reads while the candidate is unresolved; no silent continued use of a possibly revoked old pair |
| attempt exchange → verification_pending | Known token response durably encrypted; never an active result |
| verification_pending → active | getMe IDs + expected shop + Shop owner/ID all match; actor still Owner; epoch CAS; activate candidate and erase superseded credentials |
| active → refresh submitted → active | Single fenced submission and confirmed atomic token-pair replacement; link binding unchanged |
| uncertain submitted refresh → refresh_unknown | Fence usage; preserve only necessary protected reconciliation state, never resume old-token use on lease expiry |
| any state → disconnected | Current privileged intent; increment epoch/revision, cancel pending attempts, remove usable credentials/verifiers and append audit; late callbacks/refreshes/reads cannot commit or return data |
| definitive grant rejection → reconnect_required | Safe provider classification, no guessed remote revocation cause; require new consent |

## Rate-limit and audit records

Use a bounded app_ref cooldown record in the same database to avoid process-only throttling across Vercel instances. Store only retry_not_before, safe status and revision; cap accepted Retry-After at86400 seconds, default60 seconds when missing/malformed, and make no request during cooldown. This is a conservative application cooldown, not the provider's actual quota. No scheduler or sleeping HTTP request.

Reuse005 append-only scoped audit with a reviewed additive event-kind/target extension where required. Record actor/workspace, connection/attempt ID, action, safe outcome, revision and timestamps only. Never retain raw callback query, authorization URL, code, state, verifier, key, tokens, full provider body or buyer/profile data. Safe attempt/receipt tombstones have a proposed24-hour operational retention; prune only through an explicitly authorized bounded operator action. Existing audit retention remains the owner's policy, not a newly invented retention guarantee.

## Migration and access boundary

Append a new migration filename allocated at implementation time after collision check; do not invent a timestamp or edit applied migrations. Update the one existing generated manifest and its checksum/report contract only under that future source grant. New app-owned tables/functions have no PUBLIC/anon/authenticated access. Existing app_runtime/app_operator lack privileged role flags; add only the scoped operations needed, with fixed search paths and revoked PUBLIC execute where SECURITY DEFINER is required. Operator privileges must be explicitly extended by the new migration, not assumed from005 bootstrap rights. Never mutate managed Auth tables or widen the existing session-check function.

Local apply/replay, denied direct access, cross-workspace and cleanup proof are future work. Hosted adoption requires [001's versioned production migration-delivery gate](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only), old/target manifests, serialized migration-before-deploy and unknown-commit fencing. The existing current-schema-only pipeline must continue to refuse an unapplied target.
