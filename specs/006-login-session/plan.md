# Implementation Plan: Login and Current Session

**Status**: READY_FOR_OWNER_PLAN_REVIEW — sole-writer planning only; no implementation authorization.
**Spec**: [spec.md](spec.md) · **Contract**: [session-bff.md](contracts/session-bff.md) · **Tasks**: [tasks.md](tasks.md).
Existing branch context is coordinator-supplied; no Git command or new checkout is used.

## Summary and allocation evidence

The owner's direct decomposition replaces the earlier proposed monolithic005 joint plan. Preserve005's accepted source, records, hashes and documents; do not answer p13's old planning dialog or treat a delayed old prompt as current authority. Stop and coordinate before writing if that superseded request arrives.

Before allocation, `specs/` contained001–005 only; no006–009 reservation appeared in current specs/shared-pointer configuration. The live `codex2` pane `wA:p1C` was idle in this repository; one bounded read showed its actual planning outputs under `specs/004-workspace-foundation/`, not a second006 planning tree. Repository/sibling directory and codex2/planning-name discovery found no other allocation. No agent was prompted to plan, no dialog answered and no new writer created. A collision discovered later stops allocation/work rather than silently renumbering or overwriting.

Resumption receipt: current coordinator `t4v`, relaying owner coordinator `t4y`, explicitly reconciled the newer four-feature instruction and resumed ONLY006–009 documentation in existing OMP `t4q`. Old TUI pane IDs above are historical allocation evidence, not live addresses or a quorum requirement. Completed read-only FE inventory from `t4x` is reused, not rerun.005 remains frozen independently of the returned FE005 pause; no blanket FE source hold is requested.

| Separate user deliverable | Plan directory | Dependency |
|---|---|---|
| Login/session | `specs/006-login-session/` | Accepted005 BE; fresh implementation/resource grants |
| Team/invitations/OwnerMember/status | [007](../007-team-invitations/plan.md) | Integrated006 session/caller |
| Account/workspace settings | [008](../008-account-workspace-settings/plan.md) | Integrated006 session/caller; not007 |
| Password recovery | [009](../009-password-recovery/plan.md) | Integrated006 session; its own callback/mail grant; not007/008 |

This table is dependency navigation, not a duplicate tracker. Each feature owns a complete user journey and its shared FE+BE+integration tasks. None closes solely from lane completion.

## Technical context and research decisions

Observed stack: Next16.4.3, React19.3.1, Node24, existing Playwright1.64.1 and Node functional tests; Nest12.2.0 with the accepted005 module, Supabase Auth and one PostgreSQL history. No frontend Auth SDK is installed. Reuse native fetch/Node crypto instead of introducing an SDK, store or framework. The BFF owns server-only transport; Nest remains identity/session/membership authority. [Research](research.md) records source-backed choices and rejected alternatives.

Observed FE delta: `login-screen.tsx` only validates; `profile-menu.tsx` has a no-op Sign out; `/application` renders sample UI; team/settings use fixtures. There are no existing web Route Handlers. `apps/web/src/lib/api/generated.ts` is the existing consumer to regenerate from the sole OpenAPI, not duplicate by hand. `health-client.ts` is the bounded health-only caller, not an arbitrary auth proxy.

Observed BE reuse: `GET /v1/app/me` returns profile/email/workspace/membership/capabilities. Backend config fixes invitation redirect to `/auth/invitation`; ordinary logout scope local and recovery global semantics already have local evidence. Technical bearer plus X-App-Access-Token remain independent. The RLS-aware definer and current membership checks remain untouched; local source acceptance is not deployed schema proof.

**Missing delta**: web generated consumer, server config/cookie/CSRF/generation/caller helpers, exact Auth/BFF endpoints, page guards, real identity/sign-out wiring and genuine browser integration. No new canonical business operation or BE migration is planned. BE work is contract/fixture/integration validation; a confirmed gap requires a separately coordinated exact source/contract grant, not an invented parallel auth module.

## Journey-to-contract and evidence matrix

