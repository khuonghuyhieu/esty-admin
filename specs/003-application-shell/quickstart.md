# Validation guide: Application frame

Status: Local functional and production-browser validation passed; the coordinator's separate read-only `gpt-6-luna` review completed with no actionable findings. Owner visual acceptance remains pending. Use [README](../../README.md) for canonical Node setup, frontend startup/check/test commands and the local comparison gallery. No new install, environment variables, API server, database or cloud credentials are required by this feature. If existing dependencies are unavailable, record the blocker and coordinate any install first.

1. Start the verified production build with the existing README command and open `/application`; home/privacy remain separate and unchanged.
2. Check C01–C10 from [plan.md](plan.md#component-inventory), including all controls below the fold and the sample-data banner.
3. Search by title/owner, combine a status, sort each supported column and verify visible rows/count/strokes. Search for no match; reset restores five projects and 17,540 strokes.
4. Open a row menu, inspect all four disabled actions, then dismiss by Escape/outside click. Inspect explanations for other disabled controls.
5. At 390×844 and 360×800, open/close the sidebar with keyboard, reach every column through table-region scrolling and verify no document overflow. Inspect 1440×1000 desktop, reduced motion and 200% text enlargement too.
6. Run affected functional tests and production E2E using existing README commands, including public-route regressions and preview noindex checks. Record actual commands/results, not this checklist as proof.
7. Capture same-viewport reference/implementation comparisons, menu and drawer states; record all material differences. Obtain the separate scoped Luna review and explicit owner visual acceptance.

Screenshots and test reports remain ignored. Local preview success does not authorize publishing this unauthenticated fixture route or establish an Etsy/API integration.
