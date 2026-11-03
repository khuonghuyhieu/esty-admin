# Research: Login and Current Session

Planning observations only; no source/test/build/server/Auth/DB/provider operation was executed.

| Decision | Evidence and rationale | Rejected alternative |
|---|---|---|
| Reuse current Nest admission | Sole OpenAPI0.4.0 and005 service/verifier/definer already implement current identity/session/membership and safe errors | A second password/auth business API or role inferred from user metadata |
| Server-only BFF, no browser SDK | Existing web package has Next/React only. [Supabase advanced guide](https://supabase.com/docs/guides/auth/server-side/advanced-guide) explains that standard browser SSR SDKs require refresh-token access and warns about shared clients/cache. Our different server-only topology owns every Auth operation. | Labeling standard browser SDK cookies HttpOnly while expecting browser refresh; implicit access-token fragments |
| Explicit Route Handler cookie writes | [Next cookies reference](https://nextjs.org/docs/app/api-reference/functions/cookies): async cookie reads in RSC, mutations only in handlers/server functions before streaming | Refreshing inside page rendering, ISR or generic proxy middleware |
| Native fixed REST calls and Node AES-GCM | No new dependency is required; accepted BE already uses bounded Auth REST. Token verification/admission remains in Nest, not handcrafted frontend JWT validation. | New SSR beta SDK, password/session store, shared mutable per-user singleton |
| Explicit begin/generation + serialized transitions | A refresh response must not rewrite logout context; a login response cannot establish a new context after delayed credentials. Contract makes ordering and failure behavior explicit. | In-process serverless locks; assuming AbortController or UI unmount alone prevents late Set-Cookie |
| Separate token-hash email features | Existing BE invitation redirect is exactly `/auth/invitation?invitation=<uuid>`;007 must bind provider email templates to server verification and009 owns recovery | Assuming the default fragment-based provider redirect works with HttpOnly BFF cookies; using recovery as invitation |
| One shared migration prerequisite | [001 future versioned integration](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only) remains unimplemented;005 target differs from production current-schema baseline | Copying its release plan into each feature or changing the approved digest to pass |

The cookie/generation protocol is a selected implementation design, not demonstrated behavior. Actual issued-token size, browser API support, two-tab ordering, SSR/cache isolation and local/hosted cookie attributes need the functional and real browser checks in tasks. No non-NULL Auth-session timebox proof is inherited from005. No arbitrary capacity/SLA, retention period or real owner/sender identity is invented.

Allocation evidence and writer boundaries are recorded in [plan.md](plan.md). No `.specify/extensions.yml` exists; no hook/branch/setup helper was invoked. Future helper use must be command-local with `SPECIFY_FEATURE_DIRECTORY=specs/006-login-session SPECIFY_FEATURE_NO_PERSIST=1`; never rewrite the shared pointer. The manual precondition/consistency review replaces potentially Git-using generic helper execution under this no-Git planning authority.
