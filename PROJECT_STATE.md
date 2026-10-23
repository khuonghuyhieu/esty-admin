# Current project state

Updated: 2026-10-24. This is a local handoff snapshot, not a live mirror of external systems.

## Owner decisions

- One landing page, introducing an application for the internal team. Initial use: project website for Etsy Developer registration so the owner can obtain API access.
- The privacy overview is a supporting page. No second landing page is currently requested.
- Etsy API access/proof is the leading technical priority; operational walkthrough and mapping can proceed alongside it.
- BurgerPrints (SUP-05) remains the single supplier pilot. On 2026-10-24 the owner authorized a local FE–BE connectivity foundation using the previously decided stack; the actual FE/BE/DB decision has not yet been located. Business modules, production scope and cloud remain outside this authorization. The initial foundation request prohibited commit/push/deploy; the subsequent request explicitly authorizes a review branch and PR. Deployment remains outside scope.
- Keep context and task workflows in source so new Codex sessions need less repeated explanation.
- Selected visual template: TypeUI Doodle. “Adaptive” was clarified as a question, not another template to install. Root `DESIGN.md` routes template, frontend implementation and UI/UX review skills.

## Source map

| Path | Purpose / observed state |
| --- | --- |
| `dist/index.html` | Existing English static landing page: Fulfillment Workspace, Etsy order review and BurgerPrints preparation. Editable source and deployable output. |
| `dist/privacy.html` | Provisional privacy overview; real contact, retention and deletion details are not finalized. |
| `.openai/hosting.json` | Existing Sites project reference and `dist` directory. A configuration file is not proof of deployment. |
| `README.md` | Site status and registration gaps. Records a previous source-sync DNS failure; not independently retried in this setup task. |
| `etsy-api-first.md` | Current local technical direction and Backend–DB–Frontend preparation; no API proof recorded. |
| `step-by-step.md`, root `index.html` | Older 2026-10-19 workflow/Gantt snapshots. Root HTML visibly contains leading `+` characters and trailing `EOF`; not repaired in the agent-setup task. |

## External sources, only when needed

- Notion overview/decisions: https://app.notion.com/p/3f056f55591881fda622e3284841e426
- Notion tasks: https://app.notion.com/p/0e6ce296535b46d7af7a7dd0cee4795d
- Drive specifications/evidence: https://drive.google.com/drive/folders/13yBWSVNq1YuXDUDWmKmRAoSt5eOOPOWs
- Source documents linked from `etsy-api-first.md` have not been re-read during this setup. Inspect them when resolving a related question, rather than assuming their contents from their titles.

## Current handoff

### FE–BE foundation request — 2026-10-24

- Authorized: one frontend, modular-monolith backend, database connectivity/migrations, validated environment configuration, one generated API contract/client, health/readiness and a small connectivity UI. Root commands and concise agent handoff are required. Use tc-api only as a structural reference. Existing UI skills remain in `.agents/skills/`; admin controls prioritize readability.
- Proposed organization, pending framework-specific conventions: `apps/web` (routes, features, shared UI and generated API client), `apps/api` (bootstrap/config, modules with transport/application/adapters, database migrations). The existing `dist` stays separate from the proposed applications. These application directories have not been created; this is not a runnable foundation yet.
- Verified directly on Drive: [E-commerce Technical Spike Findings](https://docs.google.com/document/d/1qTKpEP8WRu0wve_HJGb1XBG7rkRnz_Rhvj-RDHIwA7o/edit) is a template with decisions TBD; [Fulfillment PRD](https://docs.google.com/document/d/1GFC-88PxndkCf2XkSFQmWgZJd1AP0IwczEaPLbHatG0/edit) is Draft; [Product Brief](https://docs.google.com/document/d/1UYPYpqzjHB9y3Fc3dDUUc4vHJlv_vkBitDQc7Ih-Ago/edit) does not specify FE/BE/DB. No ADR was returned by Drive title search. Relevant product/specification/integration folders were listed; this is not proof that no other decision document exists.
- Important correction: the previously cited architecture document `1UjQckJz9NH4ZNgViYEBEyy8lmiIh5A01bl_hD9CnokU` is linked to a task under Camp Ticket, not E-commerce. Do not use it to select or constrain this project's stack. The actual [E-commerce technical design/build task](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb) is Backlog, without a recorded stack decision in its fetched content.
- Blocker: owner was asked for the actual stack decision document or FE + BE + DB values. Do not pick substitutes or inherit tc-api's stack. Resume code setup as soon as this is supplied; the foundation itself is already authorized.
- This pass changed only local AGENTS/README/state and corrected the roadmap's misleading architecture citation. No application runtime, dependencies, DB, migrations, codegen, UI or integration tests were created/run. No commit/push/deploy occurred during the foundation investigation; the subsequent PR request authorizes the review branch.

- 2026-10-24: installed upstream `frontend-design`, `web-design-guidelines` and TypeUI `doodle` into this workspace's `.agents/skills/`, pinned to recorded source commits in `.agents/skills/sources.json`. Added `DESIGN.md` and updated agent routing. No public HTML restyling, deployment, Git commit or push performed in this setup task.
- Verification: all four local skills passed the skill-creator structural validator, routing paths exist, and every installed upstream file was compared byte-for-byte with its pinned source. License files bundled where provided and TypeUI's root MIT license retained. These checks do not establish browser quality or skill discovery in another running session; the new skills should be available on the next turn, with a fresh session as fallback if absent.
- The nested `esty-admin/` checkout was observed with no local commits/files beyond `.git`; it is separate from this working folder. README records an earlier push by another session, but this setup task did not verify the remote. Do not infer that local skill files are already on GitHub.

- Existing site files read. No live deployment, registration success or OAuth/API result verified.
- Added root `AGENTS.md` and project skill `.agents/skills/ecommerce-landing-page/SKILL.md`; updated README navigation.
- Skill validation passed; context links resolve. Public HTML was not modified or visually reviewed during setup. New-session skill discovery in `codex2` has not been observed.
- Next site task: refine the existing landing page around internal-team use and developer registration, preserving the distinction between planned features and working functionality; preview at desktop/mobile widths.
- Before a submission-ready publication: resolve actual project/legal name, support contact, domain and privacy details; confirm the account's actual app registration requirements. Do not assert that a website is mandatory for every Etsy app path.
- To exercise setup: start a fresh `codex2` from the workspace root, ask it to continue the landing page, and check that it reads this state and the project skill. No Herdr pane has been inspected or prompted from this Desktop chat.

## Review branch packaging

This repository contains the static site at `dist/`; project guidance and UI skills were brought over from the separate planning workspace for review. Historical workspace observations above are snapshots, not new checks of this checkout. FE/BE/DB setup remains pending the actual stack decision. This PR adds no application runtime or business feature and does not change the landing page.
