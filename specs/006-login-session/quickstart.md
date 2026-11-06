# Validation Handoff: Login and Current Session

**LOCAL_COMPLETE — T001–T016; STOP WRITES / NO INFLIGHT.** The ONE Luna review's original P2 was fixed and accepted by coordinator inspection of only that fix/evidence; no unresolved confirmed finding remains in the scoped review.006's integrated local journey and interface handoff are complete. Hosted rollout, owner acceptance, other-engine proof and publication remain separately gated.

## Before execution

Use [the plan's ownership/resource gate](plan.md#functional-and-real-e2e-validation-plan). Coordinate a fresh synthetic fixture nonce and strict loopback targets, controlled synthetic owner/workspace, server-only configuration through an approved secure channel and the FE generated consumer. Do not reuse deleted005 fixture directories, read owner originals or ask for secrets in chat. Public site configuration remains valid independently.

The default Playwright mode still uses3100/default `.next` and must not be run for006. The approved isolated mode requires an owned `.openai/app-session-<nonce>/project` public-input staging directory, byte/hash inventory, generated-output isolation and web55444 without server reuse. Installed Next writes `next-env.d.ts` independently of distDir, so distDir alone is insufficient. The actual staging probe rejected live cwd, changed staged bytes and output symlinks; it did not build Next or start a server. Preserve owner preview3000/t5q/default `.next` and all shared resources.

## Affected execution boundaries

Reuse generated consumer SHA `671e418f9c0fb261ee906147c8f7cbb5c27bfcb56343b90454c4793dafab0dc3` against canonical0.4 SHA `41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad`; do not regenerate it needlessly. Actual source checks so far: Node24.22.1 `--experimental-strip-types --test apps/web/tests/functional/app-session.test.ts` and `node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false`. Never run live `next typegen`, the default build/E2E command or a shared-cache rewrite. Production compilation must use the unchanged installed Next CLI from the staged project, not its copied package build script whose codegen relative path belongs to the live workspace. Secure synthetic runtime configuration is inherited only by trusted Node processes, never copied into staging or printed.

BE runs only the affected existing app-foundation/config/HTTP acceptance under its approved fresh fixture; it does not repeat unrelated release suites or shared55432 tests. Extend existing application/public tests instead of cloning a suite for each feature. Keep current meaningful visual/keyboard coverage, replacing only superseded preview-auth behavior assertions.

The [single resource lifecycle](plan.md#functional-and-real-e2e-validation-plan) assigns BE DB/Auth/mail/API and FE web/browser, with explicit readiness handoff and reverse cleanup. Owner preview3000/t5q and default `.next` remain reserved. Screenshots/results belong to the nonce output; cleanup uses recorded ownership, never process-name/port killing or shared-volume removal. FE must explicitly release web/browser before BE's owned API, forwarder and fixture teardown.

## Required observed journey

1. Enter synthetic admitted credentials in the real web login form; observe current AppMe identity from real Nest/DB and reload protected routes without fixture identity substitution.
2. Exercise expired access with actual provider refresh, current role/disable changes and signed-in/unadmitted handling. Preserve no-store response behavior and independently isolated users.
3. Use two tabs; delay refresh/read during logout and a new sign-in; verify no stale protected state restoration. Check cookie HttpOnly/Secure/SameSite/path/purpose behavior and absence of tokens in JS/storage/rendered content/URLs/logs.
4. Complete local-scope logout, then prove the old session is denied by real Nest while another independent session survives. Provider uncertainty remains explicit, not confirmed revocation.
5. Exercise generic invalid credentials, CSRF/Origin denial, malicious return paths, malformed cookies, missing technical key, dependency outages and disconnect. The main path must use real Auth/DB; synthetic fault peers are labelled separately.
6. Verify home/privacy, keyboard/focus/error announcements and1440/360/390 overflow/visual preservation. No host/cloud acceptance is inferred.

## Acceptance record and next gates

Record actual commands/exits, failed attempts, exact source/config/contract identity, screenshots, functional versus real E2E evidence and guarded owned-resource cleanup here.006 completes only when its whole journey and SC-001–SC-003 pass with the coordinator-owned scoped review. T015/T016 remain later gates.

### Incremental source/local evidence (chronological)

- FE security foundation: initial7 tests passed. Expanded handler/security suite first passed13/14 because the stale-generation test omitted required login fields and therefore correctly failed earlier input validation; the test was corrected to supply valid credentials before its generation fault. Corrected run14/14, zero failures/skips,150.029ms. These tests use labeled synthetic transports, not real Auth.
- FE typecheck: first exit2 identified the envelope generic record annotation and two heterogeneous header-test inference errors. Corrected source `tsc --noEmit --incremental false` exit0, no generated output. Later changes still require affected checks and the isolated production build.
- FE isolation smoke: actual Node24.22.1 copied70 explicit public inputs; rejected live cwd, stale staged bytes and an output symlink; original next-env/tsconfig/root dependency files/shared pointer/README/PROJECT_STATE stayed byte-identical; its owned probe directory was removed. No private/config file was copied. Next/Playwright isolated configuration now requires the approved nonce directory before execution.
- Current admission uses the raw asynchronous server Cookie header to retain duplicate-cookie detection; framework cookie maps would collapse duplicate names. RSC never refreshes or writes cookies. A current browser me check is required before revealing private content even after an admitted server guard, because cached RSC/history props cannot authorize restoration.
- Reference inspected at CSS viewport1440×1000 with light media: warm paper, dark sketch borders/shadows, restrained peach accents and readable application typography. The initial default-dark capture was not treated as the accepted light design. The owned reference tab was closed. Actual implementation screenshots at matching viewports remain pending.
- First isolated Next build exited1: blank HOME within the owned nonce tree made autodetection select a root that could not resolve installed `next/package.json`. Explicit isolated read-only dependency/tracing root fixed this without changing distDir/output ownership or upstream code. Corrected build passed, including full TypeScript. Failed source/manifest and later attempts are archived inside the same nonce tree; the original protected-file baseline is never overwritten.
- First real desktop smoke failed2/2: NextRequest normalizes literal-loopback `Request.url` to `localhost`, while the actual Host remains `127.0.0.1:55444`. An unnecessary computed-URL authorization check rejected valid context requests. Actual installed NextRequest construction reproduced this. The fix retains exact configured Host, Origin, Fetch Metadata and CSRF checks rather than accepting localhost configuration. Functional handler cases now use real NextRequest;14/14 passed. The browser alert assertion was scoped to main content to exclude Next's independent route announcer.
- Rebuilt corrected source, then real desktop sign-in/validation and profile/logout smoke passed2/2 in4.7s: actual Auth admission, current Nest identity, same-browser JWT registered privately, confirmed local logout→Nest401, independent same-user session still200. This is an earlier source increment, not final whole-feature acceptance.
- Expanded current functional suite:58/58, zero failures/skips,369.121958ms, using installed Node24 directly. Web ESLint exited0 with zero warnings; `.openai/**` is explicitly excluded so local/private/generated outputs are not traversed. Existing meaningful sample member-search tests remain unchanged.
- Cross-tab notifications invalidate and conceal; they do not themselves acknowledge admission. A changed tab offers explicit Check session. An unconfirmed logout remains concealed across visibility/pageshow until an explicit retry or new sign-in, preventing an older completion from automatically undoing logout intent. The added browser fault case uses a real still-active session behind an intentionally blocked logout request, not a fake JWT.
- Current source restage/build passed in6.47s with unchanged installed Next16.4.3/Node24, including full TypeScript. All six auth/me routes and protected/login pages are dynamic; home/privacy remain static. The full isolated application/public three-viewport run is in progress; no result is inferred from its launch.
- Independent managed-browser inspection of the actual production login: empty submit focused the invalid Email field, both field alerts were exposed, and enabled controls remained usable. At CSS390×844 and360×800, measured document scroll widths were390 and360 respectively; the password visibility control stacks at360 without clipping. Desktop1440×1000 retained the readable paper/sketch/peach treatment. The owned tab was closed.
- Reference mobile comparison was inspected at the same CSS390/360 widths in light mode. The upstream application's measured document width was845 at both sizes; that overflow is not a requirement to reproduce. Preserve its visual treatment while satisfying this project's explicit no-overflow requirement. Both reference captures were taken and the owned tab closed; authenticated local application screenshots are still pending.

The implemented runner is `node apps/web/scripts/app-session-run.mjs <operation>` with installed Node24. Operations are `stage`, explicit `restage`, `build`, `test` and `verify`; use the actual fixture-bound `APP_SESSION_E2E_RUN_ID`. Only build/test receive the approved local-only `APP_SESSION_FIXTURE_PATH`; test additionally receives the existing `PLAYWRIGHT_BROWSERS_PATH` so blank owned HOME cannot trigger a download. `test` forwards normal Playwright selectors and starts only55444 with no reuse; it never builds the live workspace. Source, inventory, realpath/output and protected-file checks bracket each owned command. Actual300s expiry/security fault cases run once on desktop; the main journey/layout/public regression projects remain1440/360/390.

### BE T003/T011 receipt and original browser lease

BE's scoped evidence is recorded in local-only `apps/api/.openai/006-be-support-07c03a861bb712e6d3676c4cf57fe936/evidence.json`, with the full34 preservation manifest beside it. FE read this receipt; it did not repeat BE checks. Final commands were the Node24 API workspace build (t60 exit0), compiled integration test with `--test-name-pattern='006 current-session support'` under the original nonce-guarded fixture (t61 exit0), and the fixture-owned private Unix-control smoke (t63 exit0).

- Focused actual GoTrue/Nest/owned-DB run:8/8,10622.442334ms. Same-JWT local logout denial, independent same-user session survival and old-refresh rejection; disable/reactivation and unadmitted/disabled denial; Owner demotion preserves Member current-me while removing Owner audit/settings capabilities; named DB503/Auth503/technical401 faults restore the same token to200; wrong nonce cannot mutate membership.
- Private control smoke:0700 directory/0600 file/socket ownership, no symlink, JSONv1,32-byte base64url key, four distinct owned identities, wrong-nonce400, issued/registered real-token replay200, actual API socket off/ECONNREFUSED and same-token200 after restore. All fault flags restored; actual provider JWT lifetime300s. No actual-expiry wait or FE browser claim was made by BE.
- Preserved failures: initial TS7022; absent default Docker socket before service startup; missing host55440 transport before the original bounded forwarder; body-less204 logout parsing and deliberate listener-restart ECONNRESET. Corrected test support accepts protocol204 and closes connections across deliberate restarts; no production adapter change or silent retry. These are not rewritten as first-pass success.
- Preservation:34/34 accepted hashes matched before edits;32 remain unchanged afterward. Only `apps/api/tests/app-fixture-lifecycle.ts` and `apps/api/tests/app-foundation.integration.test.ts` changed, final SHAs `6c172386fbcecc817560ec68f0e3f5e26f8a7f68cafb3f67e28757b86004b739` and `ba1d585cd805d515c4cfc128e059cfd615c1f0bbd1e8a74ec1e00a5e04cb0462`. Canonical remains41bc4c5f…;005 quickstart remains `c03eb4e281ca69c91ee3ceb486158fba5185ef0b92ec7d0ec322765d4865b230`.
- Focused case cleanup confirmed four owned identities removed. A distinct browser case is LIVE under FE's exclusive lease: nonce `742798c27bb3284654278d61b289b141`, DB55440/Auth55441/Mail55442/API55443, reserved FE55444; API support t62/PID55765 and bounded forwarder t5x/PID47138. The secure synthetic config path remains local-only; FE verified its0700/0600 realpath and field-name shape without printing values. BE will not reset/delete/stop/rebuild/change source during this browser lease.
- At this original receipt, final browser/resource cleanup, actual expiry/refresh and browser-visible credential/race checks were still pending. The subsequent integrated record below supplies the actual browser JWT replay and cleanup; a separate synthetic login does not substitute for that proof.

### Integrated acceptance and targeted corrections

The full isolated run executed93 cases at1440×1000,360×800 and390×844:81 passed,12 failed, exit1,436.25s. The genuine300s provider-expiry case passed in5.1 minutes: actual expired access, concurrent two-tab/SSR return, exactly one coordinated real refresh, unchanged current identity/capabilities, then actual refreshed-browser JWT denial after confirmed local logout. No fabricated expiry, shortened lifetime or fake JWT was used.

The12 failures were retained and resolved, not relabeled:

- Three viewport instances assumed initial document focus after client-side sign-in. The direct-entry/skip-link case now explicitly navigates to the protected document before testing its first Tab.
- Six public navigation instances hard-coded old3100 URLs despite correct navigation on55444. Existing assertions now resolve `/` against the project's baseURL; public source behavior was unchanged.
- Three synthetic delayed-response cases used Playwright `route.fetch`, whose intercepted headers lacked Chromium Fetch Metadata. BFF correctly returned403 before provider work. A diagnostic rerun with full captured headers proved `fetchSite=absent`; the test-only transport now verifies both request and frame are the owned origin before supplying missing same-origin metadata. Production CSRF/Host/Origin checks were not relaxed.

The13-case corrective selection passed10 and failed only those three diagnosed injection cases, exit1,12.2s. After the test-transport correction, the three remaining real-response race cases passed3/3, exit0,6.6s: dropped logout acknowledgement remains unconfirmed although the same JWT is actually revoked; delayed old me cannot restore either logged-out tab while an independent user survives; and late real refresh cookies cannot adopt a newer sign-in generation. Thus all93 distinct scenarios have passing evidence across corrected runs. The passing five-minute expiry case was not repeated after method-error/test-harness-only changes.

An additional actual GET to the POST-only logout route exposed Next's automatic405 with no JSON/cache metadata. All framework-supported methods now enter the fixed-operation guard; unsupported methods return405 `invalid_request`, Allow, request ID and the same private/no-store metadata without configuration/provider work or cookies. Real GET-logout and POST-me regression assertions passed in the corrective selection. Valid-operation behavior did not change.

Other passing integrated cases prove current role demotion/disable without waiting for expiry, generic invalid credentials and both unadmitted/disabled states, direct protected-route admission and unsafe-return rejection, actual DB/API/technical-key/Auth outages, expired/revoked refresh rejection, unsupported-browser messaging, and concealed unconfirmed logout across page return until an explicit successful retry. Actual browser-cookie tokens were compared only in trusted Node against DOM/URL/storage/BFF bodies/static JS; cookies were HttpOnly, bounded below3500 bytes and browser-session scoped. Same-browser opaque JWT replay and independent-session survival were exercised, not inferred from redirects.

Final affected functional check:16/16, zero failures/skips,170.566708ms after the method guard correction; the earlier complete existing functional set was58/58. Final ESLint exited0 with zero warnings. Final isolated Next16.4.3/Node24.22.1 production build exited0 in4.50s with full TypeScript. Final runner verification reported82 inputs, exact current-source/stage equality, nine protected inputs unchanged and no output symlinks.

Executed commands used the installed Node24 binary, not an install or live default build:

```text
node --experimental-strip-types --test apps/web/tests/site-config.test.ts apps/web/tests/functional/*.test.ts
node --experimental-strip-types --test apps/web/tests/functional/app-session.test.ts
(cwd apps/web) node ../../node_modules/.bin/eslint . --max-warnings=0
APP_SESSION_E2E_RUN_ID=<owned nonce> node apps/web/scripts/app-session-run.mjs restage
APP_SESSION_E2E_RUN_ID=<owned nonce> APP_SESSION_FIXTURE_PATH=<approved synthetic handoff> node apps/web/scripts/app-session-run.mjs build
APP_SESSION_E2E_RUN_ID=<owned nonce> APP_SESSION_FIXTURE_PATH=<approved synthetic handoff> PLAYWRIGHT_BROWSERS_PATH=<existing installed cache> node apps/web/scripts/app-session-run.mjs test tests/e2e/application.spec.ts tests/e2e/website.spec.ts
APP_SESSION_E2E_RUN_ID=<owned nonce> node apps/web/scripts/app-session-run.mjs verify
```

The two targeted test selectors are recorded verbatim in their receipts below. These are evidence of the completed grant, not permission to recreate the now-deleted fixture or run default3100/shared-output commands.

### Exact retained provenance and visual evidence

Local-only run root: `apps/web/.openai/app-session-742798c27bb3284654278d61b289b141/`.

| Receipt | Result | Source-manifest SHA256 |
|---|---|---|
| `test-1793721686785.json` | Original81/93, exit1 | `12a24dcd76c58d3a36ba56a966cdfb6e55a9d6e46ae978b7a5857eb10f6a51e3` |
| `test-1793721942339.json` | Targeted10/13, exit1 | `14b3b8aa7c8d6316426f8a59d29b181755743c68123fd43ba3a67f1a05fde006` |
| `test-1793722022256.json` | Remaining3/3, exit0 | `a1dcade4ede98e558bd6b95a207be6b37f6ecb9bf395117b1c29456dc9e7f09f` |

Final build receipt is `build-1793721993506.json`; current inventory is `source-manifest.json`. Comparing original/full and final82-input inventories found only six route exports, the handler method guard and three E2E files changed; no inputs removed. Client coordination, crypto, Auth/Nest transport, SSR guards and rendered UI bytes are unchanged from the actual-expiry/full visual run. Archived source/manifest/build/report attempts retain failures rather than overwriting them.

The twelve application/team/settings/login screenshots are retained under `attempts/1793721906718/project/test-results/session-run/application-current-applic-4c883-able-keyboard-mobile-layout-{desktop-chromium,mobile-chromium,mobile-390-chromium}/`. Authenticated application/Team/Settings captures were visually inspected at all three widths; real login was also inspected interactively at all three widths with accessible error/focus behavior. Actual current identity/workspace is shown in the header; sample bodies remain explicitly unconnected. Warm paper, readable application typography, sketch borders and restrained peach accents remain consistent with the observed reference. Mobile tables scroll within their own containers, not the document; keyboard,200% text/reduced-motion and public-route checks passed. This is not pixel-perfect fidelity or owner visual approval.

`protected-before.json` records the nine preserved hashes, including owner `next-env.d.ts` `0f70629890b72a0a82e91972cc032c04b658b26c265373cb711cf576bfbf8fcc`, canonical0.4 `41bc4c5f…`, generated consumer `671e418f…`, live tsconfig, root package/lock, shared pointer, README and PROJECT_STATE. No command wrote live default `.next`; owner preview stayed running. No Git/index action, root dependency/ignore edit, BE production change or007–009 implementation occurred.

### Guarded resource cleanup and review stop

Before explicit FE_BROWSER_RELEASED, FE verified55444 refused connection, owner3000 accepted connection, all owned fixture faults were false, API was listening and administrative disconnect count was0. Managed tabs and Playwright contexts/server were closed. No further FE Auth/fixture calls followed release.

BE's read receipt `apps/api/.openai/006-be-support-07c03a861bb712e6d3676c4cf57fe936/cleanup.json` confirms exact nonce/hash/process/UDS checks, API55765 termination/t62 exit0 CLEANED, original forwarder stop/t5x exit0, then original fixture stop exit0. Browser registry receipt019 confirms all four registered identities removed with no failures. Private synthetic configuration/socket and owned scratch were removed. No owned Docker containers/networks/volumes remain; all26 volume names and24 other container IDs/names were unchanged, including both protected DB volumes. All34 current BE support-snapshot hashes still matched.

BE's mixed-selector lsof exited1 and observed owner3000 PID66743 and54322 OrbStack27478, with no55440–55444 listener listed. This is metadata preservation, not a fresh shared-service health test. FE retained only its nonce-confined public-source/output/evidence archives; no shared service, volume, owner preview or owner file was removed.

T001–T014 are ready for the coordinator's one scoped T015 review. No reviewer was started by FE and no independent implementation review is claimed. T016/whole-feature closeout, hosted HTTPS/Secure-cookie runtime proof, other browser-engine verification, owner setup/acceptance and publication remain separate gates. STOP WRITES.



007/008/009 consume the frozen006 interface after its integrated acceptance. Actual first owner/workspace, sender/callback configuration, retention policy, real Auth privileges including definer ownership/non-NULL timebox behavior, and publication/hosted acceptance remain separately approved gates inherited from005. Production schema-changing delivery is owned solely by [001's prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only); this guide neither copies nor executes it.

### T015 P2 focused correction — current increment

Coordinator t4x reported sole reviewer t65, requested `gpt-6-luna`, REVIEW_MODEL_READY and verified UI label, with one confirmed P2: the revoked refresh cookie survived definitive401, so the initial one-page regression passed while reload/direct navigation repeated that invalid grant. Server-side failed-refresh cookie clearing was explicitly rejected. Contract/plan were aligned before code.

The client now handles definitive refresh401 inside its existing Web Lock: retain the same epoch, reread context, require matching generation, acknowledge existing begin with current CSRF/generation, then show signed out. Changed generation requires explicit checking; stale epochs retain their newer intent.503/unknown failures and failed refresh responses do not write cookies. No BFF/server/Auth API or schema was changed.

Focused functional evidence:21/21, zero failures/skips,188.020041ms. Five added cases execute the actual SessionController with native Node24 Web Locks/BroadcastChannel, existing handlers and real encrypted cookie state; only provider replies are synthetic. They prove cleanup survives controller recreation without another grant,503 preserves cookies/no begin, a newer generation is untouched, and invalidation both during refresh and during the context reread prevents cleanup. No wall-clock sleeps or source-text assertions.

Fresh lifecycle agreement was acknowledged before startup. New nonce `f77d6126f4f35270973c782c9c468d21` owns strict55440–55444; original guarded drivers and unchanged compiled support supplied a new0700/0600 synthetic handoff. API t68/PID18681 and forwarder t67/PID18478; four fresh identities, TTL300s unchanged. t4q temporarily paused010 and performs no BE source/build/suite. Original deleted fixture/evidence is not adopted. Readiness receipt: `apps/api/.openai/006-be-support-07c03a861bb712e6d3676c4cf57fe936/p2-support.json`.

First isolated build failed on a test-adapter type mismatch: standard RequestInit permits null signal while NextRequest requires undefined. Normalizing that test signal fixed full TypeScript without suppression or production changes. The failed source/manifest remains archived in the fresh run. Corrected production build exited0 in3.99s; ESLint exited0. Focused production browser results follow; the passing five-minute expiry and full93 suite were not rerun.

Corrected-source verification:

- Five actual-controller regressions reran after the test typing correction:5/5, zero failures/skips,118.01025ms. Final ESLint exited0. No unrelated functional/full browser suite was repeated.
- Focused production browser selection passed5/5 in11.8s, exit0. The real revoked provider session was replayed as encrypted browser cookies; one failed refresh caused acknowledged begin, removed the session cookie, and reload plus direct `/application`, `/settings`, `/settings/team` visits did not increase refresh count beyond1.
- A delayed real refresh401 had no Set-Cookie. Synthetic out-of-protocol delivery of an independently admitted real Member cookie generation was preserved byte-for-byte; no begin occurred, explicit Check session admitted that Member, and reload retained the same Member.
- Real Auth pause plus a clearly labeled synthetic expired-me401 triggered the actual refresh503 path without waiting300s. Cookies remained unchanged, no begin or retry occurred, private UI stayed hidden, and explicit checking after restored Auth admitted the original user. The synthetic me fault is not claimed as another natural-expiry proof.
- Existing actual profile/local-logout/independent-session and delayed successful real refresh cases also passed as affected neighbors.

The exact command selection is recorded in `apps/web/.openai/app-session-f77d6126f4f35270973c782c9c468d21/test-1793724843830.json`: `test --project desktop-chromium --grep 'revoked refresh and|late definitive refresh401|transient refresh503|current profile menu|synthetic late real refresh'`, with the approved fresh nonce/handoff and installed browser cache. Build receipt: `build-1793724825388.json`. Final source-manifest SHA256: `3bb9f709c8a1afb377e6851d525509093e50a52567f456801b5c1996fd0fe324`;82 current/staged inputs match, nine protected hashes remain unchanged, no output symlinks.

Compared with the original handoff input inventory, only these four source/test files changed; none were removed:

| Path under `apps/web/` | SHA256 |
|---|---|
| `src/features/app-session/session-controller.ts` | `6dd329971b27252eb2fe7befaa8cb3aafa9a384482f6258ad663591d6450647a` |
| `tests/functional/app-session.test.ts` | `bb392dd8a6acec95ed9c962382382683f312f29cfc25b406fee41c30ff5793a6` |
| `tests/e2e/app-session-fixture.ts` | `a5e80e22a07783e60fee7a2387bf00a13d3a19927d2291a6ef6a14c292c37ef7` |
| `tests/e2e/application.spec.ts` | `98bbfd8f423c0a6ac8753f0385a96c95efe041f6e707d4992848f68e781294c9` |

The real signed-out desktop screenshot was visually inspected at1440×1000: `project/test-results/session-run/application-revoked-refres-ee70a-ad-and-protected-navigation-desktop-chromium/definitive-refresh-signed-out.png` under that fresh run. It shows the enabled empty sign-in form without private content after reload/direct-route checks. No layout/style change or new mobile/other-engine/hosted acceptance is claimed.

Before fresh FE_BROWSER_RELEASED, FE observed55444 closed, owner3000 accepting connections, API18681 listening, all fixture faults false and adminDisconnects0. Playwright/browser work finished and no further FE Auth/fixture call followed release.

BE's read receipt `apps/api/.openai/006-be-support-07c03a861bb712e6d3676c4cf57fe936/p2-cleanup.json` confirms verified API/control termination/t68 exit0 CLEANED, original run-bound forwarder stop/t67 exit0, then original guarded fixture stop exit0. All four registered identities were removed with no failures; scratch/private config/socket are gone, with zero owned containers/networks/volumes. Exact26 volume names and24 other container identities were preserved;34 source-snapshot hashes and nine paused010 document hashes remained unchanged. Metadata still listed owner3000 node66743 and54322 OrbStack27478, with no55440–55444 listener; mixed-selector lsof exit1 is recorded, not presented as shared-service health proof.

At the correction handoff, coordinator inspection was still pending and T015/T016 remained open. The acceptance below supersedes that state; the original ONE-review/one-P2 history and all failed-run evidence remain unchanged.

### T015 accepted scoped review

Coordinator t4x accepted the correction after read-only inspection of `session-controller.ts:126–143`, the actual functional/E2E assertions and receipts. It independently confirmed82/82 current input hashes against final manifest `3bb9f709c8a1afb377e6851d525509093e50a52567f456801b5c1996fd0fe324` and exactly four changed source/test inputs. The coordinator reviewed the5/5 actual browser exit0 receipt, retained21/21 plus final5/5 functional/build/TypeScript/lint evidence and BE's fresh guarded-cleanup confirmation. It performed no second review, tests/builds or resource startup. Original ONE Luna review remains one P2, now fixed; no unresolved confirmed finding remains in that scoped review.

### T016 frozen local interface handoff

SC-001–SC-003 are closed for the authorized **local** journey: actual browser login through Supabase Auth/BFF/Nest/current DB membership, protected direct routes, natural300s expiry/refresh, local logout and same-browser JWT denial, independent sessions, boundary/outage/race cases, credential isolation and the recorded keyboard/mobile/public checks. The original93 scenarios passed across corrected runs, not a final93/93 run; the accepted P2 adds focused5/5 browser evidence without rerunning natural expiry or the full suite.

The existing [session/BFF contract](contracts/session-bff.md) is the frozen shared baseline, not a new schema or authorization to implement dependent features:

| Shared interface | Required handoff invariant |
|---|---|
| `GET /api/auth/context`; `POST /api/auth/begin`, `/login`, `/refresh`, `/logout`; `GET /api/app/me` | Fixed enumerated operations, strict same-origin/CSRF/body boundaries, private/no-store responses, no arbitrary proxy or browser token fields. |
| Server-only Auth/Nest callers and generated AppMe | Canonical0.4/generated consumer remain unchanged; reconstruct technical Authorization and user `X-App-Access-Token` only on the server. Nest remains current session/membership authority. No copied DTO, browser SDK or metadata-derived role. |
| AES-GCM session/context cookies | Preserve purpose/origin/name binding, HttpOnly attributes, size limits and matching generation. Failed/stale refresh stays cookieless; definitive401 cleanup uses same-epoch/generation locked begin.503/uncertain failures never clear a newer session. |
| SessionController / SessionProvider / `useAppSession` | Reuse existing sign-in, sign-out and explicit revalidation transitions under the origin-wide Web Lock. Broadcast only invalidation/generation notices; conceal stale state and require current admission before display. No parallel session store/protocol. |
| Server admission and return paths | RSC/current-me never refresh or write cookies. Keep `/application`, `/settings`, `/settings/team` allowlisted; public pages remain independent. Team/Settings bodies are still explicitly sample content, not007/008 operations. |
|007/008/009 extensions | Add only each separately authorized feature's exact operation/UX bindings through coordinated file ownership. Existing invitation/recovery challenge sections remain planning, not implemented endpoints or006 delivery claims. |

Remaining separate gates: production SMTP/sender/setup and dependent email flows; hosted006 HTTPS/Secure-cookie runtime and Auth/BFF/Nest/DB acceptance; other browser engines; owner visual acceptance of006 behavior;001's existing hosted versioned-migration delivery; and explicit Git/publication/deployment authorization. Existing BE hosted PASS and completed owner setup are not invalidated or automatically repeated. Local fixtures were removed; any future runtime check needs a fresh authorized lifecycle.

This closeout changes only existing006 documents and the newly leased additive README/PROJECT_STATE sections. [README owns canonical local commands](../../README.md#feature006-canonical-local-commands); [PROJECT_STATE owns current006 progress](../../PROJECT_STATE.md#current-feature006--local-journey-complete). Runtime source/manifests and historical protected-hash receipts are retained unchanged. The newly authorized README/PROJECT_STATE additions postdate those receipts; do not rewrite old baselines or rerun old verification to claim the two documents never changed.

### Docs-only preservation and shared-lease handback

The fresh t4v NO-INFLIGHT receipt made FE the sole writer for the narrow006 README/PROJECT_STATE additions. Byte-for-byte checks confirmed the entire original content of both files remains an unchanged prefix; only the new006 sections were appended. Thus all pre-existing BE001/005/010/hosted/automation/history and concurrent baseline bytes are preserved.

| Shared file | Original bytes preserved | Appended bytes | Original SHA256 | Closeout SHA256 |
|---|---:|---:|---|---|
| `README.md` |68970|5695|`b5fe19fe3055b137ce1eac8d0a4efcad4362669409b99b5ed23c6c461b6e8897`|`a420c86a84732962d5cf2239ca477c8c3a3b22414683616a047cee5981793d05`|
| `PROJECT_STATE.md` |104356|4213|`348455fb56458ed4620f5385c670231172eefcf72d247cc252f7828ad49004b7`|`5b0d851e275125873a0b0c60bf3f725e8ab2aa130ce586ab5ca861f59746ac7c`|

Bounded documentation consistency found T001–T016 each checked exactly once and all four new command/state/acceptance/handoff navigation headings present. Only existing006 plan/tasks/quickstart and additive README/PROJECT_STATE content changed in this closeout; the contract/source/tests/artifacts were not edited. No behavioral test/build/install/runtime/reviewer/Git/resource or provider operation was rerun.

This preservation receipt accompanies explicit shared-document lease return directly to t4v with t4x copied. No shared-document writes are permitted after that return.006 is locally complete, not hosted/owner/publication accepted. STOP WRITES / NO INFLIGHT.

