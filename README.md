# Etsy Admin

Open this `esty-admin/` folder directly. It is the standalone repository for `khuonghuyhieu/esty-admin`; Git metadata lives in its own `.git/`.

Current direction: **Next.js → Vercel HTTPS website → Etsy developer registration**. The owner reports deployment at https://esty-admin.vercel.app/; release acceptance remains incomplete. Domain setup for `app.lovora.us` is deferred. Feature 002's original T001–T008 and correction T013–T020 are complete, including external review and owner visual acceptance. The coordinator confirms the owner-approved FE-only push of 20 files to `main@6c64eaa`; a deployment result for that correction is not verified. The local BE foundation is verified and separately reviewed; the owner has now authorized its source-only commit/push. Hosted acceptance remains pending. Application screens and full UI → API → DB acceptance remain outside the completed increments.

## Read the current work

| File | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent rules and reading order |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Actual progress, verification and next action |
| [ARCH-001](specs/architecture.md) | Shared decisions, sources and current delivery order |
| [Website spec](specs/002-developer-website/spec.md) | What the website must do and how it is accepted |
| [Website plan](specs/002-developer-website/plan.md) | Technical design, configuration policy, verification and publication inputs |
| [Website tasks](specs/002-developer-website/tasks.md) | Original implementation and T013–T020 complete; release acceptance gates remain open |
| [Connectivity spec](specs/001-connectivity-foundation/spec.md) | Resumed local BE foundation; full UI → API → DB acceptance remains pending |
| [Constitution](.specify/memory/constitution.md) | Project governance and feature-specific acceptance |

Agents read AGENTS → PROJECT_STATE → architecture, then the constitution and active feature artifacts. Read only relevant skills/source after that. Notion owns milestone/status tracking; Drive retains original evidence. Feature tasks belong here, not in a duplicate project tracker.

## Current files and commands

The npm workspace contains the Next.js application at `apps/web/` and the independent local backend at `apps/api/`. The root lockfile pins dependencies; `dist/` is preserved as the legacy static reference, not the deployment root. The public website requires no backend or database.

The independently authorized local backend is `apps/api/` (NestJS 12, Node 24, PostgreSQL 17.11). The website still does not depend on it. Backend-only HTTP/database checks do not implement a connectivity screen or establish hosted Supabase/Cloud Run access.

To view the old static reference:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8765. This is not a Next.js preview or a verified deployed website. Legacy `.openai/hosting.json` stays local/ignored and is not Vercel configuration.

### Setup and local development

Use Node **24.22.1** (`.nvmrc`; workspace engines require 24.x). With an existing nvm installation, run `nvm install && nvm use`. If the shell is on another Node version, the verified isolated alternative is:

```sh
npm exec --yes --package=node@24.22.1 -- node --version
npm exec --yes --package=node@24.22.1 -- npm ci
```

Prefix the npm commands below with `npm exec --yes --package=node@24.22.1 --` when using that alternative. Do not run package installation and browser installation concurrently.

```sh
npm ci
export NEXT_TELEMETRY_DISABLED=1
npm run dev
```

Open http://127.0.0.1:3000 and `/privacy`. Stop the server with Ctrl+C. No environment file or owner facts are required for a local draft. `apps/web/.env.example` documents public build-time inputs; optional real values belong in ignored `apps/web/.env.local`, never in Git.

