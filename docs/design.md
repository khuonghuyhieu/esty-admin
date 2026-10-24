# Frontend design direction

Updated: 2026-10-24. Active visual direction: **Doodle**, selected by the owner. This file configures future UI work; it does not mean the current HTML has been restyled.

## What each skill supplies

| Role | Local source | When to read |
| --- | --- | --- |
| Product context and delivery | `.agents/skills/ecommerce-landing-page/SKILL.md`, `PROJECT_STATE.md` | Landing-page tasks |
| Visual template | `.agents/skills/doodle/SKILL.md`, `.agents/skills/doodle/DESIGN.md` | Selecting tokens and drawing the page |
| Frontend design craft | `.agents/skills/frontend-design/SKILL.md` | Layout, hierarchy, typography and implementation |
| UI/UX quality review | `.agents/skills/web-design-guidelines/SKILL.md` | Reviewing affected UI after changes |

The TypeUI template is a design specification, not a ready-made rendered website or React component kit. The frontend skill teaches the agent how to implement a design; the review skill checks usability and technical interface quality. Combine these roles without averaging unrelated templates together.

The owner clarified that “adaptive” was part of a question about how templates and UI/UX skills differ, not a second template request. Do not search for or install an Adaptive template on that basis.

## Apply Doodle to this product

- Use hand-drawn accents, imperfect outlines and sketch-style illustrations to explain the real Etsy → operator review → BurgerPrints preparation flow. Keep the copy credible for an internal-team application and developer registration.
- Starting tokens from TypeUI: primary `#49B6E5`, secondary `#263D5B`, surface `#FFFFFF`, text `#111827`; spacing `4/8/12/16/24/32`; heading scale `14/16/18/24/32/40`. Use semantic CSS variables. Larger headings or section spacing may be adapted for readable responsive composition.
- Upstream suggests Delius Swash Caps and JetBrains Mono. Use actual available font weights, not every weight enumerated by the template. Prefer handwritten display accents with a readable system-font body for long explanations, forms and dense operational content. This readability adaptation is intentional.
- Treat the light blue as an accent, not automatically a white-text button background: verify contrast for the actual text size. Use dark ink/secondary color for readable labels and focus states.
- Keep controls recognizably interactive and click targets intact; decorate around them rather than distorting hit areas. Decorative doodles must not obscure content or be announced by screen readers.
- Use responsive layout, keyboard access, clear labels, visible focus and reduced-motion behavior regardless of visual style. Check narrow screens around 360px and desktop around 1440px when browser tooling is available.
- Preserve static HTML/CSS. A visual template does not require adding React, Tailwind, component dependencies or external font services.
- The older cream/green styling is a historical starting point, not the selected direction for the next redesign. Do not change the live/public site as part of skill installation alone.

## Working sequence

1. Read existing product context and affected page; reuse recorded decisions.
2. Apply Doodle tokens and propose a short page-specific layout direction, then continue authorized work without an extra approval gate.
3. Implement in the actual static source with truthful copy and working links.
4. Review affected files with Web Design Guidelines; fetch its current upstream rules when network is available. If unavailable, report that limitation and use the concrete checks above without claiming a fresh upstream review.
5. Preview the result at mobile/desktop sizes when tooling is available, fix actionable issues, and record observed checks in `PROJECT_STATE.md`.

For a future admin dashboard, preserve product-wide color/spacing consistency while prioritizing readable tables, forms and status states over decorative handwriting. Do not build that dashboard merely because these skills are installed.
