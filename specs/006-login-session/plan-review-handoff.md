# Four-Feature Planning Handoff

**READY_FOR_OWNER_PLAN_REVIEW — planning complete, implementation NOT started or authorized.**

This is the requested final evidence receipt, not a new feature, umbrella tracker or acceptance of implemented/security-tested behavior. Current sole writer is existing OMP t4q; delivery targets are coordinator t4v and owner coordinator t4y. Their reconciled four-feature direction supersedes the old monolithic005 proposal. Retired TUI addresses are not used for execution.

## Deliverables and dependency boundary

| Feature | Purpose and dependency | Tasks | Story-task counts |
|---|---|---:|---|
| [006 Login/session](plan.md) | Login→actual Auth→current me/membership→protected app→refresh/local logout; first feature |16|US1:4; US2:5;7 foundation/acceptance tasks|
| [007 Team/invitations](../007-team-invitations/plan.md) | Owner offer→real email/new or existing recipient→explicit admission; role/status; depends006 |16|US1:6; US2:3;7 foundation/acceptance tasks|
| [008 Account/workspace settings](../008-account-workspace-settings/plan.md) | Separate revisioned self/workspace saves, reload/denial/audit; depends006, not007 |12|US1:2; US2:3;7 foundation/acceptance tasks|
| [009 Password recovery](../009-password-recovery/plan.md) | Typed recovery→password→global revoke→fresh login; depends006+own mail/callback, not007/008 |14|US1:3; US2:5;6 foundation/acceptance tasks|

Each completion unit is FE+BE+integration for the entire user journey. All58 implementation tasks remain unchecked.007–009 embed bounded research rationale, model/interface/state mapping and validation guides in their plans; they reference006 rather than clone its transport artifacts. No second OpenAPI, permission baseline, duplicate tracker, new business module, password store or new dependency is introduced.

## Read-only Spec Kit analysis receipt

The four complete spec/plan/tasks sets and constitution were checked after generation. Under the explicit no-Git/no-runtime scope, direct document inspection replaced helper scripts that might invoke Git or persist the shared pointer. No extensions configuration exists; no hooks, reviewer, agent or application check was run.

| Category | Result |
|---|---|
| Requirements / tasks |44 FR/SC requirements,58 sequential feature-scoped tasks,100% explicit task coverage|
| Stories |8 stories, each has independent user-visible acceptance and mapped story tasks|
| Orphans / references |0 uncovered requirements;0 unmapped tasks;0 invalid requirement references;0 duplicate/out-of-sequence task IDs within features|
| Task state / format |All58 unchecked; story labels precede lane labels; concrete paths and dependency/parallel restrictions present|
| Links |85 local Markdown file links resolve, including18 checked heading fragments across20 planning documents|
| Missing decisions / duplication |0 unresolved planning placeholders; no blocking conflicting requirement or duplicate authoritative contract identified|
| Constitution |No identified conflict: one FE/API/history, approved policy, English artifacts, whole-journey evidence, no scope expansion|
| Cross-plan interface |One006 cookie/CSRF/generation/allowlist contract;007 invite and009 recovery purposes remain distinct;008 mutations use the same boundary|
| Ownership / lifecycle |Shared session/config/menu/CSS/E2E writes serialize; future owned fixture/API→web→reverse cleanup is explicit; preview3000/session6634/default.next reserved|

These are documentation-integrity results, not test/build/security/browser proof or independent review. Checked requirements checklists concern planning quality only. Runtime grants remain absent.

### Requirement coverage