### Verification

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run start
```

`npm test` runs Node's functional site-configuration and application-table tests. `typecheck` generates Next route types before checking TypeScript. `build` makes a production build, not a publication-ready release; `start` serves it on loopback port 3000. Rebuild after changing public configuration.

Browser setup and automated acceptance:

```sh
npm exec --workspace=@esty-admin/web -- playwright install chromium
npm run test:e2e
```

On a Linux CI machine, install Playwright's required system dependencies using its documented `install --with-deps chromium` command with appropriate permission. Do not bypass package or system approval prompts. Chromium downloads can take several minutes.

`test:e2e` builds and starts **production**, not the dev server, on `127.0.0.1:3100`; it refuses to reuse an existing server and stops its own server afterward. Stop any other production server before running it because both use `.next/`. Chromium projects exercise public routes and `/application` at 360px/1440px, plus application acceptance at 390px. Coverage includes navigation, redirects, 404, table search/filter/sort/reset, disabled actions, drawer/menu focus, chart data, noindex, text reflow and reduced motion. Local ignored reports: `apps/web/playwright-report/` and `apps/web/test-results/`. To inspect the HTML report:

For a correction acceptance run, use `lint`, `typecheck`, `test` and `test:e2e`; E2E already builds production, so do not run a redundant separate build. These root commands target `@esty-admin/web` only; do not run concurrent dependency installation or another server/build using `.next/`.

```sh
npm exec --workspace=@esty-admin/web -- playwright show-report playwright-report
```

### Local correction preview and comparison gallery

After the passing E2E build, start the production preview without rebuilding:

```sh
npm exec --yes --package=node@24.22.1 -- npm run start
```

Open http://127.0.0.1:3000 and http://127.0.0.1:3000/privacy. Home navigation targets `/#workflow`, `/#scope` and `/privacy`; the contact-status link targets `/privacy#contact`. All actions are informational navigation, not application controls.

