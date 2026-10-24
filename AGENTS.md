# Implementation instructions

1. Read `PROJECT_STATE.md`, then `specs/architecture.md`. Read only affected source/skills after that; do not rescan accounts or archived planning by default.
2. ARCH-001 is the technical context. Keep changing progress in PROJECT_STATE and commands in README. Update existing Notion tasks with decisions/evidence; do not create duplicate trackers or specs.
3. Do not choose a replacement stack. Foundation is authorized, but FE/BE/DB values are still missing. Follow the spec's boundaries and acceptance criteria when they arrive.
4. UI work uses `.agents/skills/frontend-design/SKILL.md`, `.agents/skills/doodle/SKILL.md` and `.agents/skills/web-design-guidelines/SKILL.md`. Apply the spec's admin readability requirements; a visual skill never selects the runtime stack.
5. `dist/` is the preserved static landing page, separate from the future admin. Edit it only for a relevant request. Never claim live Etsy/OAuth/supplier behavior without evidence.
6. Communicate in Vietnamese; public website copy stays English. Never invent legal identity, support details, credentials, owner assignments or dates.
7. Work in this repository and existing review branch. No new checkout, duplicate PR, merge or deployment without a reason/request. Prior authorization covers the review branch/PR; the current cleanup does not imply production approval.
8. After meaningful changes, verify affected behavior and record actual checks/limitations. Preserve unrequested user changes; do not treat documentation or mockups as completed implementation.
