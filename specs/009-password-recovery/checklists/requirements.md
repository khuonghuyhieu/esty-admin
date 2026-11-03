# Specification Quality: Password Recovery

**Planning-only**, not implementation/security acceptance. [Spec](../spec.md) · [plan](../plan.md) · [tasks](../tasks.md).

- [x] US1 real request/email/typed verification and US2 password/global revocation/fresh login are complete observable journeys.
- [x] FR-001–FR-008 and SC-001–SC-003 map to future FE/BE/integration tasks; every implementation box remains unchecked.
- [x] Current Owner/Member/workspace policy stays unchanged; no membership activation, password store, owner-reset or new Nest password operation.
- [x] Generic initiation, invalid/expired/replayed/wrong-purpose challenges and explicit provider outcomes have bounded behavior.
- [x] Password-change and global-revocation acknowledgements remain separate; unknown outcomes and completion-only retry cannot become false success.
- [x]006 owns the sole cookie/CSRF/generation/callback transport; recovery cannot promote directly to an admitted session.
- [x] Plan embeds bounded rationale/model/interface/validation sections; actual provider/mail/browser evidence remains future work.
- [x] Only006 and recovery's own local callback/mail setup are feature prerequisites;007/008 and production SMTP/owner/retention are not local blockers.
- [x] Exact files, shared-helper serialization and inherited resource lifecycle preserve preview3000/session6634/default `.next` and005 baseline.

Final cross-feature link/task/preservation results are in006's planning handoff. No runtime, new reviewer or owner acceptance is inferred from this checklist.
