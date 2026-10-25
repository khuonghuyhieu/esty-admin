# Feature specification: Developer website

Feature: 002-developer-website · Created: 2026-10-25 · Status: local implementation and external review T001–T008 complete; publication pending.

Source: the owner prioritizes a frontend website and public URL for Etsy developer registration. On 2026-10-25 the owner resumed local implementation, superseding the earlier docs-only phase. [ARCH-001](../architecture.md) owns stack decisions. This is a distinct deliverable from deferred feature 001. Preserve existing `main`; no new branch/worktree.

## User scenarios and testing

### Story 1 — Understand the application (P1)

As an Etsy reviewer or prospective seller, I can understand the proposed application, intended audience and fulfillment workflow without signing in.

**Independent check:** open the home page and find purpose, audience, planned workflow, supplier pilot and development status.

1. Given a visitor opens the home page, when they read it, then they can identify order review and BurgerPrints fulfillment preparation as the intended purpose.
2. Given integrations are not implemented, when capabilities are described, then planned behavior is clearly distinguished from working website navigation.
3. Given a narrow screen or keyboard navigation, when the visitor explores the page, then all content/links remain readable and reachable.

### Story 2 — Find privacy and contact information (P1)

As a visitor, I can read what this website actually collects, distinguish future shop-data handling, and find a confirmed contact before the site is used for registration.

**Independent check:** open the privacy page directly, follow its contact link and return home.

1. Given the informational website has no login, forms or analytics, when privacy information is read, then it accurately describes that behavior and any host request logging.
2. Given application data processing is still planned, when future use is described, then no approved scopes, retention period or deletion service is invented.
3. Given contact/operator facts are missing during development, when publication readiness is reviewed, then those missing facts are listed and the website is not called submission-ready.

### Story 3 — Share a verified public website (P2)

As the owner, I can share a stable HTTPS website URL for the actual developer registration flow and connect my existing domain when ready.

**Independent check:** open home/privacy directly from an unauthenticated session on the deployed URL; verify the chosen hostname and certificate.

1. Given website implementation passes local checks, when it is published, then both pages load publicly over HTTPS without reviewer login.
2. Given the existing domain is not configured yet, when a verified host-provided URL is available, then domain setup does not block obtaining the initial website URL.
3. Given domain configuration is performed later, when the final hostname is tested, then navigation/canonical links use the intended host and unrelated DNS services remain intact.

### Edge cases

- A direct privacy link works without first opening the home page; old privacy links resolve to the new page.
- Missing contact/domain facts are explicit publication dependencies, not invented public details.
- Unknown routes show a useful not-found page with a way home.
- Long text wraps on mobile; zoom and keyboard focus remain usable.
- Failed deployment, sign-in protection or unverified TLS/DNS prevents a successful-publication claim.
- Website availability is not evidence of app approval, authorization or a successful order-data request.

## Requirements

- FR-001: Provide an English home page describing purpose, audience, planned workflow and the BurgerPrints-only pilot.
- FR-002: Explain that own-shop and consenting-seller use is intended and external integrations are not yet active.
- FR-003: Provide an English privacy page with truthful current-site data handling and confirmed contact/operator information before submission-ready publication.
- FR-004: Keep home/privacy navigation and direct links functional; preserve compatibility with previous privacy links.
- FR-005: Support readable layouts at 360px and 1440px, visible keyboard focus, a skip link, semantic headings and reduced-motion preferences.
- FR-006: Provide accurate page titles/descriptions and the intended public hostname once known; preview URLs must not be presented as a different canonical production domain.
- FR-007: Provide a repeatable local startup and production build using documented root commands.
- FR-008: Publish home/privacy over HTTPS and verify unauthenticated access before reporting a usable registration URL.
- FR-009: Connect the existing domain only after the actual hostname, project and required DNS records are identified; preserve unrelated records.
- FR-010: Record verification and remaining dependencies in PROJECT_STATE; keep credentials outside public content and the repository.

## Success criteria

- SC-001: Home and privacy each return a successful response and all internal navigation/legacy privacy links resolve.
- SC-002: At 360px and 1440px, neither page has horizontal overflow and every link is keyboard-reachable with visible focus.
- SC-003: A fresh setup follows documented steps to start/build the website, with actual check results recorded.
- SC-004: Before submission-ready publication, the application name, operator/contact facts and privacy text have been confirmed; no invented facts or unimplemented action buttons remain.
- SC-005: The shared URL loads both pages over valid HTTPS without authentication, and its hostname matches the recorded deployment evidence.

## Assumptions and dependencies

- The existing site is a content reference; Fulfillment Workspace remains a working title until the owner confirms it.
- Website development does not require shop credentials, business data, supplier submission or completed backend/database connectivity.
- The owner has a domain at GoDaddy, but its exact name, DNS configuration and preferred root/subdomain are not supplied.
- Publishing requires access to the selected hosting account/project. Contact/operator facts and the final privacy wording are required before calling the result submission-ready.
- Current registration requirements must be checked on the actual Etsy flow when registration is performed; a website does not guarantee approval.
- The completed local increment covered T001–T008, including implementation, checks and external review. The owner's subsequent request authorizes FE commit/push to `main` and resumes T009–T010 Vercel deployment, subject to account/project access and confirmed publication facts. SC-004 human publication confirmation and SC-005 public HTTPS verification remain pending.

## Out of scope

Login, operational admin, shop authorization, order APIs, supplier exports, forms/analytics, payments, backend/database setup, credentials collection and actual Etsy application submission. DNS changes remain optional T011 and are not included in the current Vercel deployment request.