Canonical version0.4.0 has14 operations (2 health +12 app), SHA256 `41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad`. The observed FE-generated file SHA256 `8159554985609ca68a2e9881a5345a162c4f92b1bfce59557cf3bc09caaf49b0` contains only health paths; it does not prove a semantic version or app consumer. [Retained005 evidence](../005-app-foundation/quickstart.md#actual-backend-verification-receipt), not a new run: T038/T042/T043 config/HTTP28/28, real GoTrue→Nest→DB9/9 and affected concurrency9/9; scoped review accepted, no browser evidence. Non-NULL Auth `not_after` remains unexercised.

| Journey | Actual operation/schema/error | Implemented BE evidence | FE task and missing binding | Joint acceptance |
|---|---|---|---|---|
| Password sign-in → current admission | Provider password grant; GET `/v1/app/me` → AppMe; AppError401/403/503 | T038/T042/T043 current session/membership and dependency denial | T002/T005–T008: generated consumer, server transport, real form and page/menu context | Real Owner/Member browser login and reload; unadmitted/disabled deny, no fixture fallback |
| Restore/current permissions | Provider refresh; same GET me, no new Nest refresh route; current403 versus technical401→503 | T043 refresh/current session and role/status denial | T009–T013: lock/generation, safe refresh state, SSR/cache isolation | Actual expiry/refresh; two contexts/tabs, current disable/demotion, safe Auth/DB outage |
| Local logout and replay | Provider `/logout?scope=local`; GET me rejects revoked session | T043 local logout/current-session checks; not non-NULL timebox proof | T009–T013: acknowledged cookie clearing, stale response fencing, unknown outcome UI | Old JWT denied by real Nest; independent session survives; late response cannot restore private UI |


## Resolved interface and states

[The session BFF contract](contracts/session-bff.md) is normative for cookie names/purpose/encryption, exact Origin/CSRF, fixed headers, allowlisted routes, safe errors, byte/deadline limits and generation ordering. Use the explicit begin→login acknowledgement, one browser Web Lock, no RSC/GET refresh, no module-level user state and late-result invalidation. Standard browser Supabase SSR cookies are deliberately not described as HttpOnly while simultaneously expecting browser SDK access. There is no implicit fragment callback or PKCE flow in password sign-in.

States and transitions: signed-out → begin/submitting → admitted or authenticated/unadmitted; admitted → restoring → admitted/signed-out/dependency-error; admitted/unadmitted → signing-out → local-cleared with confirmed/unknown provider outcome. Lost network acknowledgement before cookie-clearing response is sign-out unconfirmed. Gate/cookie mismatch is signed-out/session-changed, not stale authorization fallback. Missing deployment configuration is an unavailable app, not a sample identity.

`/application`, `/settings`, `/settings/team` receive current server admission. Only006 login/context/logout is operational in this slice;007/008 activate their distinct body behavior later. Preserve shell layout/sample project cards and label unconnected portions truthfully. Replace only identity/menu plumbing with sanitized AppMe fields. Home/privacy stay independent. No global root-layout redirect that breaks public pages, future invitation or recovery exceptions.

## Source ownership and interfaces for later implementation

| Lane | Existing/new files | Boundary |
|---|---|---|
| FE session owner | New `apps/web/src/features/app-session/{config,cookies,csrf,auth-client,app-client,session-controller}.ts`; new `session-provider.tsx` | Server-only config/crypto/callers; client coordinator receives only safe DTOs/generation/CSRF. Never import server modules into client bundle. |
| FE routes | New `apps/web/src/app/api/auth/{context,begin,login,refresh,logout}/route.ts`; new `apps/web/src/app/api/app/me/route.ts` | Exact operation table; no catch-all or health/operator forwarding. |
| FE page/UI integration owner | Existing `apps/web/src/app/{login,application,settings,settings/team}/page.tsx`, `features/workspace-foundation/{login-screen,profile-menu}.tsx`, `features/application-preview/{application-shell,application-preview}.tsx` | Guard pages individually, propagate sanitized identity, preserve visuals; shared shell/menu edits serialized. |
| FE generated/config owner | Existing `apps/web/src/lib/api/generated.ts`, `.env.example`, `next.config.ts`, `playwright.config.ts` | Generation from sole schema; names only; isolated testing mode, no root dependency mutation. |
| BE owner | Existing `apps/api/src/app-foundation/**`, `apps/api/tests/app-foundation.integration.test.ts`, `apps/api/tests/app-fixture-lifecycle.ts` | Reuse reviewed behavior; scoped acceptance/fixture adaptation only after grant, no speculative source fix. |
| Integration owner | Existing `apps/web/tests/functional/workspace-foundation.test.ts`, `tests/e2e/application.spec.ts`, new `tests/functional/app-session.test.ts`, new `tests/e2e/app-session-fixture.ts` | One reusable real-Auth fixture and existing application suite, not four duplicate journey harnesses. |
| Coordinator | Root package/lock, canonical schema, shared documentation and resource leases | No current writes; no dependency install required by this design. |

Task labels identify future lanes, not newly assigned people or approval. One writer owns each overlapping path.006 completes/freeze-hands-off shared session helpers before dependent implementation;007/009 extensions to common auth/caller files are serialized by the integration owner.

## Execution and parallel slices

1. Owner accepts this plan and issues exact implementation/FE-BE/shared-file/resource grants; bind the canonical snapshot and ensure the accepted005 local source is available.
2. FE config/cookie/caller functional implementation and BE contract/fixture readiness can proceed independently in disjoint paths after the contract is frozen. No server test resource starts just because source work begins.
3. FE auth routes precede login/page/menu integration. FE only owns its generated consumer; BE source/sole OpenAPI are not regenerated casually.
4. Integrate the actual browser path, then failure/security/race cases, then affected public/UI regressions. One functional + real E2E acceptance receipt closes the feature; lane receipts alone do not.
5.007/008/009 can plan independently now. After006 acceptance,007 Team and008 Settings files are disjoint;009 recovery screens are also disjoint. Shared caller/session/layout/test/config files remain serial, and shared Auth fixture tests run serially. No instruction here starts parallel agents.

## Functional and real E2E validation plan

Functional tests cover exact input/security/error mappings, purpose/tamper/generation cookies, unsafe return paths, stale response discard, no refresh on SSR/GET, no provider work before CSRF denial, cancellation and no secret serialization. Test behaviors, not source text or incidental copy. Extend existing meaningful workspace/application tests; replace superseded preview-only behavior assertions, do not re-pin wording.

Real E2E extends `apps/web/tests/e2e/application.spec.ts`: actual form login, rendered current identity, direct protected URLs/reload, real expired-access refresh, local logout and old-token denial, unadmitted/disabled users, role change without JWT refresh, two isolated browser contexts, two tabs, logout versus delayed read/refresh, unsupported coordination fallback, technical-key outage distinct from password error, and Auth/API/DB failure. Observe persisted membership and real provider session behavior. Synthetic peers remain only targeted fault tests, never the main journey.

Future fixture proposal, NOT startup authority: a new owned nonce/project for strict loopback DB55440/Auth55441/Mail55442/API55443/web55444. Recheck conflicts and never adopt/evict another process. Reuse existing005 fixture guards only with fresh identities/registry entries, not deleted run IDs. Preserve owner preview3000/session6634/default `.next`, shared3100/4317/54322/55432/55433 and volumes. T008 adds `APP_SESSION_E2E=1` plus `APP_SESSION_E2E_RUN_ID=<32 lowercase hex>`; reject unsafe/missing nonce, non-loopback origins and hosted mode. Its sole test `distDir` is `.openai/app-session-<nonce>` relative to `apps/web`, with scoped report/result children, web55444, `reuseExistingServer:false` and serial shared-Auth scenarios. Without the flag preserve existing config. These proposed flags are NOT supported by current source.

One future integration owner records nonce, ports, process/container identities, build path and lifecycle receipt before startup. BE starts owned DB/Auth/mail, bootstraps only synthetic identities/workspace, starts the canonical API on literal loopback and hands its bounded readiness/URLs to FE without secrets in chat. FE builds once for the agreed scope using the same E2E flags for type generation/build/start/Playwright and owns only web/browser teardown. BE then stops/removes only registered owned API/fixture resources after FE handback. On failure preserve sanitized evidence, stop owned resources through guards, and never touch shared volumes. Do not use shell-wide env exports or the normal3100 suite by accident. No fixture/resource lease is active from this plan.

[Quickstart](quickstart.md) lists future commands/scenarios, not executed checks. Screenshots at1440/360/390, keyboard/focus/errors and overflow are part of affected UI verification; observe the approved application reference before actual UI changes using the installed frontend-design, doodle, web-design-guidelines and relevant React skills. No browser/visual claim is made now.

## Constitution and remaining gates

Planning conforms to one FE/BE/DB, one OpenAPI/history, English artifacts, no new business module, and end-to-end evidence rather than scaffold/lane completion. Prior005 and current shared docs/pointer remain untouched. Spec Kit templates are adapted to existing authority: no branch/helper automation, pointer persistence, hooks or source execution. No extensions configuration was found.

Critical execution prerequisites: fresh FE/BE integration ownership, approved synthetic identities/workspace and exact isolated resources, secure server-only config/cookie key delivery (never chat/private-original reads), FE generation, and demonstrated cookie/refresh/logout behavior. Approved baseline is not a question. Real owner/SMTP/retention and hosted activation remain later setup gates. Production integration depends solely on [001's existing migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only); current-schema-only rejection is correct and must not be bypassed. No publication/deployment follows from plan acceptance or local E2E.
