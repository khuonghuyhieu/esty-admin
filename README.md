# Etsy Admin

Open this `esty-admin/` folder directly. It is the standalone repository for `khuonghuyhieu/esty-admin`; Git metadata lives in its own `.git/`.

Current direction: **Next.js → Vercel HTTPS website → Etsy developer registration**. The owner reports deployment at https://esty-admin.vercel.app/; release acceptance remains incomplete. Domain setup for `app.lovora.us` is deferred. Feature 002's original T001–T008 and correction T013–T020 are complete, including external review and owner visual acceptance; the owner has authorized FE commit/push. A deployment result for the correction is not verified. Application screens remain outside this FE increment; independently coordinated backend work does not establish connectivity.

## Read the current work

| File | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent rules and reading order |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Actual progress, verification and next action |
| [ARCH-001](specs/architecture.md) | Shared decisions, sources and current delivery order |
| [Website spec](specs/002-developer-website/spec.md) | What the website must do and how it is accepted |
| [Website plan](specs/002-developer-website/plan.md) | Technical design, configuration policy, verification and publication inputs |
| [Website tasks](specs/002-developer-website/tasks.md) | Original implementation and T013–T020 complete; release acceptance gates remain open |
| [Deferred connectivity spec](specs/001-connectivity-foundation/spec.md) | Later UI → API → DB scope |
| [Constitution](.specify/memory/constitution.md) | Project governance and feature-specific acceptance |

Agents read AGENTS → PROJECT_STATE → architecture, then the constitution and active feature artifacts. Read only relevant skills/source after that. Notion owns milestone/status tracking; Drive retains original evidence. Feature tasks belong here, not in a duplicate project tracker.

## Current files and commands

The npm workspace contains one Next.js application at `apps/web/`. The root lockfile pins dependencies; `dist/` is preserved as the legacy static reference, not the deployment root. No backend or database is required.

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

`npm test` runs Node's functional configuration tests. `typecheck` generates Next route types before checking TypeScript. `build` makes a production build, not a publication-ready release; `start` serves it on loopback port 3000. Rebuild after changing public configuration.

Browser setup and automated acceptance:

```sh
npm exec --workspace=@esty-admin/web -- playwright install chromium
npm run test:e2e
```

On a Linux CI machine, install Playwright's required system dependencies using its documented `install --with-deps chromium` command with appropriate permission. Do not bypass package or system approval prompts. Chromium downloads can take several minutes.

`test:e2e` builds and starts **production**, not the dev server, on `127.0.0.1:3100`; it refuses to reuse an existing server and stops its own server afterward. Stop any other production server before running it because both use `.next/`. Two Chromium projects exercise 360px/1440px layouts, navigation, redirects, 404, keyboard/skip focus, metadata, text reflow and reduced motion. Local ignored reports: `apps/web/playwright-report/` and `apps/web/test-results/`. To inspect the HTML report:

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

The active feature is `specs/002-developer-website/`; feature 001 is deferred. Its ignored local pointer can be restored using that path. Read-only path resolution:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/002-developer-website bash .specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

Local `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement`, `$speckit-constitution` and `$speckit-checklist` files use pinned [Spec Kit v1.2.3](https://github.com/github/spec-kit/releases/tag/v1.2.3) sources. `.specify/upstream.json` records provenance. Skill discovery depends on the agent session; read the local `SKILL.md` directly if it is not listed.

The local implementation workflow uses the pinned prerequisite helper with `SPECIFY_FEATURE_DIRECTORY=specs/002-developer-website`. Update the existing feature documents for the current correction rather than recreating them. The full Specify CLI, extension dispatcher/events and automatic Git/issue workflows are not installed by this bootstrap. Current planning does not authorize redesigned source publication; commit/push and deployment follow applicable owner requests.

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
