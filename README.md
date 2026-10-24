# esty-admin — E-commerce workspace

Start here for the Etsy fulfillment project. Etsy API access is the first technical milestone; BurgerPrints is the single supplier pilot. The repository currently contains a static developer landing page and agent context. FE–BE foundation is authorized but awaits the actual approved FE/BE/DB stack decision.

## Structure

```text
.
├── README.md              # entrypoint and commands
├── AGENTS.md              # instructions for agents
├── PROJECT_STATE.md       # current decisions and next step
├── dist/                  # editable landing page + privacy
├── docs/                  # design direction + API-first roadmap
└── .agents/skills/         # reusable UI and project workflows
```

No separate checkout or PR folder belongs inside this source tree. Keep one branch per change; update the existing review PR rather than creating copies. Do not create empty frontend/backend folders before the stack is known.

## Run the existing site

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Open http://127.0.0.1:8765. There is no install/build step for this static page. Application dev/lint/typecheck/test/build and migration commands do not exist yet.

## Continue work

Agents read `AGENTS.md` and `PROJECT_STATE.md`. For UI changes, use `docs/design.md` and the local skills; for API-first preparation, use `docs/roadmap.md`. Sources and upstream skill versions are recorded in `.agents/skills/sources.json`. The current site has not yet been restyled with Doodle.

The roadmap records the intended own-shop and consenting-seller use case. No live Etsy integration, OAuth, order processing or deployment is verified. Confirm actual registration requirements and complete support/privacy details before publication.

The earlier architecture reference belonged to Camp Ticket. Verified E-commerce decision sources and the missing stack input are recorded once in `PROJECT_STATE.md`; do not copy that other project's stack.
