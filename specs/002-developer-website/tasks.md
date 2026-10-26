# Tasks: Developer website

Status (2026-10-26): original T001–T008 complete; owner reports Vercel deployment, with T009/T010 acceptance still incomplete. Latest request authorizes planning the UI correction only. T013–T020 below are pending future implementation/acceptance, not completed work or deployment authorization. T011 is explicitly deferred; T012 follows verified publication. Keep existing `main`; no new branch/worktree. Inputs: [spec.md](spec.md), [plan.md](plan.md), [ARCH-001](../architecture.md).

## Delivery milestones

| Milestone | Outcome | Dependencies |
| --- | --- | --- |
| W0 | Reviewable docs and explicit decisions | Local implementation authorized |
| W1 | Next.js home/privacy running and verified locally | T001–T008 complete, including external review |
| W2 | Verified Vercel HTTPS URL and optional existing-domain connection | W1, confirmed publication facts and project access |
| W3 | Use actual URL for Etsy developer registration | W2; separate registration/API task |

## Setup

For T001–T006, load `vercel-react-best-practices` when making React/Next.js implementation choices and read only applicable rules. Follow the plan's skill routing and version-matched framework documentation.

- [X] T001 Create root `package.json` npm workspace and `apps/web/package.json` with the planned scripts/Node baseline; install compatible pinned dependencies and generate root `package-lock.json`. Covers FR-007.
- [X] T002 Add Next.js/TypeScript/ESLint configuration under `apps/web/`, safe `.gitignore` entries and `apps/web/.env.example`; implement validated public configuration in `apps/web/src/lib/site-config.ts`. Covers FR-006, FR-007, FR-010.

## Story 1 — Understand the application

- [X] T003 [US1] Build shared shell, Doodle tokens and focus/reduced-motion behavior in `apps/web/src/app/layout.tsx`, `apps/web/src/app/globals.css` and `apps/web/src/components/site/`. Covers FR-004, FR-005.
- [X] T004 [US1] Implement home composition/copy under `apps/web/src/features/landing/` and the entrypoint `apps/web/src/app/page.tsx`; retain honest development status and the BurgerPrints pilot. Covers FR-001, FR-002.

## Story 2 — Privacy and contact

- [X] T005 [US2] Implement `apps/web/src/features/privacy/` and `apps/web/src/app/privacy/page.tsx` with truthful current-site handling; connect confirmed contact/operator facts and list missing publication facts in `PROJECT_STATE.md`. Covers FR-003, FR-010.
- [X] T006 [US2] Add the legacy privacy redirect in `apps/web/next.config.ts`, working shared links and `apps/web/src/app/not-found.tsx`. Covers FR-004.

## Local acceptance

- [X] T007 Verify fresh installation, lint, typecheck and production build from the root; add/run focused functional tests for meaningful public configuration validation and document actual commands in `README.md` and outcomes in `PROJECT_STATE.md`. Covers FR-006, FR-007, SC-003.
- [X] T008 Add Playwright configuration and automated functional/E2E journeys under `apps/web/tests/e2e/`, expose root `test:e2e`, and run against the local production build. Cover direct home/privacy access, navigation, legacy redirect, unknown-route recovery, 360px/1440px overflow and keyboard access. Review UI against the three UI skills and applicable `vercel-react-best-practices` rules; manually check zoom/reduced motion and accurate copy/metadata. Obtain one concise read-only Codex review using `gpt-6-luna`; fix confirmed findings through OMP and rerun affected checks. Record actual evidence/limitations in `PROJECT_STATE.md`. Covers FR-001–FR-006, SC-001–SC-004.

T008 evidence: 18/18 production Chromium E2E checks passed after fixing mobile 200% text overflow; visual, keyboard, metadata and reduced-motion checks are recorded in PROJECT_STATE. The coordinator confirmed the separate `gpt-6-luna` read-only review completed with no actionable findings; no source fixes or suite rerun were needed. T008 is complete. SC-004 is not passed locally: human publication confirmation belongs to T009. SC-005 remains pending public HTTPS verification.

## Story 3 — Public URL

- [ ] T009 [US3] Confirm publication facts and the intended Vercel account/project; record non-secret deployment settings in `README.md` and outstanding inputs in `PROJECT_STATE.md`. Covers FR-006, FR-008, FR-010. Blocked until publication inputs are supplied.
- [ ] T010 [US3] Deploy `apps/web` to Vercel and verify home/privacy HTTPS access without sign-in; record the real URL, build and rollback reference in `PROJECT_STATE.md`. Covers FR-008, SC-005. Depends on T007–T009 and resumed publication work.
- [ ] T011 [US3] When the owner supplies the GoDaddy hostname and DNS access, add the domain in the verified Vercel project, apply only its required DNS records and verify TLS/navigation/canonical host; record evidence in `PROJECT_STATE.md`. Covers FR-009. Optional after T010; does not block the initial Vercel URL.

Owner decision: T011 is explicitly deferred. The supplied domain is `lovora.us`; the preferred hostname is `app.lovora.us`. Continue with `https://esty-admin.vercel.app/` while domain setup remains open. No DNS change has been made.

## Handoff

- [ ] T012 Link the verified website evidence from `PROJECT_STATE.md` to existing Notion C2-01; record remaining registration requirements. Actual Etsy form submission, OAuth and API proof are follow-up work. Covers FR-010.