| Feature | Requirement | Mapped task IDs |
|---|---|---|
|006|FR-001|T002, T003, T005, T006, T007, T008, T011|
|006|FR-002|T006, T007, T008, T010, T014|
|006|FR-003|T004, T005, T007, T009, T012, T015|
|006|FR-004|T004, T005, T009, T012, T015|
|006|FR-005|T009, T010, T011, T012, T013, T015|
|006|FR-006|T002, T004, T005, T006, T007, T009, T012, T013, T015|
|006|FR-007|T003, T009, T010, T011, T012, T013, T015|
|006|FR-008|T001, T002, T003, T008, T011, T012, T013, T014, T015, T016|
|006|SC-001|T001, T005, T006, T007, T008, T009, T010, T013, T014, T016|
|006|SC-002|T001, T004, T005, T008, T009, T010, T011, T012, T013, T014, T015, T016|
|006|SC-003|T001, T004, T006, T007, T008, T010, T012, T013, T014, T015, T016|
|007|FR-001|T003, T004, T010, T012, T013|
|007|FR-002|T002, T003, T004, T005, T009, T013|
|007|FR-003|T002, T006, T007, T008, T009, T013|
|007|FR-004|T002, T006, T007, T008, T009, T011, T013, T015|
|007|FR-005|T002, T003, T010, T011, T012, T013|
|007|FR-006|T001, T003, T006, T007, T008, T009, T010, T012, T013, T015|
|007|FR-007|T003, T004, T005, T007, T008, T009, T010, T012, T013, T015|
|007|FR-008|T001, T002, T006, T009, T011, T012, T013, T014, T015, T016|
|007|SC-001|T001, T002, T004, T005, T006, T007, T008, T009, T014, T016|
|007|SC-002|T001, T002, T003, T004, T008, T009, T010, T011, T012, T013, T014, T015, T016|
|007|SC-003|T001, T003, T004, T005, T006, T007, T009, T010, T012, T013, T014, T015, T016|
|008|FR-001|T003, T004, T005, T006, T009, T010|
|008|FR-002|T002, T003, T004, T005, T009|
|008|FR-003|T002, T003, T006, T007, T008, T009|
|008|FR-004|T003, T004, T006, T007, T008, T009, T010|
|008|FR-005|T003, T004, T005, T006, T007, T009, T010|
|008|FR-006|T001, T003, T004, T005, T006, T007, T009, T010, T012|
|008|FR-007|T002, T008, T009, T010, T012|
|008|FR-008|T001, T002, T008, T009, T010, T011, T012|
|008|SC-001|T001, T002, T003, T004, T005, T006, T009, T011, T012|
|008|SC-002|T001, T002, T003, T005, T006, T007, T008, T009, T010, T011, T012|
|008|SC-003|T001, T004, T005, T006, T007, T009, T010, T011, T012|
|009|FR-001|T003, T004, T010, T011|
|009|FR-002|T004, T005, T010, T011, T013|
|009|FR-003|T002, T006, T010, T011, T013|
|009|FR-004|T002, T007, T008, T009, T010, T011, T013|
|009|FR-005|T001, T002, T008, T009, T010, T011, T013|
|009|FR-006|T001, T003, T005, T006, T007, T008, T010, T011, T013|
|009|FR-007|T003, T005, T006, T007, T008, T010, T011, T013|
|009|FR-008|T001, T002, T004, T009, T010, T011, T012, T013, T014|
|009|SC-001|T001, T002, T003, T004, T005, T006, T007, T008, T009, T010, T012, T014|
|009|SC-002|T001, T002, T005, T006, T007, T008, T009, T010, T011, T012, T013, T014|
|009|SC-003|T001, T003, T004, T005, T006, T008, T010, T011, T012, T013, T014|

## Evidence and unresolved execution limits

Accepted005 BE evidence is reused, not rerun: config/HTTP28/28; real GoTrue→Nest→DB9/9 and affected concurrency9/9; coordinator-accepted scoped review with no confirmed actionable findings. Independent reviewer runtime model/session identity was not exposed. The completed FE read-only gap inventory from t4x was reused; no duplicate FE audit. Existing004 visuals are accepted sample UI, not connected identity/settings/team behavior.

