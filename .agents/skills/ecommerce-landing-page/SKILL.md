---
name: ecommerce-landing-page
description: Create, refine or review this project's Fulfillment Workspace landing page for internal-team use and Etsy Developer registration. Use for its site copy, static HTML/CSS, responsive layout and local verification; not for implementing Etsy OAuth or order APIs.
---

# Fulfillment Workspace landing page

Find the project root containing `docs/roadmap.md` and `dist/`. Read its `AGENTS.md` and `PROJECT_STATE.md`, then `README.md` and the affected HTML. If invoked outside this project, locate the source with the user rather than assuming a path.

## Content and scope

- Deliver one public English information page for an application being developed for an internal team. Its initial purpose is to explain the project during Etsy Developer registration. Keep the supporting privacy page consistent.
- Explain the intended flow in plain language: authorized Etsy order data → team/operator review of product, variant and artwork → prepare BurgerPrints fulfillment data → record the outcome.
- Describe unimplemented features as planned. API access, OAuth, imports and supplier submission are not established by a static mockup.
- Use `PROJECT_STATE.md` for current decisions. Do not ask again how many landing pages or who the audience is when those decisions are recorded there.
- Do not invent a support email, company identity, customer metrics, testimonial, approval badge, privacy commitment or working CTA. Use a working informational anchor when no actual action exists.
- Refer to Etsy as the intended platform integration; do not imply affiliation or endorsement. Check current official Etsy documentation if making a specific registration, API, trademark or policy claim. A copy/layout task does not require an API investigation.

## Implementation

- Edit `dist/index.html` and, as needed, `dist/privacy.html` directly. This site has no package manager or build pipeline. Preserve its lightweight static structure unless the owner requests a different stack.
- Read root `docs/design.md` for the selected Doodle direction and its skill routing. Use `.agents/skills/doodle/SKILL.md` for visual tokens and `.agents/skills/frontend-design/SKILL.md` for frontend craft. The historical cream/green design is superseded for future redesign work. Keep handwritten decoration compatible with readable body text and accessible controls.
- Make navigation, CTA and privacy links work from the deployed site root. Use semantic sections, visible keyboard focus, readable contrast, clear heading order and layouts that avoid horizontal overflow on small screens.
- Keep internal planning, agent instructions and operational details out of public copy.

## Verification and handoff

- Preview with `python3 -m http.server 8765 --bind 127.0.0.1 --directory dist` from the project root, choosing another port if occupied. Stop only the preview process you started.
- Check the homepage, privacy page, navigation/anchors and changed assets. When a browser is available, inspect desktop and mobile layouts and keyboard navigation. If unavailable, report the visual check as pending; do not label text inspection as visual verification.
- Run checks proportional to the change. No API tests are needed for static copy/CSS edits.
- For UI review, use `.agents/skills/web-design-guidelines/SKILL.md` on the affected files. If upstream review rules cannot be fetched, state that limitation rather than claiming the latest review was performed.
- Existing `.openai/hosting.json` identifies a Sites project. Use a deployment workflow available in the active environment when publication is requested; source presence or a project ID alone is not a live URL. Confirm the public page actually loads before reporting it live.
- Update `PROJECT_STATE.md` with meaningful changes, observed verification and the next step. Report exact edited files and any remaining owner-supplied facts briefly.