In a separate terminal, serve only the ignored visual-evidence directory:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory apps/web/test-results/visual
```

Open http://127.0.0.1:8766/comparison.html. This local gallery pairs reference/implementation hero, feature and footer captures at 1440×1000 and 390×844; it also links privacy/360px/reflow evidence. It is not a new app route or a public artifact. Screenshots are retained after the last E2E run because another run can clear `test-results/`; recapture affected evidence after source fixes. Stop each server with Ctrl+C before another production E2E run or handoff.

Both fonts are self-hosted through `next/font/local`; source/license/hash details are in the [feature plan](specs/002-developer-website/plan.md#verified-font-provenance-and-implementation-choices). T019 review and T020 explicit owner acceptance remain separate from passing checks. Do not commit/push the redesign to production-linked `main` merely to share a preview.


### Draft, preview and release gate

Default draft and host-detected preview are `noindex, nofollow`, omit canonical links and show no invented contact. An explicit release requires `SITE_MODE=release`, valid `SITE_URL`, `APP_NAME`, `OPERATOR_NAME`, `SUPPORT_EMAIL` and owner-confirmed `PUBLICATION_CONFIRMED=true`. `VERCEL_ENV=preview` rejects release mode. See the [configuration policy](specs/002-developer-website/plan.md#environment-and-deployment).

```sh
npm run check:release
```

This command reads **exported environment variables**, forces release validation and is expected to fail while facts are missing. It does not load `.env.local` itself, deploy, verify ownership or confirm public HTTPS. Next builds load Next environment files and apply the same validation. Do not set the confirmation flag merely to pass the gate. SC-004 confirmation remains T009; a custom domain is optional. Hosting metadata and real environment values remain local/ignored.

### Vercel deployment preparation

Planned project settings: Next.js preset, repository root directory `apps/web`, Node 24.x, root npm workspace lockfile, app build script and framework-managed output. Verify workspace installation/build resolution on Vercel before calling these settings successful. The initial registration URL may use the project's actual stable `vercel.app` production domain; no domain is assumed or reserved yet.

Prefer the Vercel plugin/MCP after the owner installs/connects it. Select the intended account/project explicitly and reuse a matching project. Preview builds keep draft/preview facts and indexing policy; set release facts only for production after owner confirmation. Verify public production-domain access without authentication rather than sharing a protected generated deployment URL. See the [deployment sequence](specs/002-developer-website/plan.md#deployment-sequence) for the current plan. No remote project or deployment exists based on these instructions alone.

## Spec Kit

Feature 002 owns the public website; feature 001 owns the locally verified backend foundation, with its FE connectivity work still pending. Preserve the ignored shared feature pointer; select the relevant directory per command. Read-only website path resolution:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/002-developer-website bash .specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

For backend workflows, use `SPECIFY_FEATURE_DIRECTORY=specs/001-connectivity-foundation` with the same helper. Do not switch the shared pointer between parallel lanes.

Local `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement`, `$speckit-constitution` and `$speckit-checklist` files use pinned [Spec Kit v1.2.3](https://github.com/github/spec-kit/releases/tag/v1.2.3) sources. `.specify/upstream.json` records provenance. Skill discovery depends on the agent session; read the local `SKILL.md` directly if it is not listed.

The local implementation workflow uses the pinned prerequisite helper with a command-local `SPECIFY_FEATURE_DIRECTORY`. Update the relevant existing feature documents rather than recreating them. The full Specify CLI, extension dispatcher/events and automatic Git/issue workflows are not installed by this bootstrap. The owner separately authorized BE source-only commit/push after local verification and review; remote database operations, deployment and integrations remain deferred.

The frontend-design, Doodle and web-design-guidelines skills guide website implementation/review. Templates are scaffolds, not approved business scope. Do not recreate this feature, another checkout or a separate landing-page repository.

### React and Next.js guidance

The project-local `vercel-react-best-practices` skill supplements the UI skills for React/Next.js implementation and performance review. Invoke `$vercel-react-best-practices` in agent chat, or request a React/Next.js review. Read only rules relevant to the change. The upstream commit and per-file SHA-256 hashes are recorded in `.agents/skills/sources.json`; upstream files are preserved unchanged.

| Work | Guidance to use |
| --- | --- |
| Page layout, typography and visual hierarchy | `frontend-design` |
| Palette, spacing and sketch accents | `doodle` |
| React components, Next.js pages/layouts, Server/Client boundaries, data fetching, hydration and bundle loading | `vercel-react-best-practices` |
| Accessibility, keyboard interaction and interface review | `web-design-guidelines` |

AGENTS requires relevant React/Next.js work to use the skill without an explicit reminder. If it is absent from the session catalog, read [its local entrypoint](.agents/skills/vercel-react-best-practices/SKILL.md) directly. These guidelines supplement version-matched framework documentation. Apply only relevant rules; a static website does not need fetching or caching dependencies just because the skill includes examples.

Framework API guidance is matched to installed Next.js 16.4.3 through its tagged source and bundled `node_modules/next/dist/docs/` metadata, redirects and Playwright guides. Existing project instructions and pinned skills are preserved.

### Implement through OMP in Herdr

The owner-selected implementation harness is `omp`. When implementation is requested from a Herdr-managed Codex pane, the agent follows the installed Herdr skill to open a sibling pane in this repository, start OMP and send the approved task scope with explicit local instruction/skill paths. Codex remains the coordinator; OMP performs source edits and verification. See [AGENTS.md](AGENTS.md) for handoff and coordination rules.

After the correction plan is accepted, an example chat request is: "Open OMP in a sibling Herdr pane and implement feature 002 tasks T013–T019. Follow the linked marketing reference, preserve the application planning boundary, run functional/E2E checks and collect matching-viewport visual comparisons. Present the local preview for T020 owner acceptance and stop before deployment, commit or push."

This is an agent workflow convention, not a shell alias or installed Spec Kit hook. Calling a skill alone does not create a pane. The handoff requires an active Herdr environment and an available `omp` command; no new checkout is needed.

After implementation and test execution, use a read-only Codex reviewer with `gpt-6-luna` for one concise review of changed code and test gaps. Verify live account availability at reviewer startup. OMP fixes confirmed findings and reruns affected checks. Feature 002's completed external review evidence is recorded in [PROJECT_STATE](PROJECT_STATE.md).

### Feature testing

Application features that change user behavior include functional acceptance tests and an automated E2E journey. Reuse existing suites, test observable behavior and avoid redundant snapshots or tests of trivial scaffolding. Feature 002 uses the production Playwright journeys and focused configuration tests described above. See [PROJECT_STATE](PROJECT_STATE.md) for actual results, completed external review and remaining limitations; T008 is complete, while publication confirmation and public HTTPS remain pending T009 onward. No dedicated testing skill is installed.

## Local backend foundation

Use Node **24.22.1** and Docker with Compose. Existing root FE commands remain unchanged. Dependency operations must be serialized with the other lane; the approved additive install was `npm install --workspace=@esty-admin/api --ignore-scripts`. Do not run another install, `ci` or prune while an agent holds the dependency lease.

The isolated Compose project is `esty-admin-be`; PostgreSQL binds only `127.0.0.1:55432`. Credentials below are synthetic local fixtures. Exported values take precedence over optional `apps/api/.env`; its secret-free example is `apps/api/.env.example`. Default `API_RUNTIME=local` rejects remote database hosts and URL options. Explicit hosted mode requires the approved target/TLS settings below and never loads a local env file.

From the repository root:

```sh
export DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local
npm run db:up
npm run api:codegen:check
npm run db:migrate
npm run db:migrate
npm run api:dev
```

Open `http://127.0.0.1:3001/health/live` and `/health/ready`. `api:dev` compiles first and watches emitted JavaScript; rerun `api:build` after TypeScript edits. For a built application use `api:start`. API defaults: loopback host, port 3001, exact browser origin `http://127.0.0.1:3000`; CORS is not authentication. No `.env` file is required when values are exported.

