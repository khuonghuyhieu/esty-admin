# Current handoff

Updated: 2026-10-25. Technical context: [ARCH-001](specs/architecture.md). Local repository root: `e-commerce/esty-admin/`.

## Observed state

- Code: static developer landing page at `dist/`; no FE–BE runtime, migrations or real Etsy integration exists.
- GitHub review branch `docs/ecommerce-foundation-handoff` is at `501c7bf38736470cd52f0e7332c11774f337e51b`, matching the local checkout before the current documentation edits. PR #1 exists and is closed; merge status has not been verified.
- The active checkout is `esty-admin/` inside the surrounding `e-commerce/` workspace. Open `esty-admin/` directly and run Git commands there. Its linked-worktree metadata currently lives under the ignored parent `.workspace/` directory; keep that directory in place while using this checkout.
- Current work: make the renamed `esty-admin/` checkout the clear local entrypoint. No runtime or stack decision is introduced.

## Context and skills

- `specs/architecture.md` owns cross-cutting technical decisions; `specs/001-connectivity-foundation/spec.md` owns current feature requirements. No completed feature plan/tasks exist while stack is unresolved.
- `.specify/memory/constitution.md` owns governance. Project-local Spec Kit v1.2.3 core bootstrap provides 8 workflow skills and 6 Bash helpers alongside 3 UI skills. The full Specify CLI, extensions, dispatcher and events have not been installed.
- All repository/PR artifacts are English; owner-facing conversation may remain Vietnamese. Functional Unicode fixtures and upstream licenses are preserved.
- `.workspace/` is excluded local history/credentials/backups, not active implementation context. No additional sibling or nested code repository should be created.

## Verification and next action

Previously verified: official helper blob hashes, rendered skill references and scratch feature/template/prerequisite workflow. The local folder was renamed from `source/` to `esty-admin/`; Git's linked-worktree pointer was repaired and the branch remains clean at the previously pushed commit. No browser/runtime/API checks are implied.

Continue from `esty-admin/` on the existing review branch. For implementation, the only identified blocker remains the approved FE/BE/DB document or explicit values; foundation authorization is already granted.

## Tracking

[Notion C3-03](https://app.notion.com/p/3d256f555918814abd42efeec2ea5edb) tracks technical design/foundation; [Start Here](https://app.notion.com/p/3f056f55591881fda622e3284841e426) holds the project overview. Their previous updates were verified, but they still describe the nested path until the migration status is synchronized. Business tasks and original Drive evidence are retained; C3 production Go is not implied by context cleanup.
