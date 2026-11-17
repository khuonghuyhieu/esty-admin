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


## Persistent navigation increment — local execution evidence, 2026-11-17

This record is separate from the accepted T001–T016 history. Owner START authorizes only the dedicated FE worktree at `fix/fe-persistent-navigation`, base `a9b3d70ceff042b893fa06877eca197d3d31c06c`, `apps/web/**` and006 increment documentation. No shared README/PROJECT_STATE, API-source, Git/publication or hosted operation is included. The assigned reviewer is coordinator-created `t153`; review has not started at this intermediate record.

### Reproduction and isolated setup

- Actual unchanged production UI with fresh synthetic Auth/BFF/canonical Nest/current DB: Dashboard→Settings returned `headerRetained:false`, `sidebarRetained:false`, `checkingObserved:2`. The browser MutationObserver watched the full-page checking state; the observed mechanism matches separate page providers/shells.
- Public Node24.22.1 and exact-lock `npm ci --ignore-scripts --no-audit --no-fund` were used in the disposable task worktree with empty HOME/config/cache. Root package/lock hashes remain unchanged; no MAIN dependencies or owner auth/environment inputs were copied. The initial npm command refused duplicate global/user `/dev/null`; a separate empty global config corrected it. ESLint's upstream deprecated-version warning was retained without an upgrade.
- The unchanged fixture driver correctly refused the already-existing `esty005-auth-fixture` project. It did not adopt/stop it. A public staging-only adaptation changes the normal profile's project/prefix to `esty-fe-nav-xjqt9o64`, retaining strict55440–55444, nonce ownership, pinned images and all guards. Source/adapted hashes are in `apps/web/.openai/navigation-runtime/fixture-provenance.json`; API source stays unchanged.
- Fresh run `bc04dd03ea1280fdbc6faa22f676a3da` owns `/private/tmp/esty-fe-nav-xjqt9o64-QwPBbl`; canonical Nest/support/bootstrap are compiled into task-owned output. Wrong root jose resolution and an overwritten staged profile initially refused startup; exact API-workspace dependency resolution and the unique profile corrected these before the real support became READY. No synthetic caller substitutes for the main Auth/Nest/DB path.
- A fresh worktree has no ignored `.specify/feature.json`. The runner now records/preserves its absence rather than creating a pointer. Initial stage/build missing-path refusals remain failures; the corrected unchanged production baseline then built successfully.

### Implemented behavior and first affected checks

Shared `(protected)` layout keeps one controller and shell; individual pages retain server admission and render content-only boundaries. The only new receipt fields are allowlisted path, generation, restore and safe outcome. Every route additionally checks current context/me under the existing lock, including cached history; server forbidden/unavailable cannot be ignored by an old ready shell. Authentication and route epochs independently reject late results. Main-only loading retains admitted chrome, while actual invalidation conceals private identity/content. Public/login routes, API contracts, credentials/CSRF/no-store, refresh/logout coordination, sample notices and styles remain unchanged.

- Affected functional run: **39/39**, zero failures/skips, Node24.22.1. Command: `node --experimental-strip-types --test apps/web/tests/functional/app-session.test.ts apps/web/tests/functional/workspace-foundation.test.ts apps/web/tests/functional/application-table.test.ts`. Added cases cover current route reads without checking flashes, server denial/unavailable, late route errors, logout fencing and mismatched-generation preservation.
- Initial web ESLint: exit0, zero warnings. First changed-source production build: exit0 including full TypeScript; no suppression or dependency change.
- First focused real browser run: **2/5 passed, 3 failed**. Real server membership denial/API outage and delayed RSC after actual logout passed. Desktop history remained pending because history invalidation followed framework restoration and tracked only the initial path; mobile assertions incorrectly searched for a visible closed-drawer navigation. The fix tracks current path and handles history in capture phase before restoration; mobile checks inspect retained sidebar active state while independently asserting drawer closure/focus.
- Corrected production build: exit0 including TypeScript. Only the three failed viewport cases reran: **3/3 passed** at1440×1000,360×800,390×844. Dashboard→Settings→Team→Dashboard, delayed main loading, back/forward, active links, mobile trigger focus, no overflow, credential isolation and stable exact header/sidebar DOM/controller count passed. Every run retains its failures and source manifest.

Run root: `apps/web/.openai/app-session-bc04dd03ea1280fdbc6faa22f676a3da/`. Build/test receipts: `build-1794883716923.json` (baseline), `build-1794884305470.json`, `test-1794884364909.json` (2/5), `build-1794884501932.json`, `test-1794884519154.json` (3/3). `attempts/` retains prior source/output trees. `navigation-pass-evidence/` preserves the passing three-viewport report/screenshots before later affected checks.

Desktop dashboard,360 dashboard and390 Settings screenshots were visually inspected. Paper/ink/peach, readable sans-serif, existing sketch borders and truthful sample notices remain. Read-only reference captures at matching1440/390/360 widths were inspected; upstream390 document width845 is not copied. No redesign, new product feature or hosted visual acceptance is claimed.

### Final navigation checks and frozen handoff

