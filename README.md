# E-commerce source

Implementation workspace for Etsy fulfillment with BurgerPrints as the single supplier pilot.

```text
specs/architecture.md   architecture, stack decisions, scope and acceptance
.agents/skills/         frontend implementation, Doodle tokens and UI review
dist/                 preserved static developer landing page
```

Read [the architecture spec](specs/architecture.md) for what to build, [PROJECT_STATE](PROJECT_STATE.md) for where work stands, and [AGENTS](AGENTS.md) for working rules. These files have distinct roles; there is no separate local task plan or roadmap.

FE–BE foundation is authorized but not implemented: the approved FE/BE/DB stack is still needed. No application setup/dev/test/build or migration commands exist yet. Future app folders are proposed in the spec, not scaffolded.

To preview the existing landing page only:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8765. The page has no build step; live deployment, Etsy registration and API access are not established by this preview.

Task status and decisions live in [Notion C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb); Drive retains original specifications/evidence. Superseded local planning is preserved outside this repo in `../.workspace/`, not loaded as current context.