Liveness is 200 independently of the database. Readiness is 200 only after a fresh DB query, the foundation schema and the complete ordered migration history match the current application release. Missing/failed/pending migration, unavailable DB or timeout returns a safe 503; startup never auto-migrates. Saturation fails immediately rather than queuing probes. Admitted connection timeout is 1 second, SQL statement timeout 1 second, client query timeout 1.5 seconds and overall readiness deadline 3 seconds; failed or abandoned clients are destroyed. The next request rechecks current state.

```sh
npm run api:build
npm run api:typecheck
npm run api:test
npm run api:check
TEST_DATABASE_URL=postgresql://foundation_local:local_fixture_only@127.0.0.1:55432/foundation_local npm run api:test:integration
```

`api:check` runs OpenAPI/migration-manifest drift detection, typecheck, build and config/real-HTTP tests. The integration command requires the healthy exact fixture, stages the operator artifact and creates/drops only randomized `foundation_test_*` databases. It covers real HTTP → PostgreSQL, migration repeatability/rollback/later failures, timeout/pressure/recovery, trusted/untrusted/wrong-host TLS using disposable local certificates, hosted pool cleanup, and staged CLI/API execution outside repo cwd. OpenSSL must be available for the synthetic TLS fixture. No cloud/management API or live Supabase host is used.

The authoritative contract is `specs/001-connectivity-foundation/contracts/openapi.json`. After an intentional contract edit, run `npm run api:codegen`, then `npm run api:codegen:check`. Migrations are ordered 13-digit timestamp `.mjs` files in `apps/api/migrations/`. The web API imports a generated ordered name/hash manifest rather than scanning runtime files; the separate operator validates the actual assets against that manifest before DDL. After an approved new migration, run `npm run migrations:generate --workspace=@esty-admin/api` and rebuild/restart. Do not rewrite applied migrations or add a second Supabase migration engine. Publication is separately authorized.

Stop only the local database with `npm run db:stop`; its volume is preserved. `npm run db:up` restarts it. Do not use `down -v`, reset a database or target host PostgreSQL. Stop the local API with Ctrl+C. The original foundation review is historical; the code-first prototype T026 review is now complete with no confirmed actionable findings. Source remains uncommitted; local checks are not production approval.

## Isolated cloud CLI access