- FE generated consumer is still health-only, SHA256 `8159554985609ca68a2e9881a5345a162c4f92b1bfce59557cf3bc09caaf49b0`; no semantic version is inferred from prose.006 must regenerate it during later implementation.
- Cookie sizes, required browser primitives, SSR/cache isolation and late-response/refresh/logout ordering are selected designs, not tested guarantees. They require functional and real local Auth/browser proof.
-007/009 require an actual local TokenHash/type template and restricted callback flow. No default fragment fallback. Hosted SMTP, callback configuration and query-redaction proof remain separate later gates.
- Password-update and global-revocation uncertainty remain distinct;009 must prove old-session denial. Accepted005 did not exercise non-NULL Auth session not_after; no new claim closes that boundary.
- No substantive baseline product question remains for these plans. Actual owner identity, retention and production sender choices do not block synthetic local implementation. Secure configuration delivery, exact implementation/file/resource grants and local template proof are still required before execution.
- Production activation depends on the single [001 versioned migration-delivery prerequisite](../001-connectivity-foundation/plan.md#future-versioned-production-migration-integration--plan-only). Current schema-only rejection of005 tables remains correct; no local readiness or planning checkbox closes hosted/cloud release.

## Proposed NEXT006 implementation scope — not START

Propose one explicit later grant for006 T001–T014: FE generated consumer and server-only fixed-origin caller/cookie/CSRF/context/begin/login/me; current guards and sanitized identity on the existing app routes; coordinated refresh and local logout; affected functional plus actual production-browser evidence. BE supports only existing contract/current-session behavior and the granted fresh synthetic fixture, with exact confirmed-defect changes requiring coordination. No007/008/009 operational implementation is bundled into006.

First observable journey: real login→current membership→protected Application→explicit local logout and old-token denial, with401/403/503, CSRF, cache isolation, expired refresh, two-tab/two-user and late-response proof.006 finishes only after its full refresh/logout/security acceptance, later separately authorized coordinator review T015 and handoff T016; no reviewer starts now.

Before runtime, agree one integration owner and fresh nonce/resource lease: DB55440/Auth55441/Mail55442/API55443/web55444 are proposals only, subject to conflict checks. BE owns fixture/API readiness and cleanup; FE owns web/browser and isolated `.openai/app-session-<nonce>` output. Preserve owner3000/session6634/default `.next` and all shared services/volumes. No installation, root-lock edit, owner-secret read, provider/cloud action, Git or deployment follows from this handoff.

## Current planning file manifest

The following20 documents comprise the planning packet. This receipt is the21st file and is excluded from its self-containing hash list; its digest is supplied in the delivery message. All manifest paths are linked, including supplemental model/research/checklist documents.

| File | SHA256 |
|---|---|
|[specs/006-login-session/checklists/requirements.md](checklists/requirements.md)|`6a3aa1aacf9260f1824764023d1860217c5a34400d856add7d48f1e21785928c`|
|[specs/006-login-session/contracts/session-bff.md](contracts/session-bff.md)|`56783ee83ab9ba489c218bc813038c9db5d4cb2507447033e6c7a13169f24495`|
|[specs/006-login-session/data-model.md](data-model.md)|`b96d9ed9a65220ec6583c71d3a17eb762efa8a9b23647c913011c5664a07fe1a`|
|[specs/006-login-session/plan.md](plan.md)|`a2b3ce5f397d0f3b62656995f18d39d0c5b175dd59a40f337462e254cd1eba8e`|
|[specs/006-login-session/quickstart.md](quickstart.md)|`8fdfff21608211d3d62f30dc0176f3daadf06dfd97f4c5f480214e16211feee2`|
|[specs/006-login-session/research.md](research.md)|`dc9f8f66aa7ee058616c02c725ff6f42f9024aa087ce902df0990422e32706c4`|
|[specs/006-login-session/spec.md](spec.md)|`acba9dc5369944b7e29cc8d2fca1c6faebbf9f9dff56f4fcb489f973f2ac3192`|
|[specs/006-login-session/tasks.md](tasks.md)|`8612040b1bb4ec19dcefdce72b7571ad149928071fa8e3fec86f2c3fabb6074f`|
|[specs/007-team-invitations/checklists/requirements.md](../007-team-invitations/checklists/requirements.md)|`7b24ba9c7d84c2b28c7d6a422d47238be7a792a2a77808bd4482608da8a52cb5`|
|[specs/007-team-invitations/plan.md](../007-team-invitations/plan.md)|`6d9a0483cce12d5e9d8aa2d507daaad8e4b5c086f226f6476dc5929a820a1e3b`|
|[specs/007-team-invitations/spec.md](../007-team-invitations/spec.md)|`1f745ee9a3843c152fc2b71dadfd8889a8055c96fd94a1e79c22300970f4f785`|
|[specs/007-team-invitations/tasks.md](../007-team-invitations/tasks.md)|`802ff9951f383616d48287bc7d9bbd0959a6ac3c327280b2ca9c781aefb47329`|
|[specs/008-account-workspace-settings/checklists/requirements.md](../008-account-workspace-settings/checklists/requirements.md)|`183344318c8e9260327575a439ecbba2b5e2fe2cae716a518f89671131637e0b`|
|[specs/008-account-workspace-settings/plan.md](../008-account-workspace-settings/plan.md)|`f7299c28f1b123a31e23e33fe700af3a390f819f434ce2ef351922f9ace9d5d4`|
|[specs/008-account-workspace-settings/spec.md](../008-account-workspace-settings/spec.md)|`99bc3c728078dd9fd4cbd73ecea9996e1b812a22926cf39474c777b82d6e37f3`|
|[specs/008-account-workspace-settings/tasks.md](../008-account-workspace-settings/tasks.md)|`d2477e04988b413c300a404a3a09410228bc5a1bb75b3abaac91c205e318d33b`|
|[specs/009-password-recovery/checklists/requirements.md](../009-password-recovery/checklists/requirements.md)|`627cf2e9bff1d9630f08ebf8cc62a6265f8785f594b01455d81e20714b2a9983`|
|[specs/009-password-recovery/plan.md](../009-password-recovery/plan.md)|`dcfb647f051cca6079349fe35eadc74f94654a15f04eb1918b180d0547aeae90`|
|[specs/009-password-recovery/spec.md](../009-password-recovery/spec.md)|`992a9e54a04ba2461c858e360c220e843555c81fe1ae2a5805eb7b80d541e545`|
|[specs/009-password-recovery/tasks.md](../009-password-recovery/tasks.md)|`fbae58b22157f526d0b1e920c00cab1dae142d14f63693279c15be6fc2ab09cc`|

## Exact preservation result and diff boundary

Captured68 explicitly scoped public-file hashes before resumed writes and compared them after authoring:68 unchanged,0 changed-file/hash differences. All34 accepted BE source/config/contract/lock hashes match005's frozen manifest. Canonical OpenAPI remains0.4.0 with14 operations (2 health +12 app), SHA256 `41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad`.005 quickstart remains `c03eb4e281ca69c91ee3ceb486158fba5185ef0b92ec7d0ec322765d4865b230`.

The unchanged per-file digest below is BOTH the before and after value; therefore no content diff exists for this bounded preservation set. This is not a whole-repository/clean-tree claim, and no Git command was used. No unrelated/concurrent changes were reverted. Only006–009 documents were written; README/STATE/001/003/004/005/AGENTS/architecture/pointer and source remain outside the write scope.

```text
767916a00b235e9f8e6bdcd0afeeaccd00a9550e66a2b91a1509a18acfa3344f  .gitignore
3dba5372b0dd22ba2a044fcfb2ec1355fbc364e1a45f060025041294a0d2335b  .specify/feature.json
a2534560d2385559d9ea8e728497954fe91814610d13e0d35e0d062e67e6483f  AGENTS.md
348455fb56458ed4620f5385c670231172eefcf72d247cc252f7828ad49004b7  PROJECT_STATE.md
b5fe19fe3055b137ce1eac8d0a4efcad4362669409b99b5ed23c6c461b6e8897  README.md
76d8d9f4cddf46eb6e4cb334db5211c5ab8c71afddab86c26964212a83e71b9c  apps/api/.env.example
4416736cb809720359dd0d650a3d530e6c3836be683f7c1700a8da8138df9608  apps/api/migrations/1792972800001-app-foundation.mjs
49316100a5c98a852ef28ccb99d6e2a4306da9d5baf9631d4643a26d9d1c82f2  apps/api/migrations/1792972800002-app-session-check.mjs
c28c17d8d81209dabb55d18aef4126ecd091643341fe9ded069b5a9980023321  apps/api/package.json
46c63a04eeeb64d2fb425a12383e35513f569b95f63c5277335c7facba911ce2  apps/api/scripts/app-fixture-diagnostics.mjs
650b91d96836087c4ea7483636e83344f7b5257c77031519ad1927196efb576c  apps/api/scripts/app-fixture-forward.mjs
61a751f236cb3e892b60c15b2944d746ae99949e3f63acbc076a0a00960cd049  apps/api/scripts/app-fixture.mjs
a5f669e1db4de727783804c85d31e26b8c57adb2e9a3161cbe63613f939eaa27  apps/api/scripts/bootstrap-app-owner.ts
fd2042985fb03b8f8d708dec17fb5ef25d38a5d06d271f099d61b458aa1b82c8  apps/api/src/app-foundation/adapters/auth-admin.ts
902161ca29a96ff3d514e15a3bc079f7bd46c20bbd8e2f1b7b40541986abb083  apps/api/src/app-foundation/adapters/auth-http.ts
f47e5e4a528842698751cffce592789e63999f83194004cd91f8702a5b84fa38  apps/api/src/app-foundation/adapters/auth-verifier.ts
cc88094692b293ea86063261d0181533ee0f5f6b2ceceef9290dd5296609d0dc  apps/api/src/app-foundation/adapters/postgres.ts
44e83f355407ea99d14d3f11b622a8a5d4549e7499cee18172e78c5a804e7281  apps/api/src/app-foundation/application/errors.ts
cb910f7e6030953ba7d64f49bf814066b364a248d625dae894f7b4983f91d133  apps/api/src/app-foundation/application/policy.ts
9dc8206737976d2c23bd52cf3c6d766387fce7589f37930ae6312e04ddaa6b87  apps/api/src/app-foundation/application/service.ts
5d71fd7e2b16c965aa491f6a554ebe55e54bb28650af20a84352c87801a75f7d  apps/api/src/app-foundation/application/validation.ts
0ac9a5d96497450b6a35446ec6f79ce3a85700035226681ec22284dab7d115cc  apps/api/src/app-foundation/transport/auth-guard.ts
3e0838a722e149db141650c69a09988ed668e79778e5ed1279b6a28db65085c8  apps/api/src/app-foundation/transport/controller.ts
22c6988f5dbdb8425a838c3c2e9eccba0cb1d51b4fd14fb11fa5b6ec967ce56f  apps/api/src/app-foundation/transport/error-filter.ts
3fe21eb79dbb98bd7a1278ddfbd279184f1380305e920de17adee144f421b829  apps/api/src/app.ts
24562199f35df0e109f3fed1668204f56c78cb81a03d25a67be7c3cf09396193  apps/api/src/config/config.ts
8b034332a1600addef3025fd173f4a016f6d1382486b6119fdfb688fdff6551c  apps/api/src/generated/api.ts
4d7efc2678976bbadc4c0f2ac063bb47cbf260d88596b57c4c6713e014c34c4d  apps/api/src/generated/migrations.ts
bd60f5e9dfaaa857d8014dba53a00416ac3ef9b53ef31968a7d7c24bafb7a534  apps/api/tests/app-auth-fixture.ts
8f2cef5c2ee001832db28a6d37414963081ba80a22082f1f7d7239300d9e91fc  apps/api/tests/app-fixture-lifecycle.ts
b0c36d9f30066aab02dddc171949b59c3a0daa99919ddcd54e9655b426b905bc  apps/api/tests/app-foundation.integration.test.ts
abee5407a8abd32a65f4970058084d017156a471cf766d331456fb7e3cffca8f  apps/api/tests/ci.test.ts
38aee6b492b80481c53cb897935aa654edd579d9682e1516248968816b9fac8b  apps/api/tests/config.test.ts
e25fe62b640551db1649b25166bd315cb91850d27be224b7b108f5f144428a98  apps/api/tests/fixtures/auth-compose.yaml
5b64668c94203629b147d4b4c7630845b1dbd945d179c590eafded49d748479d  apps/api/tests/fixtures/init-auth-db.sh
253c86a1ecc62571a5f5ab878571dd02907d13408b7fb100f5fd314828cbec87  apps/api/tests/http.test.ts
e8fd5a7a3db2ae89526a010f8931af91ad6a4e8e88cb7337c5a38774d68f2ae7  apps/api/tests/integration.test.ts
8159554985609ca68a2e9881a5345a162c4f92b1bfce59557cf3bc09caaf49b0  apps/web/src/lib/api/generated.ts
9adc8ee3cba05ffcfdf85439b804cdf3f70935585cb55c4453b3f217fb63e088  package-lock.json
5e514d5e822305dda595914446be8f453f90f224a01821bccf1441b3bb04f4bf  package.json
41bc4c5f0b93085fae607b680a823a32038e07e8b8512fef54223b2d2fc333ad  specs/001-connectivity-foundation/contracts/openapi.json
fb7510cc4e2b96cf38b9029365c6bfec5a60300d8a6fe3da37203be8bae5c369  specs/001-connectivity-foundation/plan.md
03763e7f0c42dff9cb9234700b81a9a75ecad42b1c4603cbfe2926a906731d47  specs/001-connectivity-foundation/tasks.md
1e7cf17dad3e900f6a1d7a64bc1d56eac766f8543b91c4470ab021260cad48b7  specs/003-application-shell/checklists/requirements.md
f091e24eef037ac9b6248549807b25ca4f3953f3cf1d94be57b6712e89ea11e1  specs/003-application-shell/contracts/ui.md
68f0b8cac19dac1de817146d77a862484f659bcbe7ca2d83daa1c84755b61b7a  specs/003-application-shell/data-model.md
b3b3044658fc45883b8fbf70379a9a895670b8b207ce20ce599817bdad5994b2  specs/003-application-shell/plan.md
90970999d6ad5c3d407da1875553d425fa4e7d6d77e5959202c5d47e9fcbe4dd  specs/003-application-shell/quickstart.md
02274a4753fe63dabf023d052868ab0703f3664e522060b27b23812daad0a755  specs/003-application-shell/research.md
44b1019bcdc0f11e10fedd5099c583934285d374124dc25d4117ba6eceb97437  specs/003-application-shell/spec.md
927f153600fc459875580ce6ad5c6cfcdad5b6d13320d9aa0759e49a068c0003  specs/003-application-shell/tasks.md
14c4b340d27092ae58610f25d35bea241f11dfdf8e0debf5403af9567a8b42a7  specs/004-workspace-foundation/checklists/requirements.md
bcc9d7bcdf90aa935bbdde55c5fe9172128055b4930a5c8a38dd789f776ecba5  specs/004-workspace-foundation/contracts/ui.md
7fc3fef6bd471308118e738c2a486a27d6f4335a82dbc4faaab30f7aef06ffac  specs/004-workspace-foundation/data-model.md
2fe592e1b921358e992f409e46a722ded0c1968364c8e31ca9c8bff7840c1d38  specs/004-workspace-foundation/plan.md
96d593db427e4563165d6471dead7b1ad403b0df91d4cf95582fa409e6e7573d  specs/004-workspace-foundation/quickstart.md
8d7c7d3bf0a45b50140f724ad01dff012ae0a151920d9528b4b7340dc3f61d20  specs/004-workspace-foundation/research.md
5ebbf6318323b248b71203429eb9a2d0651301bce01ed22ea1fb3b05a5d150a0  specs/004-workspace-foundation/spec.md
53d83ae437ab6f221d7304e2f95e08be9e7e7cdd876fa777ad77924433bae886  specs/004-workspace-foundation/tasks.md
ce62c50059b80ef5d9cf64b40fb1177d00d17ca8bc51fb781d02382dce6c1943  specs/005-app-foundation/checklists/requirements.md
dbe286c8008087c1c132c7fc63dd58950df08f254c2f073e4ed91e571f6f1405  specs/005-app-foundation/contracts/proposed-api.md
d6615875102d432f9547a145215f08ad2e37c943e865f412159e66e9d48dd3d2  specs/005-app-foundation/data-model.md
cbb690a95acf6703bf468a2ffaa9f1f34a9e4cbdf0edb6c1e9dddb441b045406  specs/005-app-foundation/plan.md
c03eb4e281ca69c91ee3ceb486158fba5185ef0b92ec7d0ec322765d4865b230  specs/005-app-foundation/quickstart.md
5c8ad09b29ee97e7dfc22b42c08bfa5e1c9b9ae11c909b9b4861efe17fbc6178  specs/005-app-foundation/research.md
d583fcc474e60a393e81cdbf410504573c2d0d29938a3ed1c1a861f45a0a954f  specs/005-app-foundation/spec.md
7a959be0f2a681248127a3f755d25e6e9282f2c82fedd0e3486aa70e6eafc582  specs/005-app-foundation/tasks.md
f0521d4fc5802e1a2c63bd6cc7ec408053223afdfd9f0a1afc64f225d6bbb48a  specs/architecture.md
```

## Stop boundary

READY_FOR_OWNER_PLAN_REVIEW; STOP WRITES after this evidence handoff. Owner plan acceptance and a future exact implementation/resource grant are distinct. Send this sanitized receipt to t4v and t4y through hc; if permission-blocked, do not force or answer dialogs, report this path instead. No repeated status polling or duplicated coordination/audit work.
