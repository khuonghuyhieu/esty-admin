# esty-admin

Fulfillment Workspace landing page for the Etsy developer application.

Static English landing page for the Etsy developer application. `dist/index.html` is the application overview; `dist/privacy.html` is a provisional privacy overview. No live Etsy integration or data collection is implemented.

Status on 23 October 2026: a Sites project was created, but source synchronization failed because `git.chatgpt-team.site` could not be resolved from this environment. The expected Sites URL is not a live deployment and must not be submitted to Etsy yet.

The app path is **Personal App** because the project intends to serve our own shop and other sellers. After Personal App approval and broader rollout readiness, request Commercial Access for the same app. Before submitting for review, confirm legal/project name, support contact, domain, privacy retention and deletion policy. A public page is useful for reviewers, but this static site is not an OAuth callback. The callback must be an HTTPS backend route whose exact URL is registered in Etsy.


## Agent context and application foundation

Read `AGENTS.md`, `PROJECT_STATE.md` and `DESIGN.md` before continuing. The static site source is `dist/`; it has no dependency installation or build step. Preview locally:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory dist
```

Project-local skills in `.agents/skills/` provide the Doodle visual direction, frontend implementation guidance, interface review and landing-page workflow. Upstream source revisions and hashes are recorded in `.agents/skills/sources.json`. The current HTML has not yet been restyled with Doodle.

The owner authorized a local FE–BE connectivity foundation: one frontend, one modular-monolith backend, database migrations, validated configuration and a generated API client/contract. The actual FE/BE/DB decision document is still needed; no stack was selected by this review branch. `etsy-api-first.md` records technical direction and `PROJECT_STATE.md` records the checked sources and remaining input.

Correction: the previously cited Technical Architecture document belongs to Camp Ticket. E-commerce's Technical Spike Findings still has decisions marked TBD. Do not inherit the other project's stack. Business module implementation is outside this foundation authorization.

This review branch changes documentation and agent skills only. Application setup/dev/lint/typecheck/test/build commands and an executable FE → API → DB path do not exist yet. No deployment or Etsy integration is claimed.
