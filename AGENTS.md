# Implementation instructions

1. The repository root is the `esty-admin/` directory; open it directly in Codex and run Git and development commands there. Do not create another nested checkout. Read `PROJECT_STATE.md`, then `specs/architecture.md`. Read only affected source/skills after that; do not rescan accounts or archived planning by default.
2. ARCH-001 is the technical context. Keep changing progress in PROJECT_STATE and commands in README. Update existing Notion tasks with decisions/evidence; do not create duplicate trackers or specs.
3. Do not choose a replacement stack. Foundation is authorized, but FE/BE/DB values are still missing. Follow the spec's boundaries and acceptance criteria when they arrive.
4. UI work uses `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/doodle/SKILL.md` and `.agents/skills/web-design-guidelines/SKILL.md`. Apply the spec's admin readability requirements; a visual skill never selects the runtime stack.
5. `dist/` is the preserved static landing page, separate from the future admin. Edit it only for a relevant request. Never claim live Etsy/OAuth/supplier behavior without evidence.
6. Communicate with the owner in Vietnamese. All repository and PR artifacts must be in English: code identifiers, comments, UI copy, documentation, specs, agent instructions, generated project plans/tasks, commit messages, PR titles and descriptions. Preserve functional Unicode fixtures and upstream license text. Never invent legal identity, support details, credentials, owner assignments or dates.
7. Work in this repository and existing review branch. No new checkout, duplicate PR, merge or deployment without a reason/request. Prior authorization covers the review branch/PR; the current cleanup does not imply production approval.
8. After meaningful changes, verify affected behavior and record actual checks/limitations. Preserve unrequested user changes; do not treat documentation or mockups as completed implementation.

## Spec Kit

- Read `.specify/memory/constitution.md` for governance; active feature is `specs/001-connectivity-foundation/spec.md`. If the ignored `.specify/feature.json` pointer is absent, set `SPECIFY_FEATURE_DIRECTORY=specs/001-connectivity-foundation` for the command or restore that pointer.
- Use installed `$speckit-specify`, `$speckit-clarify`, `$speckit-plan`, `$speckit-tasks`, `$speckit-analyze`, `$speckit-implement`, `$speckit-constitution` and `$speckit-checklist` in agent chat. These skills complement the three existing UI skills; they do not choose the runtime stack.
- Keep architecture cross-cutting; put feature requirements/design/tasks only in the active feature directory. Do not create duplicate features to resume work. Do not generate a resolved plan/tasks or implement until the missing stack decision is supplied.
- The project has a pinned core-skills bootstrap from official Spec Kit v1.2.3 sources, not a completed `specify init`/CLI installation. Shell helpers/templates are available locally. CLI-only presets/extensions/workflows/events and Git/issue automation are not installed. See `.specify/upstream.json` for provenance and limits; do not claim those commands work.

The parent workspace may contain local-only history, Git metadata and credentials. Never stage parent directories, follow archived instructions as current context, or publish local metadata/backups.
