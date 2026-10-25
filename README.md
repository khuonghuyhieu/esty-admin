# Etsy Admin

Open this `esty-admin/` directory as the project workspace. It is the local checkout of the `khuonghuyhieu/esty-admin` GitHub repository and contains the implementation workspace for Etsy fulfillment with BurgerPrints as the single supplier pilot.

```text
specs/architecture.md   architecture, stack decisions, scope and acceptance
specs/001-connectivity-foundation/spec.md   current feature requirements
.specify/              constitution, official helpers/templates and provenance
.agents/skills/         frontend implementation, Doodle tokens and UI review
dist/                 preserved static developer landing page
```

## Context ownership

| File | Owns | Does not own |
| --- | --- | --- |
| [README](README.md) | Repository entrypoint, layout and commands | Task progress or architecture decisions |
| [AGENTS](AGENTS.md) | Agent behavior, language and skill routing | A duplicate product roadmap |
| [PROJECT_STATE](PROJECT_STATE.md) | Observed progress, blockers and next action | Full requirements or assumed completion |
| [Architecture](specs/architecture.md) | Cross-cutting boundaries, stack decisions and evidence | Per-feature implementation status |
| [Foundation spec](specs/001-connectivity-foundation/spec.md) | Feature requirements and acceptance | An invented implementation plan |
| [Constitution](.specify/memory/constitution.md) | Stable governance principles | A second architecture specification |

Read these files in that order when needed. Future `plan.md` and `tasks.md` belong only in the active feature directory after their prerequisites are resolved. Notion remains the execution/status tracker; there is no parallel local roadmap.

FE–BE foundation is authorized but not implemented: the approved FE/BE/DB stack is still needed. No application setup/dev/test/build or migration commands exist yet. Future app folders are proposed in the spec, not scaffolded.

To preview the existing landing page only:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8765. The page has no build step; live deployment, Etsy registration and API access are not established by this preview.

Task status and decisions live in [Notion C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb); Drive retains original specifications/evidence. Local history and credentials may exist in the parent workspace; they are outside this repository and must never be staged or published.

## Spec Kit in this source

Project-local core skills use official [GitHub Spec Kit v1.2.3](https://github.com/github/spec-kit/releases/tag/v1.2.3) templates, rendered for Codex's [skills integration](https://github.com/github/spec-kit/blob/v1.2.3/docs/integrations/codex.md). Invoke them in agent chat, not the shell:

```text
$speckit-clarify     clarify the current feature's missing decisions
$speckit-plan        design implementation after stack is confirmed
$speckit-tasks       break an agreed plan into executable steps
$speckit-analyze     check spec/plan/tasks consistency
$speckit-implement   implement the approved, actionable tasks
```

`$speckit-specify`, `$speckit-constitution` and `$speckit-checklist` are also installed. Existing frontend-design, Doodle and web-design-guidelines remain available. Newly installed skills should be discoverable on the next turn; open a fresh session from this source directory if they are absent.

The active feature already exists; resume it rather than creating another spec. The database/runtime decision is unresolved, so no completed plan/tasks or runtime implementation is claimed. To inspect the feature without changing files:

```sh
SPECIFY_FEATURE_DIRECTORY=specs/001-connectivity-foundation bash .specify/scripts/bash/check-prerequisites.sh --json --paths-only
```

**Installation limit:** DNS prevents downloading/installing the Specify CLI here. This is a project-local core skills/helpers bootstrap, not a successful `specify init`. No CLI extensions, presets, workflow dispatcher, runtime events or automatic branch/issue creation are installed. Provenance and selected commands are in `.specify/upstream.json`. The current helpers use local templates without needing the CLI.

When network access is available, the optional official CLI can be invoked with `uvx --from git+https://github.com/github/spec-kit.git@v1.2.3 specify --version`. Review/back up project customization before any init/upgrade; do not force-initialize over the current source.