The affected neighbor run executed26 cases: **24 passed, 2 failed** (`test-1794884922284.json`). It passed actual300s expiry with one real refresh across two tabs/SSR, current identity preservation and confirmed same-session logout denial; direct routes, keyboard/mobile drawer/search/layout, revoked-refresh no-repeat, independent contexts and late-response cases also passed. This was not a full-suite run.

The two failures were corrected without weakening admission:

- An automatic page-return revalidation suppressed by unconfirmed logout still called `router.refresh()`, allowing a late server redirect to replace the eventual logout confirmation. Revalidation now returns a same-auth/route-epoch successful-admission result; only that result refreshes server content. Suppressed/failed/stale revalidation cannot navigate or overwrite logout intent.
- The labeled transient-refresh test reloaded during a real Auth outage. The new server denial correctly preempted its synthetic expired-me response, so no refresh occurred. It now triggers the actual mounted-controller page-return path, retaining the real Auth503, unchanged cookies, zero begin/cleanup/retry and subsequent explicit recovery assertions. Server-outage denial has separate actual-route coverage.

Final affected controller run: **30/30**, zero failures/skips. Final production build `build-1794885010068.json`: exit0 including full TypeScript. Explicit staged `tsc --noEmit --incremental false` passed before the final narrow return-value correction; the final build rechecked the corrected types. Canonical `(cwd apps/web) eslint . --max-warnings=0` passed after that correction. A root-cwd ESLint invocation emitted a pages-directory diagnostic despite exit0; the canonical cwd result, not that invocation, is the clean lint evidence.

Final corrected browser selection: **9/9**, zero failures/skips,35.8s (`test-1794885046479.json`). It includes both corrected failures, three-viewport persistent navigation/history/loading, real server denial/outage, delayed protected payload after actual logout, delayed cross-tab read and newer-generation refresh401. Across the scoped runs, all31 distinct selected browser scenarios have passing evidence; **not** a single final31/31/full-suite result. The already-passing natural300s case was not repeated after the narrow completion-result guard/test-trigger correction.

Final90-input manifest SHA256: `d52aadc43f2733c05ed89986cd2e94e1bb01c0a5acbe6161aabd6f493510370e`. Runner verification confirmed90/90 current/staged inputs, all nine protected inputs (including absent pointer) and no output symlinks. The freeze receipt also includes the pre-baseline runner adaptation and current006 documentation; old route files are removed, not compatibility aliases.

Final managed-browser smoke observed actual Settings at390 with scrollWidth390 and focus returned to Open sidebar, Team at360 with scrollWidth360, desktop Dashboard and confirmed local logout. An initial repeated sign-in action timed out after the managed synthetic context had already reached Application; explicit emulation/current-page inspection recovered without a source change. Its diagnostics recorded three canceled RSC requests (`ERR_ABORTED`), not a zero-network-error claim; no JavaScript exception was reported by the final diagnostic capture. Durable automated screenshots/transition attachments are in the final run and `navigation-pass-evidence`; retained failure/neighbor evidence remains in `attempts/` and `session-neighbors-evidence/`.

Cleanup before freeze: all owned fixture fault flags false, API listening before stop, adminDisconnects0; managed tabs closed and final synthetic session signed out. Owned web stopped, canonical support exited0 after cleanup, run-bound forwarder stopped by its nonce control socket, and the guarded unique fixture stop exited0. Private fixture directory is absent; all55440–55444 ports were successfully rebound on loopback; zero containers/networks retain `com.docker.compose.project=esty-fe-nav-xjqt9o64`. Throwaway launchers were removed. Old fixture project, shared54322/55432/volumes, owner accounts and production remain outside the lifecycle.

**READY_FOR_FE_NAVIGATION_REVIEW — STOP WRITES / NO INFLIGHT.** Exact manifest/checks are frozen in local-only `apps/web/.openai/navigation-frozen.json`. Only assigned company Codex `t153` receives the scoped review; no reviewer/worker was created here. T022 remains open until confirmed findings are fixed/rechecked and fix-only inspection is accepted. Hosted/other-engine/owner adoption and Git/publication/deployment remain separate gates.

### T022 scoped review correction

Assigned company Codex `t153` (`gpt-6-luna`, medium) performed one read-only pass and reported one P2: a known server `forbidden`/`unavailable` receipt left previous ready identity/actions visible while client context verification was pending. No other actionable finding was reported; the original review is **not** a no-findings review.

The existing two denial regressions were strengthened with a held context response. Before the correction, **0/2 passed**, both observing `ready` instead of denial. The controller now synchronously conceals only a matching admitted generation, increments the route epoch to fence older work, and leaves a newer admitted generation untouched. The boundary consumes that denial in a layout effect before paint; initial-mount chrome is already hidden. Normal admitted navigation remains main-only pending. The async admission path repeats the same guarded concealment before waiting on the lock/context; no credentials or new authorization cache are introduced.

Post-fix controller checks: **30/30**. The old-generation case additionally proves an old denial cannot conceal a newly admitted generation. Canonical web lint passed after the final test change. The actual-browser denial scenario now holds the real `/api/auth/context` response and asserts private identity/actions/body are absent before release, for both actual membership disablement and API outage. Retained screenshots `membership-denial-context-held.png` and `api-outage-context-held.png` were visually inspected: only the safe session gate is present.

