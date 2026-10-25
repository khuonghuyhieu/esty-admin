# Current handoff

Updated: 2026-10-25. Architecture: [ARCH-001](specs/architecture.md). Repository: `e-commerce/esty-admin/`.

## Latest owner direction

- Next.js is selected for the frontend; Vercel replaces the cloud workbook's earlier Cloudflare Pages selection. The owner already has a domain at GoDaddy; its exact name/subdomain and DNS state are not supplied.
- Immediate product sequence: frontend landing/privacy → verified HTTPS URL → Etsy developer registration. NestJS/Cloud Run and Supabase PostgreSQL remain later connectivity work, not prerequisites for this website.
- The owner's latest instruction limits this turn to documentation before code. Active feature is [002 — Developer website](specs/002-developer-website/spec.md), with a compact [plan](specs/002-developer-website/plan.md) and [tasks](specs/002-developer-website/tasks.md) for review. [Feature 001](specs/001-connectivity-foundation/spec.md) is retained and deferred, not completed or duplicated.

## Observed implementation state

- Only the legacy static landing/privacy pages exist in `dist/`; no application runtime, Next.js source, package manifest, lockfile, backend, migrations or real Etsy integration has been created.
- Application setup, local build, responsive browser verification, Vercel project linking/deployment, GoDaddy DNS configuration and Etsy registration are not completed.
- A concurrent change to `dist/index.html` appeared during the final status check (expanded HTML formatting). This task did not edit or revert it; preserve it as an independent working-tree change.
- PR #2 was merged into `origin/main` at `2530bdd`. Local `main` was updated to that commit, then the owner-requested branch `docs/developer-website-planning` was created from it. The tracked diff and all three new feature files were verified unchanged during the switch. The owner has now authorized committing and pushing the current cleanup, stack-audit, planning and static-page formatting changes for a new PR; this does not authorize implementation or deployment.
- The repository owns its `.git/` and no longer depends on the deleted parent `.workspace/`. The old outer `.git` was not changed. Ignored `.openai/hosting.json` is a preserved historical hosting reference, not the new Vercel deployment config.

## Document ownership and governance

ARCH-001 owns shared decisions and supersession; the active feature owns website requirements/design/tasks; README owns runnable commands; AGENTS owns agent behavior; this file owns observed progress. Constitution v1.2.0 makes website acceptance independent of deferred connectivity acceptance. All repository/PR artifacts are English; owner-facing conversation remains Vietnamese.

No separate roadmap, duplicate checkout or new Notion tracker was created. Existing 8 Spec Kit workflow skills, 3 UI skills and pinned helpers/templates remain unchanged. The complete Specify CLI/events/extensions are not installed by this core bootstrap. The website drafts are a compact documentation review, not a claim that every upstream Spec Kit workflow ran.

## Evidence retained

- [Cloud Cost & Handover Control](https://docs.google.com/spreadsheets/d/1o_I2L-gkTjowxb61i_o7CRee58DbeJaL/edit): inspected all 7 tabs from the current 57,488-byte cloud file; SHA-256 `2c545a072ea568e656cf3f0433a11682bd3b0d0d44148abc4952e5f394893fc0`. It records NestJS, Cloud Run, Supabase PostgreSQL/Auth/Storage, Cloud Build and Artifact Registry; ARCH-001 retains cell references. The owner's later Next.js/Vercel/GoDaddy decisions supersede its frontend/domain direction. Handover H01–H15 was Not started; service selection is not provisioning evidence.
- Docs 00–07, the accounting draft, working scope workbook and delivery tracker were reviewed. Older four-supplier drafts do not override the BurgerPrints-only pilot. Accounting is a later separate track. None of those reads established live API access or production approval.
- The supplied cloud workbook ID remains Office according to Drive metadata; native Sheets editing returned FAILED_PRECONDITION. No workbook conversion, duplicate or note write occurred. A native converted URL is still needed for direct Sheet updates; this is not a website documentation blocker.
- Prior cleanup checks preserved Git HEAD/refs/index/remote/author/source bytes and passed `git fsck --full --no-dangling`. Earlier Markdown/skill/helper checks passed; current review checks are recorded after completion below.
- Official Next.js installation/package metadata and Vercel deployment/Node/domain docs informed the draft plan. Proposed versions have not been installed. A shell `npm view` failed with ENOTFOUND before the owner redirected this turn to docs; no package installation ran. Current local Node reports 26.10.0, while the plan targets Node 24.x for Vercel alignment.

## Next action

Review the website spec, plan and short task sequence. Resume frontend implementation only after the documentation phase; keep every implementation task unchecked until executed. Publication inputs to obtain are the exact domain/subdomain, confirmed app title/operator/support contact, privacy wording and intended Vercel account/project access. These do not block preparing the frontend but do block a submission-ready publication claim.

## Documentation verification

Passed on 2026-10-25: all 26 Markdown files have balanced code fences; all 25 local Markdown links resolve; active feature path and spec/plan/tasks prerequisites resolve to feature 002; pinned Spec Kit and UI file hashes are unchanged. All 12 task IDs are unique/sequential and unchecked, with the 10 requirements covered by the task descriptions. `git diff --check` passed. No application source, dependency installation, runtime/build/browser check or deployment occurred. C2-01/C3-03 updates were read back successfully and both remain Doing.

## Tracking

[Notion C2-01](https://app.notion.com/p/3d256f555918818884afd5131dd1908c) tracks Etsy access/website preparation. [C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb) tracks technical design/connectivity. Both now record Next.js/Vercel/GoDaddy, documentation before code, the website-first order and deferred connectivity. Readback verified the updates; statuses remain Doing. [Start Here](https://app.notion.com/p/3f056f55591881fda622e3284841e426) remains the project overview and was not edited in this turn. No task is Done merely because documentation exists.
