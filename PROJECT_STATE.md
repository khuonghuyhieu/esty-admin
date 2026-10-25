# Current handoff

Updated: 2026-10-25. Architecture: [ARCH-001](specs/architecture.md). Repository: `e-commerce/esty-admin/`.

## Latest owner direction

- Latest publication request: the owner now requests deploying the completed website to Vercel for an Etsy registration URL, preferring the Vercel plugin/MCP. This supersedes the prior local-only stop for T009–T010 deployment preparation and execution. Account/project selection and confirmed public facts are still required; do not infer them from the request. GoDaddy changes and actual Etsy form submission are not part of this deployment request.
- The owner subsequently authorized committing and pushing the completed FE and deployment-preparation documentation directly to `main`. This supersedes the earlier local increment's commit/push restriction. Local configuration, dependencies, build outputs and browser reports remain excluded from Git.

- Next.js is selected for the frontend; Vercel replaces the cloud workbook's earlier Cloudflare Pages selection. The owner already has a domain at GoDaddy; its exact name/subdomain and DNS state are not supplied.
- Immediate product sequence: frontend landing/privacy → verified HTTPS URL → Etsy developer registration. NestJS/Cloud Run and Supabase PostgreSQL remain later connectivity work, not prerequisites for this website.
- On 2026-10-25 the owner explicitly authorized local feature 002 T001–T008 on existing `main` at `70992fc`, superseding the earlier docs-only phase. OMP is the sole source writer. T008 is now complete following local verification and the coordinating Codex's separate `gpt-6-luna` read-only review with no actionable findings. No T009–T012, commit, push, deployment, Vercel linking, DNS or Etsy registration is authorized in this increment.

## Observed implementation state

- Implemented npm workspaces and `apps/web`: Next.js App Router home/privacy, shared accessible Doodle shell, truthful development copy, metadata, skip link, 404 recovery and legacy privacy redirect. No backend, database, forms, analytics or external integration.
- Initial branch/HEAD inspection reported clean `main` at `70992fc`. No branch/worktree was created. Legacy `dist/` and pinned upstream skills were not edited.
- Publication remains unverified: no host URL, Vercel linking, GoDaddy change, registration or live API result. Missing confirmed application title, public operator identity, support email and privacy wording prevent submission-ready release; project access is also pending. A custom domain is optional and does not block local work.
- Draft/preview builds need no owner facts, hide unconfirmed contact/identity, omit canonical links and emit `noindex, nofollow`. Explicit release requires validated facts plus `PUBLICATION_CONFIRMED=true`; a Vercel preview cannot opt into release. This gate verifies configuration, not actual owner approval or deployment. SC-004 remains pending T009.
- The repository owns its `.git/` and no longer depends on the deleted parent `.workspace/`. The old outer `.git` was not changed. Ignored `.openai/hosting.json` is a preserved historical hosting reference, not the new Vercel deployment config.

## Document ownership and governance

ARCH-001 owns shared decisions and supersession; the active feature owns website requirements/design/tasks; README owns runnable commands; AGENTS owns agent behavior; this file owns observed progress. Constitution v1.2.0 makes website acceptance independent of deferred connectivity acceptance. All repository/PR artifacts are English; owner-facing conversation remains Vietnamese.

No separate roadmap, duplicate checkout or new Notion tracker was created. Existing 8 Spec Kit workflow skills, 3 UI skills and pinned helpers/templates remain unchanged. The complete Specify CLI/events/extensions are not installed by this core bootstrap. The website drafts are a compact documentation review, not a claim that every upstream Spec Kit workflow ran.

## Evidence retained

