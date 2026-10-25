# Etsy Admin

Open this `esty-admin/` folder directly. It is the standalone repository for `khuonghuyhieu/esty-admin`; Git metadata lives in its own `.git/`.

Current direction: **Next.js → Vercel HTTPS website → Etsy developer registration**, using the owner's existing GoDaddy domain when configured. NestJS/Cloud Run and Supabase remain the later backend/database direction. The owner has asked for documentation before application code.

## Read the current work

| File | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Agent rules and reading order |
| [PROJECT_STATE.md](PROJECT_STATE.md) | Actual progress, verification and next action |
| [ARCH-001](specs/architecture.md) | Shared decisions, sources and current delivery order |
| [Website spec](specs/002-developer-website/spec.md) | What the website must do and how it is accepted |
| [Website plan](specs/002-developer-website/plan.md) | Technical design, proposed source structure, environment/deployment and open inputs |
| [Website tasks](specs/002-developer-website/tasks.md) | Proposed technical execution, all unchecked |
| [Deferred connectivity spec](specs/001-connectivity-foundation/spec.md) | Later UI → API → DB scope |
| [Constitution](.specify/memory/constitution.md) | Project governance and feature-specific acceptance |

Agents read AGENTS → PROJECT_STATE → architecture, then the constitution and active feature artifacts. Read only relevant skills/source after that. Notion owns milestone/status tracking; Drive retains original evidence. Feature tasks belong here, not in a duplicate project tracker.

## Current files and commands

The repository has specs, 8 Spec Kit workflow skills, 3 UI skills, the React/Next.js performance skill and the old static website in `dist/`. There is no Next.js app, package manifest, dependency lockfile or application dev/build command yet. `apps/web/` exists only as a proposed path in the plan.

To view the old static reference:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8765. This is not a Next.js preview or a verified deployed website. Legacy `.openai/hosting.json` stays local/ignored and is not Vercel configuration.

When implementation resumes, the website plan calls for npm workspaces, root setup/dev/lint/typecheck/build/start commands and Vercel root `apps/web`. Add working commands here only when implemented and checked. Keep hosting metadata, real environment values and credentials local.

## Spec Kit

The active feature is `specs/002-developer-website/`; feature 001 is deferred. Its ignored local pointer can be restored using that path. Read-only path resolution:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/002-developer-website bash .specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

Local `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement`, `$speckit-constitution` and `$speckit-checklist` files use pinned [Spec Kit v1.2.3](https://github.com/github/spec-kit/releases/tag/v1.2.3) sources. `.specify/upstream.json` records provenance. Skill discovery depends on the agent session; read the local `SKILL.md` directly if it is not listed.

The website spec/plan/tasks are compact review drafts; their presence does not mean implementation or a full workflow/CLI run completed. The owner has limited the current work to docs. The full Specify CLI, extensions, dispatcher/events and automatic Git/issue workflows are not installed by this bootstrap. Earlier CLI/network attempts failed on DNS; the current shell npm-registry read also failed on DNS. Helper/template checks do not prove application build or deployment.

Existing frontend-design, Doodle and web-design-guidelines skills guide later website implementation/review. Templates are scaffolds, not approved business scope. Do not recreate this feature, another checkout or a separate landing-page repository to resume work.

### React and Next.js guidance

The project-local `vercel-react-best-practices` skill supplements the UI skills for React/Next.js implementation and performance review. Invoke `$vercel-react-best-practices` in agent chat, or request a React/Next.js review. Read only rules relevant to the change. The upstream commit and per-file SHA-256 hashes are recorded in `.agents/skills/sources.json`; upstream files are preserved unchanged.

| Work | Guidance to use |
| --- | --- |
| Page layout, typography and visual hierarchy | `frontend-design` |
| Palette, spacing and sketch accents | `doodle` |
| React components, Next.js pages/layouts, Server/Client boundaries, data fetching, hydration and bundle loading | `vercel-react-best-practices` |
| Accessibility, keyboard interaction and interface review | `web-design-guidelines` |

AGENTS requires relevant React/Next.js work to use the skill without an explicit reminder. If it is absent from the session catalog, read [its local entrypoint](.agents/skills/vercel-react-best-practices/SKILL.md) directly. These guidelines supplement version-matched framework documentation. Apply only relevant rules; a static website does not need fetching or caching dependencies just because the skill includes examples.

Next.js version-matched documentation will be integrated during application setup, preserving the existing project instructions. No framework runtime or dependencies were installed with this skill.

### Implement through OMP in Herdr

The owner-selected implementation harness is `omp`. When implementation is requested from a Herdr-managed Codex pane, the agent follows the installed Herdr skill to open a sibling pane in this repository, start OMP and send the approved task scope with explicit local instruction/skill paths. Codex remains the coordinator; OMP performs source edits and verification. See [AGENTS.md](AGENTS.md) for handoff and coordination rules.

Example chat request: "Open OMP in a sibling Herdr pane and implement feature 002 tasks T001–T008. Apply the installed frontend skills, verify local acceptance and stop before deployment, commit or push."

This is an agent workflow convention, not a shell alias or installed Spec Kit hook. Calling a skill alone does not create a pane. The handoff requires an active Herdr environment and an available `omp` command; no new checkout is needed.

After implementation and test execution, use a read-only Codex reviewer with `gpt-6-luna` for one concise review of changed code and test gaps. This model name was found in the installed CLI's bundled catalog; live account availability must still be verified at reviewer startup. OMP fixes confirmed findings and reruns affected checks. No reviewer has been launched by documenting this convention.

### Feature testing

Application features that change user behavior include functional acceptance tests and an automated E2E journey. Reuse existing suites, test observable behavior and avoid redundant snapshots or tests of trivial scaffolding. Feature 002 plans Playwright tests against the local production build; see its [test design](specs/002-developer-website/plan.md) and [T007–T008](specs/002-developer-website/tasks.md). Testing dependencies, browsers and `test:e2e` are not installed yet; add runnable commands here when implementation verifies them. No dedicated testing skill is currently installed; these requirements apply through AGENTS and the feature plan regardless.
