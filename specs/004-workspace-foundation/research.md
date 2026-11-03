# Research: Workspace Foundation UI Preview

**Date**: 2026-11-02  
**Status**: Read-only repository review; no external service was contacted.

## Decisions

### Keep this increment UI-only

- **Decision**: Build a labeled visual preview for login, team/roles, and basic settings, and connect those routes to the existing dashboard frame.
- **Evidence**: The owner asked to review common dashboard UI first and brainstorm the business-flow UX after To do FE works on it.
- **Boundary**: No real sign-in, permission enforcement, API request, account provisioning, persistence, or integration is part of this preview. A visual preview does not establish security.

### Reuse the accepted Application treatment

- **Decision**: Keep the existing dashboard layout and observed Doodle-style application treatment. Add only the foundation navigation destinations and new preview screens.
- **Evidence**: Feature003 records the accepted paper/sketch outlines, shadows, peach accents, readable sans-serif typography, mobile drawer, and responsive table behavior.
- **Alternatives considered**: Redesign the shell or apply generic Doodle tokens over the accepted reference. Neither matches the owner direction.

### Use synthetic examples for unapproved account concepts

- **Decision**: Use small synthetic members, roles, statuses, and account/workspace values with explicit sample labels. Do not treat Admin/Operator/Viewer examples as an approved access model.
- **Interaction**: Search and form state may work locally for demonstration; changes do not persist and reset on reload. Unsupported account, role, and sign-out actions remain disabled with explanations.

### Defer business story UX

- **Decision**: Do not design order KPIs, store state, catalog mapping, supplier routing, or fulfillment statuses in this increment. Resume that discussion with the owner after the foundation UI handoff.

## Repository evidence and constraints

- Existing routes are `/`, `/privacy`, `/privacy.html` redirect, `/application`, and `/connectivity`.
- `/application` is a sample-data UI preview and already supplies the accepted visual frame. The sample identities and whiteboard metrics must not be presented as real business data.
- Feature001's OpenAPI remains a health/connectivity contract. This feature makes no API call and does not modify feature001.
- The repository already has Node functional tests and a production Playwright E2E suite; reuse them without adding dependencies or duplicate frameworks.
- `.specify/feature.json` remains pointed at feature003. Feature004 helper calls use command-local `SPECIFY_FEATURE_DIRECTORY` with `SPECIFY_FEATURE_NO_PERSIST=1`.
