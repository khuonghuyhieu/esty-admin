# Tasks: Developer website

Status: local implementation and external review for T001–T008 complete on existing `main` at `70992fc`. The owner's latest request resumes T009–T010 Vercel publication, preferring plugin/MCP access, and explicitly authorizes FE commit/push to `main`; account/project selection and confirmed public facts remain pending. No new branch/worktree is needed. T011 remains optional; T012 follows verified publication. Inputs: [spec.md](spec.md), [plan.md](plan.md), [ARCH-001](../architecture.md).

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

## Handoff

- [ ] T012 Link the verified website evidence from `PROJECT_STATE.md` to existing Notion C2-01; record remaining registration requirements. Actual Etsy form submission, OAuth and API proof are follow-up work. Covers FR-010.

## Execution order

T001 → T002 → T003 → T004 → T005 → T006 → T007/T008 → T009 → T010 → T012. T011 follows T010 when domain facts/access are available. No parallel markers: shared shell/configuration and documentation edits make sequential implementation simpler at this size.

The smallest useful local increment is T001–T004. The registration website requires both home and privacy acceptance plus T009–T010. Checked technical tasks record completed work, not a grant of production approval or evidence that Etsy accepted the app. Keep Notion at milestone level rather than copying every technical task into a new tracker.
