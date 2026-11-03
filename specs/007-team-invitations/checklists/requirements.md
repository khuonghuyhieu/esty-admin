# Specification Quality: Team and Invitations

**Planning-only checklist**, not acceptance of implemented behavior. [Spec](../spec.md) · [plan](../plan.md) · [tasks](../tasks.md).

- [x] US1 covers both new/existing recipients through actual email/Auth and explicit membership acceptance; US2 covers persistent current role/status changes.
- [x] FR-001–FR-008 and SC-001–SC-003 map to future FE, BE and integration tasks; every implementation checkbox is unchecked.
- [x] Fixed Owner/Member, one workspace and existing offer/membership entities remain approved; no new policy matrix, password store or role subsystem.
- [x] Exact schemas, revisions, delivery uncertainty, invalid/replayed offers and last-owner races have observable outcomes.
- [x] One006 session contract owns cookies/CSRF/callback transport; this plan owns only its typed invite binding and journey states.
- [x] Research rationale, data/interface mapping and validation guide are bounded sections of the existing plan, not duplicate schemas or trackers.
- [x] Real local mail/browser proof is required; historical005 BE evidence and future SMTP/cloud gates are distinct.
- [x] Shared-file serialization, resource lifecycle and isolated preview protection are explicit.007 depends on006, not008/009.

This checks requirements/design quality only. Final packet link/task/preservation results are recorded in006's planning handoff; no runtime or independent-review claim is made here.