Fresh fix-only lifecycle: `apps/web/.openai/app-session-856c3fe98e86cb8f7c9d1d84d4530bca/`. First affected browser run: **4/5 passed** (`test-1794885907490.json`), including all1440/360/390 persistent-navigation journeys and delayed payload/logout. The remaining failure was interception teardown racing an already released response (`Route is already handled`), not a concealment assertion. The test now waits for its released handlers with `unrouteAll({ behavior: "wait" })`. Only that failed scenario was rerun: **1/1 passed**,5.4s (`test-1794885969302.json`), including recovery. Both production builds passed; latest `build-1794885963385.json` includes TypeScript. No unrelated broad or300s rerun.

Final fix90-input manifest SHA256: `623e46bf77f1f23fcaa0660a25656f581e7f3e27f13e181ea2c7075f61dab6d9`. Runner verification again confirmed current/staged equality, nine protected inputs unchanged and no output symlinks. This supersedes the pre-review source identity, not its historical evidence. A forwarder invocation omitted its explicit startup flag and refused safely; the subsequent authorized invocation used the flag. All runtime credentials remained fresh synthetic, loopback-only and task-owned.

Fix-only cleanup completed: pre-stop API listening, all fault flags false, adminDisconnects0; support exited0, run-bound forwarder and guarded fixture stop exited0. Private fixture directory removed, zero owned-project containers/networks and all55440–55444 loopback ports released. The throwaway support launcher was removed. **FROZEN FIX-ONLY REVIEW — STOP WRITES / NO INFLIGHT**; `apps/web/.openai/navigation-fix-frozen.json` carries exact post-fix paths/hashes/checks for `t153`.

### Reviewed local handback

Assigned company Codex `t153`, runtime `gpt-6-luna` medium, accepted the fix-only inspection after verifying all seven changed-since-review path hashes against `navigation-fix-frozen.json`. It confirmed pre-paint same-generation denial concealment, route-epoch advancement before context waits, newer-generation/explicit-check/logout fences and the held-context regressions. **No remaining actionable finding in that fix-only scope.** The reviewer ran no tests/builds and performed no second broad review. The original one-P2 review and all failed runs remain recorded above.

T017–T022 local implementation/checks/review are complete. Only this docs-only acceptance record, plan/task status and local final handback receipt changed after review; reviewed source/test hashes remain frozen. `apps/web/.openai/navigation-accepted.json` identifies the final23 changed/deleted paths, reviewed source manifest and evidence. Source/write ownership is returned to main coordinator `t12p`; **STOP WRITES / NO INFLIGHT**. Retained local-only build/test/failure/screenshots/provenance and public Node/dependency artifacts are evidence, not publication. No new worker/reviewer, Git mutation, hosted check, owner credential/auth-store access, provider deployment, remote migration or shared fixture cleanup occurred. Root README/PROJECT_STATE remain unchanged because this worktree had no shared-doc lease.

Remaining gates are owner adoption/hosted acceptance and any separately authorized Git/production action; this handback neither performs nor approves them.


## Planned performance repair validation — 2026-11-17

**Not executed.** T023–T028 use the existing006 isolated production build/fixture/browser commands documented above, with source and output paths bound to the new task worktree. Do not reuse disposed identities, owner credentials, old run IDs or shared build/DB resources.

