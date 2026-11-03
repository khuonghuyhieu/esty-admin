# Specification Quality Checklist: Internal App Foundation

**Feature**: [spec.md](../spec.md)  
**Status: BASELINE_APPROVED — explicit owner BE source/local continuation.** Built-in Specify/Clarify quality artifact, not an independent review. Existing markers below are retained from the initial planning pass; mixed setup/FE/release criteria are not falsely checked by the narrower BE grant. The owner explicitly authorized independent BE implementation despite those deferred gates; do not ask the baseline again.

## Current scope gate

Owner approved one internal workspace, Owner/Member powers, controlled invite-only bootstrap, Supabase email/password/recovery and minimal names/read-only Auth email. Current BE source/local may proceed after scoped consistency; exact install/fixture/contract actions need their receipts. Actual owner identity, sender/SMTP, retention and FE/production integration remain separate gates. The historical checklist has14 items,10 checked/4 unchecked; that is not a claim that all full-feature production prerequisites are satisfied.

## Historical planning quality review

## Content quality

- [x] CHK001 The real internal-foundation goal, planning-only write boundary and explicit exclusions are stated without treating feature004 previews as approved policy or production data.
- [x] CHK002 User stories describe observable sign-in/session, admission/team, recovery and settings outcomes; technical proposals are distinguished from owner decisions.
- [x] CHK003 Supabase identity/session ownership is separate from app profile and workspace membership; no own password store is proposed.
- [x] CHK004 Official documentation is cited in research with actual-project configuration and runtime verification limitations stated.

## Requirements and acceptance

- [x] CHK005 Capability/default-deny, foreign-object access, current membership, last-owner concurrency, bootstrap replay and invitation failure cases are specified.
- [x] CHK006 Cookie/CSRF/session-revocation tradeoffs and the existing technical bearer boundary are explicit; no browser technical key or unauthenticated credential proxy is proposed.
- [x] CHK007 Minimal settings/audit, migration provenance and current-schema-only incompatibility are stated without silently authorizing setup or DDL.
- [x] CHK008 Functional/Nest HTTP+DB/local Auth/browser E2E/hosted evidence levels are distinct, with no mock or documentation completion claim.
- [x] CHK009 The single open decision register identifies six unresolved owner/technical choices in three clarification groups; no owner answer or approval provenance is invented.
- [x] CHK010 Proposed implementation tasks are dependency-ordered and unchecked, with owner approval gates before any source/Auth/cloud/migration work.

## Deliberately unresolved implementation-readiness gates

- [ ] CHK011 D01/D02 role/capability and workspace policy is approved; illustrative Owner/Member or feature004 role labels are not approval.
- [ ] CHK012 D03/D04 bootstrap, email/invitation/recovery, session/cookie/revocation and hosted caller flow is approved.
- [ ] CHK013 D05/D06 fields/retention, privileges/dependencies, canonical contract ownership and schema-changing delivery handoff are approved.
- [ ] CHK014 All clarification groups are resolved and a new explicit source/local implementation scope is authorized. Current status is owner policy review only.

## Workflow limits

Clarification questions were already sent by the coordinator; this author sent none and recorded no answers. Generic Spec Kit branch/agent/setup steps were adapted to the explicit sole-writer, new-documents-only task. A successful document prerequisite check does not resolve CHK011–CHK014. Read-only consistency findings are reported in the handoff; there is no claim of independent review, application test, cloud setup or production readiness.
