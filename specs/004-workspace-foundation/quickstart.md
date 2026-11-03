# Workspace Foundation Preview Validation Guide

This guide is for the future UI-only implementation handoff. It does not authorize or claim real login, account management, API access, or persistence.

## Prerequisites

- Use the existing Node/npm workspace and browser-test setup documented in the root README.
- No real credentials, provider access, API keys, environment variables, or database are required.
- Keep all people, roles, and settings in clearly labelled synthetic fixtures.

## Preview acceptance scenarios

1. Open `/login`; validate required fields and email format; submit valid-looking values and confirm the page says sign-in is not connected.
2. Open `/application`; navigate to `/settings/team` and `/settings`; return to the dashboard using the application navigation.
3. Search the sample member list, inspect the no-results state, then reset to the full list.
4. Open the Roles tab; confirm example roles/permissions are read-only and labelled illustrative.
5. Edit a sample setting; confirm it is labelled unsaved and resets after reload.
6. Inspect disabled account, role, invite, and sign-out actions; each has a nearby explanation.
7. Repeat keyboard navigation and layout checks at 1440×1000, 390×844, and 360×800; verify no page-level horizontal overflow.
8. Confirm the preview makes no API requests and writes no cookies, localStorage, or session storage; public routes and `/connectivity` remain unchanged.

## Existing web checks after implementation

Run the affected checks from the root README after the implementation handoff:

```sh
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

The E2E command builds and serves the production app on loopback. Do not run it concurrently with another web build/server using `.next/`. No test or build has been run for this planning draft.
