# Data Model: Login and Current Session

No new PostgreSQL entity, password table or migration is planned. Reuse [005's accepted data model](../005-app-foundation/data-model.md) unchanged.

| Entity | Source of truth | Required invariant |
|---|---|---|
| Auth identity/current session | Supabase Auth, verified by existing Nest adapters/session function | Signed token alone is not current admission; session_id and subject must still match an active session |
| Profile/workspace/membership/capabilities | Existing app tables and generated AppMe | Owner/Member and active/disabled are server-owned; no sample defaults or user-metadata role |
| Browser Auth context | Purpose-bound HttpOnly server-sealed cookie | Random generation and CSRF nonce; valid context alone grants no app access |
| Browser session envelope | Purpose-bound HttpOnly server-sealed cookie | Access/refresh tokens and expiry hint bound to the current generation; never serialized into JS/HTML/RSC |
| Client presentation state | Per-browser coordinator, current safe AppMe projection | Generation/identity-tagged; discard stale responses, clear on logout/invalidation, revalidate before restoring protected UI |

Transitions and exact cookie formats/bounds are owned by [the BFF contract](contracts/session-bff.md), not a second schema. Login begins a fresh generation before credentials; refresh stays within it; logout replaces it. Provider-confirmed revocation remains the security authority for replayed credentials outside the browser. A failed/unknown upstream operation never becomes a positive state by inference.

007's invitation-scoped and009's recovery-scoped challenge/session envelopes are future purpose-restricted extensions to the same sealing/generation mechanism. They are not implemented by006, do not authorize general app reads before admission and must not create a second session controller. Any shared-helper extension is serialized by the assigned integration owner.