The owner initially uses one existing Supabase project; environment separation is deferred. Machine-local launchers were prepared under ignored `.openai/cloud-tools/` with private state under `.openai/cloud-auth/`. They are not checked-in tooling and are not available automatically in a fresh checkout. The Supabase binary is pinned to official [CLI 2.122.0](https://github.com/supabase/cli/releases/tag/v2.122.0); no npm or global install was used.

Use these launchers from this repository root rather than bare CLI commands, which may select company configuration. The Google launcher uses a separate `CLOUDSDK_CONFIG`; the Supabase launcher uses a separate state directory, unique credential profile and fixed project ref. Inherited provider credential overrides are cleared. No shell profile or global active configuration was changed.

Read-only identity/target checks:

```sh
.openai/cloud-tools/gcloud config get-value account
.openai/cloud-tools/gcloud config get-value project
.openai/cloud-tools/gcloud billing projects describe esty-admin --format='value(billingEnabled)'
.openai/cloud-tools/gcloud services list --enabled --project=esty-admin --format='value(config.name)'
.openai/cloud-tools/supabase whoami --output-format json
.openai/cloud-tools/supabase projects list --output-format json
```

If a login expires, use the same isolated launchers and select the personal E-commerce account in the official browser flow:

```sh
.openai/cloud-tools/gcloud auth login --brief
.openai/cloud-tools/supabase login --name esty-admin-cli --output-format text --agent no
```

macOS Keychain/browser/network access may require explicit sandbox permission; token values must not be copied into documentation or Git. Observed targets are Google Cloud `esty-admin` and Supabase **Esty Fulfillments** (`eotmpaliqcxxcotrcols`, Seoul). Google billing/APIs remain disabled, but Cloud Run/container work is now deferred rather than a prototype prerequisite. CLI authentication/project metadata do not prove SQL connectivity or deployment. Do not use Supabase migration commands as a second history: the foundation uses node-pg-migrate.

## Backend prototype — local code verified, external setup pending

Only `/health/live` and `/health/ready` are implemented. Keep one Supabase project and a separate BE Vercel project rooted at `apps/api`; no new auth/business modules, operational DB roles or Cloud Run/AWS/Azure infrastructure. [Feature001 plan/evidence](specs/001-connectivity-foundation/plan.md) records the actual checks; [operator acceptance guide](specs/001-connectivity-foundation/quickstart.md) details the future gates.

Node24 local checks passed: `api:check` **11/11**, `api:test:integration` **11/11 reported checks**, plus separate staged-process HTTP/migration/failure/recovery smoke. Native Vercel compatibility is **not yet verified**: isolated CLI65.4.0 with empty auth/config and denied networking returned `project_settings_required`. No project linkage, pull, remote SQL or deployment ran. Do not substitute tsc success for native artifact proof.

### Build and move the operator artifact

```sh
npm run migrations:check --workspace=@esty-admin/api
npm run stage:operator --workspace=@esty-admin/api
```

The complete `apps/api/build/operator/` contains compiled API/operator files, approved migrations and runtime dependencies, but no env file or credentials. Keep its layout intact when copying it. Its `apps/api/build/scripts/migrate.js` and `apps/api/build/src/main.js` run with Node24 from any cwd. Builds only compile/package; they never execute DDL.

### Owner-supplied settings — later, not needed for local checks

From the existing Supabase project's **Connect → Session pooler**, copy the exact host, username, database, project ref and port5432. Do not guess a hostname/index from the region. Review a password-redacted string only; deliver the actual password privately and percent-encode it in URLs. Use the placeholders/comments in `apps/api/.env.example`, not its local fixture URL, for hosted setup.

| Setting | Scope |
| --- | --- |
| `API_RUNTIME=vercel` | Required hosted mode; Vercel supplies `VERCEL` and `PORT`. Omit local `API_HOST`/`API_PORT` |
| `SUPABASE_PROJECT_REF` | Required approved 20-letter project ref |
| `SUPABASE_SESSION_HOST` | Required exact Connect AWS shared-pooler hostname; no arbitrary host or wildcard |
| `SUPABASE_DATABASE_NAME`, `SUPABASE_DATABASE_USER` | Required exact database/user; user includes the matching `.project-ref` suffix |
| `DATABASE_URL` | API secret; must match the whole approved tuple on5432, with no query options/fragments |
| `DATABASE_CA_PEM` | Optional verified CA as actual multiline PEM, not a path/literal `\\n`; otherwise system roots. Certificate/hostname verification always stays enabled |
| `BROWSER_ORIGIN` | Required exact HTTPS browser origin; CORS is not access control |
| `MIGRATION_DATABASE_URL`, `MIGRATION_CONFIRM_PROJECT_REF` | Operator-only URL and explicit matching project confirmation; never set in the API function |

No Supabase anon/service-role/management API key is needed for this pg API. Vercel project/org IDs and login/token belong only to future deployment tooling, not runtime. A CLI token is not required for owner-interactive login; optional CI tokens need separate approval. No real secret is requested now. An approved existing DB credential may be used; record its privilege exposure rather than silently creating roles/grants.

### Future external execution — separate approvals required

1. Approve the actual tuple/secret and read-only database preflight. Check identity, schema/history collisions and privileges. Never reset/adopt/drop shared objects.
2. Approve the exact migration set/checksums. With operator settings supplied privately, run the staged `migrate.js --hosted` or `npm run db:migrate:hosted --workspace=@esty-admin/api`; the command selects `MIGRATION_TARGET=supabase` and still requires explicit project confirmation. Rerun to prove zero new applications. Use Session5432, never transaction6543 or Supabase migration commands.
3. Verify the personal Vercel scope and eligible use, then create/link a **separate BE project**, Root Directory `apps/api`, native NestJS preset and Node24.x with root workspace-lock resolution. Preserve the FE project. Existing Hobby metadata is not commercial-use approval. Verify platform protection admits the intended testers and denies anonymous access; do not implement app auth for this prototype.
4. Provision only API variables for the approved preview environment. Obtain permission to retrieve genuine project settings and run native build; verify ESM/decorator bootstrap, manifest packaging and cancellation before claiming compatibility.
5. Obtain preview-deploy approval, verify exact project/target and deploy without production promotion, domain changes or FE redeploy. Check protected HTTPS health, failure/recovery and connection cleanup. Never disrupt the shared database to simulate failure.

Use the existing isolated CLI launcher only during that authorized external phase; its local tools/auth state is not a fresh-checkout dependency and was not used for code-first checks. Hosted pool max2 is per warm instance (local max4); multiple instances multiply sessions. Validate the real connection budget/TLS/timeouts later. The 3000ms readiness deadline starts inside the handler, not at the network/cold-start boundary. T026 is complete: separate gpt-6-luna read-only review session `01a17c65-9fda-7fd1-8e74-344facca83c2` found no confirmed actionable findings. The reviewer did not edit files or rerun checks; no source fix or redundant suite rerun was needed. T020, native T025 and T027–T030 external acceptance remain open.

## Application UI preview

[Feature 003](specs/003-application-shell/spec.md) implements the complete reference Application frame locally at **http://127.0.0.1:3000/application**. Use the existing Node 24.22.1 startup and verification commands above. It contains explicitly labeled sample data, synchronized header/table search, AND status filters, numeric/date sorting, reset, a keyboard-accessible drawer/menu and chart data disclosure. Unsupported actions remain disabled with explanations; no API, authentication or persistence is connected. Public home/privacy navigation is unchanged and does not advertise this preview.

After the production E2E run, `npm run start` serves the verified build. The retained comparison gallery is `apps/web/test-results/visual/application/comparison.html`; serve only that ignored directory in another terminal:

```sh
python3 -m http.server 8767 --bind 127.0.0.1 --directory apps/web/test-results/visual/application
```

Open **http://127.0.0.1:8767/comparison.html** for matching 1440×1000, 390×844 and 360×800 reference/implementation captures, full pages, row menus and mobile drawers. E2E clears `test-results`, so recapture evidence after a later run. Stop either server with Ctrl+C.

See the [component inventory and design](specs/003-application-shell/plan.md), [interaction contract](specs/003-application-shell/contracts/ui.md), [tasks](specs/003-application-shell/tasks.md) and [actual evidence](PROJECT_STATE.md#application-shell-local-implementation--feature-003). T001–T012 are complete, including the coordinator's separate read-only `gpt-6-luna` review with no actionable findings; T013 still awaits explicit owner visual acceptance. No commit/push/deploy/DNS is implied. Use command-local `SPECIFY_FEATURE_DIRECTORY=specs/003-application-shell SPECIFY_FEATURE_NO_PERSIST=1`; keep feature 001 connectivity and feature 002 publication separate.