Record a matched before/after report containing source revision/build, viewport, cold/warm state, explicit CPU/network/synthetic-delay settings, request paths/counts/timings without secrets, server current-me count, click→destination-ready median across five warm samples, layout-shift sources and maximum CLS session window, loading visibility/geometry, shell/controller identity and profiler commit summaries. Attach trace/filmstrip from synthetic identities only. Target and security scenarios are defined once in [the performance repair plan](plan.md#navigation-performance-repair-plan--2026-11-17). Do not invent unsupported CLI flags; extend existing tests and document the actual final commands/results during implementation.

Anonymous hosted baseline from the earlier audit: desktop login CLS0.003095/LCP1128ms and mobile login CLS0.015286/LCP1016ms; anonymous `/application` redirected to login. Those observations do not measure admitted navigation or explain the owner's CLS0.60. Hosted signed-in metrics require owner-controlled verification after release, with no credential disclosure or silent account mutation.

## Navigation performance execution evidence

Owner START: T023–T028 only, `fix/fe-navigation-performance`, base `c6d7a17bb9505d824d683667690fa0450a2337f5`; sole FE writer `t15n`, preassigned company Codex `gpt-6-luna` medium reviewer `t15p`. The preceding planned procedure and T001–T022 evidence are historical, not the current execution status. No root/shared docs, API/canonical/migrations, dependency versions/lock, owner credentials, Git publication or hosted operations were changed.

### Pre-review matched normal-production measurements

Fresh synthetic actual Auth→BFF→Nest→owned DB, Node24.22.1 and full Playwright Chromium; CPU throttle1, deviceScale1, loopback network. Five warmed transitions per condition: Settings→Team→Dashboard→Settings→Team, after separate route/JS warm-up. Cold login/admission, then history/back/forward/reload were recorded separately. The150ms condition delays each backend me dispatch, including the baseline RSC lookup, and browser context GET by150ms. It does not replace authorization responses. Request/body headers and credentials are not recorded.

| Viewport | Baseline ordinary median | Final ordinary median | Baseline150ms-stage median | Final150ms-stage median | Delayed improvement | Backend me per ordinary navigation |
|---|---:|---:|---:|---:|---:|---|
|1440×900|397.46ms|210.64ms|700.31ms|395.84ms|43.48%|2→1|
|390×844|428.14ms|290.83ms|783.54ms|412.53ms|47.35%|2→1|

All20 final measured transitions have exactly one browser me, one backend me, and zero refresh requests. Context and me overlap inside the existing lock; RSC preparation overlaps that operation. Timing above includes Playwright click/action completion and mobile drawer opening. A separate in-browser click→first-ready-frame capture measured all10 actual transitions at50.9–84.5ms, with no indicator; it does not replace the matched latency denominator.

PerformanceObserver was installed before hydration, retains all raw shift entries/source rectangles and applies standard maximum CLS session windows (1s gap/5s cap, excluding recent-input shifts only from the score). Baseline/pre-review ordinary-document maxima including cold login/admission: desktop0→0.000180094; mobile1.026509197→0.000431311. The `historyReload` row is captured after reload and records0; it does not preserve the pre-reload history shifts. The T028 measurements below record held-history windows separately. No horizontal overflow. Baseline sources include login feedback movement, disappearing full-viewport text and pre-React-identity shell geometry. The desktop result is small, not an invented zero. Both ordinary maxima meet0.10; the owner's independent hosted0.60 is not declared fixed.

Normal production artifacts and safe raw evidence:

- Run root: `apps/web/.openai/app-session-b0ca8995191a01413575ab6cda34eeda/`.
- Baseline build: `build-1794891124273.json`; final build: `build-1794893007572.json`.
- Measurement root: `apps/web/.openai/performance-runtime/`; `baseline3/metrics.json` and `after-final/metrics.json` are the pre-review matched pair. `after-b2` remains an earlier passing candidate. Before/0/100/200/400/700ms screenshots accompany the measurements. The post-review corrected source is measured separately below.
- `transition-frames.json` retains per-frame elapsed time, URL/title/body association, main height, pending/inert and indicator visibility. `backend-me.jsonl` records only dispatch duration/status/delay; per-transition backend/browser slices are embedded in metrics.
- Final1440/360/390 E2E screenshots remain under the run's `project/test-results/session-run/`; final pending Dashboard, narrow Settings/login and desktop/mobile filmstrips were visually inspected. Existing paper/ink/peach, readable typography and truthful samples remain; no redesign or reference-overflow adoption.

### Profiler and state decision

Separate public snapshot builds used the supported `next build --profile` option with named React Profiler wrappers around shell, desktop sidebar and main. Only task-copy instrumentation and explicit dependency-root resolution differ; `profiler-provenance.json` records input/instrumented hashes. These are not normal-production latency builds.

Dashboard→Settings commits: shell6→4, sidebar4→2, main6→4; total actual subtree duration2.2→1.7ms,0.4→0.1ms,1.5→1.5ms respectively. One diagnostic capture is not a precise CPU benchmark. Actual logout/invalidation still updates shell/main3→4 and sidebar2→2; no security render is suppressed. `profile-before-results.json` and `profile-after-results.json` retain callback events. Initial minified DevTools7→5 commit records remain but are not used as named consumer timing proof. No speculative context split/memoization was justified; visual timer state stays component-local and its navigation key resets pending lifetime.

### Functional, browser and failure evidence

- Affected functional command: `node --experimental-strip-types --test apps/web/tests/functional/app-session.test.ts apps/web/tests/functional/workspace-foundation.test.ts apps/web/tests/functional/application-table.test.ts` — **44/44 passed**, zero skips/failures. Five additional controller cases cover concurrent reads/in-flight dedup/fresh next intent,401/403/503 concealment while context is held, and completed-intent fencing after logout/new generation.
- Final explicit staged `tsc --noEmit --incremental false`: exit0. Final canonical web-cwd `eslint .`: exit0, no warnings. Final ordinary production build above: exit0 including TypeScript.
- Initial focused production browser selection: **6/7 passed** (`test-1794892088714.json`). Persistent navigation/history at all three viewports, actual membership denial/API outage before held-context release, delayed RSC after actual logout and rapid destination changes passed. The new sample-RSC assertion failed only because Next's route-announcer also matched an unscoped alert locator. It was scoped to main; the subsequent real disabled-member RSC/direct-denial check passed.
- Security neighbors: **14/15 passed**,5.5m (`test-1794892933131.json`). Includes actual300s Auth expiry with one coordinated refresh across two tabs/SSR, confirmed same-session logout replay denial, current role/disable, actual DB/API/technical faults, private cookies/boundary rejection, cross-tab and late refresh/new begin, late definitive401, transient503, unconfirmed logout, RSC privacy and150ms timing. The revoked-refresh replay test found that cleanup removed cookies/admission but no longer returned the protected URL to login after removing server me. The provider now redirects only definitive signed-out errors after cleanup, retaining explicit logout outcomes. The existing URL/no-repeat assertion was not weakened.
- Corrected final browser selection: **9/9 passed**,14.7s (`test-1794893043706.json`): revoked-refresh cleanup/reload/all protected routes; persistent navigation/history and readable layout at1440/360/390; rapid destinations;149/150ms timer threshold, new-intent reset and fast completion cancellation. Real Auth/BFF/Nest remain active in the timer test; only browser time/RSC release is controlled. Already-passing300s/security neighbors were not needlessly repeated after that narrow correction. This is not a final full-suite result.

Actual commands used the existing runner with `APP_SESSION_E2E_RUN_ID=b0ca8995191a01413575ab6cda34eeda`, the fresh0600 synthetic `APP_SESSION_FIXTURE_PATH`, task-local `PLAYWRIGHT_BROWSERS_PATH`, and the pinned task Node executable: `app-session-run.mjs restage`, `build`, `test --grep <focused titles>` (security neighbors additionally `--project desktop-chromium`), then `verify`. The referenced build/test JSON receipts retain exact argv/source-manifest hash/exit status. The disposed nonce/fixture is evidence, not reusable setup. Root README was outside this task's write authority.

Other retained failures/limits: initial public fixture staging lacked a public config/canonical input; default Docker socket was unavailable until the explicit existing OrbStack socket was selected. Two headless-shell measurement attempts timed out; full Chromium completed unchanged baseline and is now selected only in session E2E mode. One candidate measurement refused source/stage mismatch after a test edit; restage/build corrected it. The first separate profiler build lacked an explicit dependency root; the task-only config corrected resolution. No failed result was relabeled as a pass. Earlier attempts/source/output trees and safe terminal transcripts in `performance-runtime/evidence/` remain available.

### Boundary, preservation and review handoff

The current three RSC trees contain checked-in samples/client references and route metadata, not real private identity/workspace records. Valid-cookie disabled-member payload tests inspect all three; actual client admission denies the rendered route. Future real server data/actions must authorize beside the read/mutation. One ordinary backend me is not a quota for password login, actual401 refresh, explicit recovery/visibility revalidation or justified private-data boundaries; those remain current independent checks.

Final source manifest: `d8323c1991339a2b3ccd68fb515e4ef34f3b5fd7f13c6f94668b0525a86e0d7b`. Runner verify confirms89 current/staged inputs, protected inputs unchanged (including absent shared pointer), no output symlinks. Public fixture provenance confirms112 original API inputs unchanged plus the matching public hosted-target example; no API source edits. Source changes are12 modified web paths plus the deleted protected `loading.tsx`, and six006 documents.

Cleanup: pre-stop status reported API listening, all fault flags false, adminDisconnects0. Owned web/browser processes stopped; canonical support exited0 after removing its synthetic identities/handoff; run-bound forwarder and guarded unique fixture stop exited0. The owned private fixture directory is absent, all55440–55444 ports rebound successfully, and no Docker container/network retains project `esty-fe-perf-d778cfa775`. Shared54322/55432, BE Etsy's resources, old fixtures/volumes and owner accounts were not cleaned. `performance-runtime/cleanup.json` retains the safe receipt.

The six task-only launch/measurement scripts were removed after shutdown; their exact source and hashes remain in `performance-runtime/instrumentation-provenance.json` for audit. Public build/profile snapshots, safe reports/screenshots and task tool/dependency caches are retained as local evidence, not shipped source or a live service.

**READY_FOR_FE_PERFORMANCE_REVIEW** is a local source/check freeze, not T028 acceptance. Only preassigned `t15p` receives the frozen manifest and one scoped read-only review; confirmed findings require OMP correction/affected checks and fix-only inspection. Hosted signed-in latency/CLS, owner acceptance, other engines, Git integration/publication and deployment remain separate gates.

### T028 history correction and final measurements

Assigned `t15p` reported one P2: delayed back/forward removed the admitted body and supplied no delayed indicator. The original review is not a no-findings review. The existing history journey now holds real context responses during both directions and checks old body/heading, inert controls, Loading after the threshold, committed destination and timer cancellation. Failing-before desktop:0/1, `test-1794894350748.json`. Two intermediate corrections still failed the three history viewports while four security/sidebar neighbors passed (`test-1794894494155.json`, `test-1794894805278.json`).

Runtime event-order tracing identified why: Window-target listeners ran in registration order despite capture=true. A provider mounted after Next could receive the event only after the cached route/path ref changed. The final fix mounts a null-rendering root bridge before Next's passive listener, with one identity-safe mounted-provider subscription; public pages gain no auth guard/request. The provider starts fresh current admission/progress before restoration, and the ready destination suspends on that exact intent's promise. Known denial bypasses that wait. No router internals, production event monkey-patch/replay, DOM snapshot, new history entry or completed authorization cache. Native browser traversal changes the address bar immediately; the retained application heading/active link/body remain associated until current admission commits.

Fix-only run: `apps/web/.openai/app-session-1876d4e402d7558c9bbdc110785699f7/`. Final production build `build-1794895166878.json` passes; explicit staged TypeScript and canonical web lint exit0. Held-history/sidebar/security selection **7/7**,15.5s (`test-1794895204057.json`), includes1440/360/390 back+forward, real denial/API outage before held context, delayed RSC/logout, rapid navigation and149/150ms reset/cancellation. Affected public-root home/privacy and unknown-route recovery **6/6**,5.5s (`test-1794895275539.json`), across the same widths. `history-pass-evidence/` preserves the7-case report/screenshots before public checks; desktop back-pending and360 forward-pending screenshots were visually inspected. Existing44/44 controller/functional and actual300s expiry evidence remain unchanged; no unrelated full-suite/expiry rerun.

The corrected normal production source was remeasured with the identical five-sample script, delay instrumentation and viewport/CPU/network settings; the still-owned synthetic fixture support was cleanly restarted with fresh generated identities and the same pinned profile. The pre-review named Profiler capture was not repeated or substituted for normal latency.

| Viewport | Baseline150ms-stage median | Corrected median | Improvement | Corrected ordinary CLS | Held-history maximum CLS |
|---|---:|---:|---:|---:|---:|
|1440×900|700.31ms|395.90ms|43.47%|0.000180094|0.004137731|
|390×844|783.54ms|429.26ms|45.22%|0.000431311|0.071184111|

Unthrottled corrected medians:232.20ms/263.26ms. All20 ordinary transitions still have one backend and one browser me, zero refresh. `after-history-fix/metrics.json` is the corrected pair with `baseline3/metrics.json`; filmstrips/raw sources remain alongside it. All10 final real click-frame samples47.2–100.3ms show no indicator (`history-transition-frames.json`).

The additional `history-budget.json` observes from before hydration and preserves each history snapshot **before** reload: context held750ms per back/forward,1200ms settle before each traversal, one backend me per traversal, reload CLS0. Remaining non-recent-input shifts are header-control horizontal movement on desktop and Dashboard search/header/sample-notice/body geometry on mobile when the admitted destination commits, not a disappearing body during the wait. The table reports these higher full held-history maxima rather than concealing them behind the smaller ordinary/reload scores; both meet0.10 for this controlled journey. This is not an arbitrary-latency or hosted CLS guarantee.

Corrected source manifest: `5783d73b723efbb1a6a79fe4535a3d9f6b03096cf819c7a23e2524107e664b82`; runner verifies90 inputs, protected hashes unchanged, no output symlinks. Exactly five web paths changed since the first freeze: root layout, new `history-navigation.tsx`, provider, protected boundary, existing E2E journey. No controller/BFF/API/dependency change was needed for the finding.

Fix-only cleanup again completed: all fault flags false/adminDisconnects0, both canonical support lifetimes exited0, nonce-bound forwarder and unique fixture stop exited0, private directory absent, all55440–55444 ports released, zero owned-project containers/networks. `history-cleanup.json`, `history-instrumentation-provenance.json` and safe terminal transcripts preserve proof; disposable executable diagnostics were removed. **FROZEN FIX-ONLY REVIEW — STOP WRITES / NO INFLIGHT** pending the same assigned reviewer's inspection of these changes only.

### Reviewed performance handback

Assigned company Codex `t15p`, runtime `gpt-6-luna` medium, **accepted the fix-only review** after verifying the exact90-input manifest and all five frozen source hashes. It confirmed the root bridge/current preparation boundary, denial bypass and held back/forward regression, with the recorded7/7 history/security,6/6 public-root and full held-history CLS evidence. **No remaining actionable finding in that fix-only scope.** The original broad review remains one P2, fixed and accepted; no reviewer tests/builds/runtime or second broad pass occurred.

T023–T028 local implementation/checks/scoped review are complete. Reviewed source SHA remains `5783d73b723efbb1a6a79fe4535a3d9f6b03096cf819c7a23e2524107e664b82`; only this acceptance record, plan/task status and local final handback receipt changed after acceptance. `apps/web/.openai/performance-accepted.json` records the21 changed/deleted paths (15 web, six006 documents), exact source/evidence, review and cleanup.

Ownership returns to main coordinator `t12p`; **STOP WRITES / NO INFLIGHT**. Public build/profile snapshots, safe failures/screenshots/raw metrics and task tool/dependency caches remain local evidence, not publication. No new worker/reviewer, Git mutation, merge/deploy, real owner credential read, provider operation, remote migration or shared-service cleanup occurred. Root README/PROJECT_STATE, API/canonical, dependency versions/lock and shared pointer remain unchanged. Owner hosted signed-in latency/CLS and visual acceptance, other engines and any separately authorized release action remain open; local results do not claim the owner's hosted0.60 fixed.

## Bounded display freshness execution evidence

Owner START selected the existing worktree/branch at44305aba0bdf90974c7675443217b0f632e1a911 and T029–T033. The explicit spec/plan/contract amendment was written before code. This supersedes only completed sample DISPLAY reuse and fresh visibility checks; T023–T028 and the original history P2/fix remain unchanged historical evidence. The current source is not published or hosted acceptance.

### Policy and measured request counts

The mounted controller retains a non-sliding `performance.now()` verification timestamp, authentication epoch, context generation and user/workspace binding. Strict age below60000ms may reuse display on the three audited sample routes. Cold/new-controller access and explicit current checking still read current context/me. A stale check is shared across focus, manual and route consumers; route epochs separately select the latest destination. No storage/token cache, server-user singleton, new endpoint, library or dependency was introduced.

Visibility hidden alone no longer clears identity. Fresh return does no state reset or fetch. Stale return keeps the last display with `revalidating`, inert body and a delayed fixed-position “Checking for session updates…” status. One9-second deadline covers both lock acquisition and current verification; failure conceals the display and exposes the existing unavailable/Check session UI. A real held-lock browser case observed that deadline rather than retaining stale-ready indefinitely.

Every token-writing/context-changing operation obtains current context inside the Web Lock; login rereads after begin acknowledgement, refresh rereads immediately before its POST, and logout never uses display freshness. Known401/403, membership denial, Broadcast invalidation, login/logout and generation/identity mismatch conceal or fence cached display immediately. Only401 permits the existing serialized refresh, consuming its confirmed me rather than issuing another success lookup. Focus does not trigger `router.refresh()`; explicit recovery may refresh route metadata, whose fresh display admission does not repeat me.

Paired normal production measurements use the same five warm samples per viewport/condition, loopback transport, full Chromium and unthrottled CPU. `apps/web/.openai/display-followup-runtime/before/metrics.json` and `after/metrics.json` retain raw requests, backend counts, shifts and screenshots.

| Journey after initial verification | Before context/browser me/backend me | After context/browser me/backend me |
|---|---|---|
|Each fresh sample-menu transition,20 measured transitions|1/1/1|0/0/0|
|Fresh hidden→visible return,1440/390|2/2/2; hidden state erased display|0/0/0; identity and shell retained|
|Stale focus with repeated visible events|Not a completed-display policy in the baseline|1/1/1 shared read|
|Stale navigation, native back or forward|One current check per intent|1/1/1; previous inert body/heading retained until settlement|

All these ordinary/fresh/stale successful measurements have zero refresh. The browser suite additionally proves ordinary search/rerenders and fresh menu roundtrips cause no auth reads, and concurrent stale focus plus competing Settings/Team intents share one browser context/me pair. Functional coverage includes a simultaneous explicit current-check consumer and the exact59999/60000ms non-sliding boundary.

| Viewport | Unthrottled median before→after |150ms admission-stage median before→after | Full ordinary document CLS |
|---|---|---|---|
|1440×900|245.69→64.71ms|414.98→49.91ms,87.97% lower|0.000180094|
|390×844|248.58→80.00ms|435.32→79.52ms,81.73% lower|0.000431311|

The150ms instrumentation applies only when an auth stage is requested; fresh after-navigation requests no such stage. This is the intended removed work, not a150ms RSC delay or hosted SLA. Fresh focus caused no additional measured shift. The separately held stale-focus/navigation/back/forward capture (`stale-display/metrics.json`) preserves all raw LayoutShift entries from before hydration, standard recent-input exclusions and1s/5s session windows. Stale focus retains the cold maximum above; full delayed-destination/history maxima are0.004137731 desktop and0.071184111 mobile, both below0.10. Remaining shifts occur when destination header/search geometry commits, not from a collapsed pending body. All eight stale cases retain the same header/sidebar and identity, with no Checking gate before an actual failure and no horizontal overflow.

### Functional, browser and lifecycle proof

- **52/52 affected functional cases passed**, including43 session/BFF/controller cases and nine existing sample table/member behavior cases. New cases cover completed freshness, joined reads/latest intent, same-generation identity swap, page-cache binding, a late me failure after failed context, fresh mutation context, confirmed refresh and a held-lock deadline. Actual command: task Node24.22.1 `--experimental-strip-types --test --test-timeout=10000` with `app-session.test.ts`, `workspace-foundation.test.ts` and `application-table.test.ts`.
- **13/13 production-browser cases passed**,34.2s: fresh/background display and stale history at1440/360/390; current denial/API outage before held context; delayed RSC/logout; rapid fresh destinations;149/150ms indicator behavior; labeled expired-me with real Auth refresh/current me; page-cache/account boundaries; native9-second lock timeout. The report/screenshots are retained in `display-pass-evidence/`, with receipt `test-1794932140466.json`.
- **Twelve affected security neighbors were exercised**: forged boundary/tampered cookies, current role/disabled membership, actual DB/API/technical/Auth faults, dropped logout acknowledgement, two contexts/tabs and delayed reads, late refresh/new begin, revoked refresh/replayed cookies, unconfirmed logout, newer actual Member generation, transient refresh503 and secret-free sample RSC. Initial run passed11/12; the remaining legacy injection was corrected and passed1/1 without changing application code. No unchanged natural300-second expiry or unrelated full suite was repeated.
- Production build/TypeScript, explicit staged typecheck and canonical web lint passed. The final build additionally includes the corrected legacy browser case. All runner receipts preserve exact argv, source manifest identity, exit status and protected-file checks.
- Desktop/mobile retained-display, stale-unavailable, held-history and account-change screenshots were inspected. The status does not insert flow height; failure screens conceal identity and provide recovery controls. A managed-browser mobile menu smoke also retained its header, had zero API reads/no Checking and no overflow; that helper's screenshot timed out, so visual proof comes from the successful full-Chromium captures, not a claimed managed capture.

Clock advancement, response holds, visibility events and selected expired-me responses are explicitly synthetic. Real local Auth/BFF/Nest/DB responses, current membership decisions, native Web Locks/deadline and browser history are not replaced by mocks.

Native cross-document back restored a fresh document rather than a BFcache heap. A separate full-Chromium probe removed Playwright's BFcache-disable argument and still reported `response-cache-control-no-store` / `response-cache-control-no-store-with-js-network-request`; it performed exactly one context/me check and no refresh. Keep those security headers rather than weaken them to obtain a cache hit. Paired persisted pagehide/pageshow injection plus real independent account-cookie delivery verifies synchronous concealment and rejection of the old cached tree until explicit current recovery. Actual native persisted-heap restoration is not claimed; `native-page-cache.json` retains the browser's reason.

### Retained failures, isolation and freeze boundary

The first new functional run passed38 cases before an identity test failed and a following held case timed out: those new callers awaited the ready notification rather than completion of the shared operation. Four corrected completion-sensitive cases passed, followed by the52/52 run. The initial12-case browser batch passed8/12; four identity-preservation assertions compared `innerText` line breaks with normalized `textContent`. They now compare the same observable accessible identity and passed in the13-case run. The security neighbor failure used persisted pageshow without its preceding pagehide; pairing the lifecycle events preserves the real503/no-cookie-cleanup/no-retry assertions and passes. These failures are not relabeled as successful application runs.

Resource reservation: BE `t15j` confirmed no active DB/listeners and no use of55440–55444. The new project is `esty-fe-d-72960fc221`, active run nonce `cd93963aad4232bf1317c3cc13407543`; public staged fixture/tooling is under `display-followup-runtime/`. An initial longer project prefix exceeded the Unix socket path bound and its owned fixture was stopped. A finite forwarding command then expired; after verifying only that run's PID absent, exact nonce/project/source ownership and exclusive port rebinding, its stale socket/marker were removed and forwarding restarted as a non-expiring owned service. Support then passed its real lifecycle guard. No old/shared fixture was adopted or cleaned.

The first stale-measurement script timed out because its generic first-table selector chose the collapsed chart-data table; targeting the existing visible project table corrected the measurement without changing application code. Its original source/hash/empty partial report remain in `stale-display/failed-initial-selector.json`. Setup failures remain in `setup-failures.json`; earlier source/build/test/report trees are archived by the existing runner.

Final90-input manifest before review: `a27587d5c08f557e53ce7db275d9e67705dd3fdba26c9deb21435474dfba3db3`. Only five web paths differ from the selected base: controller, provider, application shell and the existing functional/E2E files. The root event bridge, protected route boundary, BFF/server/API/canonical, root documents, dependencies/lock and shared pointer are intentionally unchanged. The13-case report used the identical application/controller source; the final manifest differs only in the corrected legacy E2E injection. Assigned reviewer acceptance and guarded cleanup are separate closeout gates, not inferred from these checks.

### Reviewed bounded-display handback

Existing assigned reviewer `t15p`, company Codex `gpt-6-luna` medium, accepted T029–T033 in one read-only scoped pass. It confirmed the final manifest/all five web hashes and the named baseline manifest, and found no remaining actionable correctness/security/regression/test gap. Its receipt specifically accepted controller-local strictly-less-than60-second/non-sliding display reuse, epoch/generation/user/workspace binding, current mutation context, shared bounded stale revalidation, immediate known-denial concealment and pagehide/account fences. It preserved the native BFcache/no-store limitation and the11/12 plus corrected1/1 neighbor history. The reviewer did not run tests/build/runtime. No source correction or additional application run followed acceptance.

Cleanup proof: pre-stop API listening, all three fault flags false and adminDisconnects0; the owned web wrapper exited143 after explicit SIGTERM, canonical support exited0 with `CLEANED`, and nonce-bound forwarder stop exited0 without a PID signal. Guarded fixture stop removed only `esty-fe-d-72960fc221`; its directory is absent, all55440–55444 ports passed exclusive loopback rebinding, all three owned process IDs are absent and the exact project has zero containers/networks. The inspected containers had no Docker volume mounts. Shared54322/55432, old/BE fixtures, unrelated processes and caches were left alone. Five executable throwaway scripts were removed after preserving their source/hashes in inert JSON evidence; successful reports/screenshots and failed-attempt history remain. See `display-followup-runtime/cleanup.json`.

Context supplies current CSRF/session-generation coordination, not profile authorization; me supplies the current profile, workspace and capabilities. Fresh sample display can reuse the validated controller snapshot without asking for either on every tab switch. It still rechecks after the bounded interval because access may change elsewhere; known changes conceal immediately, stale checks retain only inert prior display while pending, and actual API/mutation requests keep their current security checks.

**T029–T033 COMPLETE — READY_FOR_COORDINATOR / STOP WRITES / NO INFLIGHT.** `apps/web/.openai/display-followup-accepted.json` records the separate new review, unchanged tested source, final documentation identities and cleanup. Final handback returns source/evidence ownership to `t12p`; no new writer, reviewer, commit, publication, deployment or next feature was started. Local results are not hosted/owner acceptance or actual native persisted-heap proof.