- [Cloud Cost & Handover Control](https://docs.google.com/spreadsheets/d/1o_I2L-gkTjowxb61i_o7CRee58DbeJaL/edit): inspected all 7 tabs from the current 57,488-byte cloud file; SHA-256 `2c545a072ea568e656cf3f0433a11682bd3b0d0d44148abc4952e5f394893fc0`. It records NestJS, Cloud Run, Supabase PostgreSQL/Auth/Storage, Cloud Build and Artifact Registry; ARCH-001 retains cell references. The owner's later Next.js/Vercel/GoDaddy decisions supersede its frontend/domain direction. Handover H01–H15 was Not started; service selection is not provisioning evidence.
- Docs 00–07, the accounting draft, working scope workbook and delivery tracker were reviewed. Older four-supplier drafts do not override the BurgerPrints-only pilot. Accounting is a later separate track. None of those reads established live API access or production approval.
- The supplied cloud workbook ID remains Office according to Drive metadata; native Sheets editing returned FAILED_PRECONDITION. No workbook conversion, duplicate or note write occurred. A native converted URL is still needed for direct Sheet updates; this is not a website documentation blocker.
- Prior cleanup checks preserved Git HEAD/refs/index/remote/author/source bytes and passed `git fsck --full --no-dangling`. Earlier Markdown/skill/helper checks passed; current review checks are recorded after completion below.
- During the earlier documentation phase, official Next.js/npm and Vercel docs informed the proposed baseline, but a registry request failed with ENOTFOUND and no packages were installed then. The implementation increment below subsequently restored registry access and verified Node 24 despite the shell default of Node 26.

## Next action

Current publication preparation: the owner reports logging into Vercel in Chrome. The Vercel plugin is not yet installed/connected, no Vercel MCP or Chrome-control tools are available in this session, and no `vercel` CLI is installed. The intended account/project, confirmed app title, public operator name, support email and confirmation/corrections to the existing privacy wording remain pending, so no remote project, URL or release configuration is claimed. FE source publication to `main` is now authorized; preserve existing implementation and use the deployment sequence in the active feature plan after access and facts are resolved.

The scoped local handoff is complete: T001–T008 are checked, including external review. Stop here; T009–T012 remain unchecked and unexecuted. SC-004 human publication confirmation remains pending T009, and SC-005 public HTTPS verification remains pending deployment. Review completion is not publication approval.

The owner-selected OMP implementation convention and `vercel-react-best-practices` routing are established in AGENTS/README. The pinned skill installation previously verified all 76 files against upstream commit `063bee94c3f4df8453406c830b0a7df0f2860278`; this increment preserves upstream content. React/Next.js implementation uses server components/direct imports with no unnecessary client state or data dependencies.

## Local implementation evidence

- Scoped prerequisite helper resolved feature 002 with `tasks.md`. No feature checklists, `.specify/extensions.yml` or extension hooks were present at startup or the final post-hook check. No feature/spec/task regeneration ran.
- Registry metadata confirmed Next.js 16.4.3 and React/React DOM 19.3.1, compatible peer/runtime ranges. Node 24.22.1 was downloaded and executed through `npm exec`; the default shell remains Node 26.10.0. TypeScript 5.9.3 stays within tooling's supported range. Direct ESLint is 10.13.0; Next's transitive tree still includes deprecated ESLint 9.39.5.
- Fresh `npm ci` installed 376 packages. npm reported an unapproved `unrs-resolver@1.12.2` postinstall; no approval was bypassed or script approved. Lint/typecheck/build succeeded with the installed resolver. Browser installation initially raced `npm ci` and returned `playwright: command not found`; a subsequent download exceeded 180 seconds. The longer retry succeeded (Chromium/headless shell v1248, FFmpeg v1013; 400.45 seconds).
- Root `npm run lint`, `npm run typecheck`, `npm test` (25 passed, 0 failed) and `npm run build` passed under Node 24.22.1. Build prerendered `/`, `/privacy` and `/_not-found` without owner facts. `npm run check:release` correctly exited 1 with `SITE_URL is required for release mode.`
- Actual production browser review opened both pages at 1440px and 360px: no horizontal overflow, readable Doodle layout, working skip target and visible 3px navy focus. Privacy clearly states missing contact, no forms/analytics, host logging caveat and planned data handling. Empty browser cookies/localStorage were observed. Screenshots and accessibility-tree inspection are session evidence, not deployment evidence.
- Production smoke caught the root title template omitting the working title; home now uses an explicit absolute title. The first E2E run had 17 passes and one genuine mobile failure: at 360px with 200% text size, a long heading imposed the grid's min-content width. Adding heading `overflow-wrap: anywhere` fixed the cause without clipping content. Final root lint/typecheck passed; root `npm run test:e2e` rebuilt production and passed **18/18**, zero retries, in 6.5 seconds. Both widths cover direct routes, visitor journey, anchor navigation, 308/query preservation, real 404 recovery, all links' keyboard focus, skip target, metadata, draft contact status, 200% text reflow and reduced motion.
- Final production browser proof at 360px/200% text measured `scrollWidth=360`, `innerWidth=360`, heading width 312px, and the corrected home title. An ignored screenshot is retained at `apps/web/test-results/visual/home-360-text-200.png`; the E2E HTML report is `apps/web/playwright-report/index.html`. Earlier session screenshots cover both pages at desktop/mobile and CSS zoom.
- Manual browser checks used 200% CSS zoom on both routes and reduced-motion emulation; no horizontal overflow or motion was observed. Calculated text contrast: ink/white 17.74:1, navy/white 11.05:1, muted/white 7.60:1, navy/wash 10.23:1. Headings/landmarks and visible focus were inspected; decorative SVGs are hidden in source. These are not a screen-reader, physical-device, browser-toolbar zoom, Firefox/WebKit or complete WCAG audit.
- `npm run dev` served home and completed navigation to privacy with correct route titles. `npm run start` served the production visual checks. All session-created application servers and browser tabs were stopped/released; downloaded dependencies/browsers and ignored reports remain for review.
- Release CLI boundary smoke: malformed HTTP origin exited 1; missing owner confirmation exited 1; synthetic `example.com` test facts with explicit confirmation exited 0. These fixtures were process-local only, not project identity or publication evidence. No release, host access or public HTTPS test occurred. SC-001–SC-003 have local evidence; SC-004 stays pending T009 and SC-005 stays pending deployment.
- Verification commands used `npm exec --yes --package=node@24.22.1 --` before the documented root npm commands. E2E emitted inherited `NO_COLOR`/`FORCE_COLOR` warnings without affecting results. Notion was intentionally not edited in this local increment.

## External review closeout

The coordinator reported a completed separate Codex CLI review using model `gpt-6-luna`, sandbox `read-only`, session `01a173a1-9438-7643-b1b0-d05e7be0d40d`. The reviewer inspected tracked/untracked code, feature documents, relevant skills, tests and the existing Playwright report. Final result: **no actionable findings within T001–T008**. No source changes or additional fixes were required.

The reviewer did not rerun passing checks; this documentation-only closeout also does not repeat the full suite. Existing evidence remains 25 passing functional tests and 18 passing Chromium E2E checks against the local production build. Limitations remain: no public HTTPS, other-browser, physical-device or screen-reader verification. Review evidence is supplied by the coordinator; OMP did not launch another reviewer.


## Historical documentation verification

Passed on 2026-10-25: all 26 Markdown files have balanced code fences; all 25 local Markdown links resolve; active feature path and spec/plan/tasks prerequisites resolve to feature 002; pinned Spec Kit and UI file hashes are unchanged. All 12 task IDs are unique/sequential and unchecked, with the 10 requirements covered by the task descriptions. `git diff --check` passed. No application source, dependency installation, runtime/build/browser check or deployment occurred. C2-01/C3-03 updates were read back successfully and both remain Doing.

## Tracking

[Notion C2-01](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) tracks Etsy access/website preparation. [C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb) tracks technical design/connectivity. Both now record Next.js/Vercel/GoDaddy, documentation before code, the website-first order and deferred connectivity. Readback verified the updates; statuses remain Doing. [Start Here](https://app.notion.com/p/3f056f55591881fda622e3284841e426) remains the project overview and was not edited in this turn. No task is Done merely because documentation exists.