## Execution order

Original sequence: T001 → T002 → T003 → T004 → T005 → T006 → T007/T008 → T009 → T010 → T012. T011 remains deferred. Preserve historical task statuses; the earlier checks did not establish fidelity to the newly supplied references.

Current correction sequence after implementation is requested: T013 → T014 → T015 → T016 → T017 → T018 → T019 → T020. No parallel markers: one OMP source writer and shared style/shell dependencies favor sequential execution. T009/T010 release closeout remains a separate publication step after visual review; do not push redesigned source to production-linked `main` merely to obtain a preview.

## UI correction — foundations

- [ ] T013 Recapture `https://doodle-typeui-9fa2feab.vercel.app/marketing` at 1440×1000 and 390×844, inspect the application reference for shared treatment, and compare with the current website before editing. Record reference availability, observed styles and baseline limitations in `PROJECT_STATE.md`; keep screenshots in ignored `apps/web/test-results/visual/`. Read the three UI skills and relevant React/Next rules. Covers FR-011, FR-014.
- [ ] T014 Replace public design tokens, paper/dotted surfaces, sketch outlines/radii/shadows and button/focus treatments in `apps/web/src/app/globals.css`; add verified, licensed self-hosted Delius Swash Caps/Geist assets and notices under `apps/web/src/app/fonts/` and configure them in `apps/web/src/app/layout.tsx`. Verify actual font loading and contrast. Preserve configuration gates, Server Components and upstream skills. Covers FR-005, FR-011, FR-012.

## Story 4 — Reference-based public UI

Independent acceptance: the home → workflow → privacy → home journey works, internal own-shop content is consistent, and same-viewport screenshots visibly follow the marketing reference.

- [ ] T015 [US4] Recompose the split hero, conceptual preparation illustration, feature group, workflow/scope sections and closing CTA in `apps/web/src/features/landing/landing.tsx`; update `apps/web/src/components/site/header.tsx`, `footer.tsx`, `src/app/page.tsx` and `layout.tsx` as needed for real navigation and internal-team metadata. Keep `#workflow`, add `#scope`, and use only implemented links. Remove external-seller availability wording; omit sample pricing/testimonials/metrics and fake app actions. Covers FR-001, FR-002, FR-006, FR-011–FR-013; SC-008.
- [ ] T016 [US4] Apply the shared paper/typography treatment to `apps/web/src/features/privacy/privacy.tsx` and `apps/web/src/app/not-found.tsx`, adjusting `globals.css` only as needed; retain a readable document column, truthful privacy/contact status, existing direct routes and recovery links. Align future-use wording with internal own-shop scope. Preserve `/privacy.html` behavior in `apps/web/next.config.ts`. Covers FR-002–FR-005, FR-012, FR-013; SC-001, SC-008.
- [ ] T017 [US4] Extend `apps/web/tests/e2e/website.spec.ts` for the revised copy/links and all working CTAs, retaining meaningful keyboard/focus, draft metadata, redirect/query, 404, reflow and reduced-motion assertions. Replace obsolete exact navy-color/external-seller expectations without weakening accessibility. Run root lint/typecheck/functional tests and production E2E using README commands; record actual results in `PROJECT_STATE.md`. Covers FR-004–FR-007, FR-013; SC-001–SC-003, SC-007, SC-008.
- [ ] T018 [US4] Capture final home/privacy screenshots at 1440×1000, 390×844 and 360×800 under ignored `apps/web/test-results/visual/` after the final E2E run. Compare the reference at matching 1440×1000 and 390×844 dimensions; inspect hero, representative section, shell/footer and privacy adaptation. Record the plan's visual comparison matrix, contrast/reflow checks, intentional deviations and unresolved limitations in `PROJECT_STATE.md`; fix material mismatches through OMP and rerun affected checks. Covers FR-005, FR-011, FR-012, FR-014; SC-006, SC-007.

## Correction closeout

- [ ] T019 Obtain one concise read-only Codex review using `gpt-6-luna` of changed source, test evidence and visual comparisons; record the actual review in `PROJECT_STATE.md`. OMP resolves confirmed findings and repeats affected checks/screenshots only when needed. This review does not confer owner visual acceptance. Covers FR-010, FR-014.
- [ ] T020 Present the local implemented preview and desktop/mobile comparison evidence to the owner; record explicit acceptance or pending changes in `PROJECT_STATE.md`. Refresh affected navigation/validation notes in `README.md` and task statuses in this file. Keep T020 open until owner acceptance; stop before source commit/push, deployment or DNS work unless subsequently requested. Covers FR-010, FR-014; SC-009.

## Application planning boundary

FR-015 is covered by the application-screen proposal and unresolved decision table in `plan.md`, not application implementation tasks. Overview, orders, order detail and connections are candidate screens only. Confirm the first screen set, actions, data mode and access/backend boundary before specifying a later feature. No `/application` or `/app` route, mock dashboard, login, live API or supplier behavior is included in T013–T020.

The correction has eight new tasks: two foundations, four US4 implementation/verification tasks and two closeout tasks. T001–T008 remain checked as historical work; T009–T012 and T013–T020 remain open. Checked tasks never imply production approval or Etsy acceptance. Keep Notion at milestone level rather than duplicating this technical checklist.
