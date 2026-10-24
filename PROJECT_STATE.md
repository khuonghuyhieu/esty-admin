# Current project state

Updated: 2026-10-25. Read this with AGENTS.md; this is a handoff, not a live external-system mirror.

## Decisions and scope

- Etsy API access is the first technical milestone; BurgerPrints (SUP-05) is the only supplier pilot.
- One English static developer landing page at `dist/index.html`, with supporting `dist/privacy.html`.
- Doodle is the selected visual direction. See `docs/design.md`; existing HTML has not yet been restyled.
- The owner authorized a local foundation: one frontend, one modular-monolith backend, DB connection/migrations, validated env, generated API contract/client and connectivity UI. No business module scope or stack is inferred from tc-api.
- FE/BE/DB implementation awaits the actual approved stack document or explicit owner values. No runtime, migrations or application tests exist yet.
- A single review branch `docs/ecommerce-foundation-handoff` carries this documentation/skill setup and structure cleanup. Commit/push/PR are authorized; merge and deployment are not requested.

## Layout

- `README.md`: entrypoint, structure and available commands.
- `AGENTS.md`: reusable project working rules.
- `PROJECT_STATE.md`: current decisions, evidence, blocker and next action.
- `docs/design.md`: selected UI direction; `docs/roadmap.md`: API-first technical roadmap.
- `.agents/skills/`: project-local landing-page, frontend, Doodle and interface review skills.
- `dist/`: editable static website; no build toolchain.
- Future `apps/web` and `apps/api` are a proposal only, pending framework-specific conventions. No empty skeleton was created.

## Decision evidence checked on 2026-10-24

- [E-commerce Technical Spike](https://docs.google.com/document/d/1qTKpEP8WRu0wve_HJGb1XBG7rkRnz_Rhvj-RDHIwA7o/edit): template, decisions TBD.
- [PRD](https://docs.google.com/document/d/1GFC-88PxndkCf2XkSFQmWgZJd1AP0IwczEaPLbHatG0/edit): Draft. Older four-supplier scope is superseded by the owner's single-supplier pilot decision.
- [Product Brief](https://docs.google.com/document/d/1UYPYpqzjHB9y3Fc3dDUUc4vHJlv_vkBitDQc7Ih-Ago/edit): no FE/BE/DB decision.
- [E-commerce technical design task](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb): Backlog in fetched content, no stack recorded.
- Previously linked architecture document `1UjQckJz9NH4ZNgViYEBEyy8lmiIh5A01bl_hD9CnokU` belongs to Camp Ticket. Do not use it for E-commerce architecture.

## Checks and next action

- Local canonical checkout is `e-commerce/source/`; legacy checkouts and planning snapshots were preserved in sibling `.workspace/`. Git worktree references were repaired after relocation.
- Upstream skill hashes and local references were checked; static `dist/` files are unchanged from main. No new browser/runtime/API check is claimed.
- Source present locally does not prove deployment, Etsy registration, OAuth or API access. Privacy contact, retention and deletion details remain unfinished.
- Last push attempts failed on shell DNS; GitHub connector branch creation returned 403. Verify remote before reporting a PR exists.
- Next: publish this same review branch/PR, then resume foundation when the approved FE/BE/DB decision is supplied.

## External sources

- [Notion overview](https://app.notion.com/p/3f056f55591881fda622e3284841e426)
- [Notion tasks](https://app.notion.com/p/0e6ce296535b46d7af7a7dd0cee4795d)
- [Drive specifications and evidence](https://drive.google.com/drive/folders/13yBWSVNq1YuXDUDWmKmRAoSt5eOOPOWs)
