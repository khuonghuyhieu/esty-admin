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

The repository has specs, 8 Spec Kit workflow skills, 3 UI skills and the old static website in `dist/`. There is no Next.js app, package manifest, dependency lockfile or application dev/build command yet. `apps/web/` exists only as a proposed path in the plan.

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

Next.js version-matched documentation will be integrated during application setup, preserving the existing project instructions. No framework runtime or dependencies were installed with this skill.
