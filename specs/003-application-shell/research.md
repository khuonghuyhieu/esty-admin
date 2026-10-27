# Design decisions and reference evidence

Date: 2026-10-27. This planning slice uses the actual public Application reference and existing repository constraints; no new library/version research is needed.

| Decision | Rationale | Alternative deferred |
| --- | --- | --- |
| Complete reference frame first | Latest owner direction explicitly prioritizes all visible components | Starting with Etsy Orders/Detail and dropping sample panels |
| Sample content, visibly labeled | Calibrates layout without inventing business metrics/identity | Real Etsy data or invented operational statuses |
| Local preview `/application` | Separate review surface while public routes remain stable | Replacing `/` or adding another frontend/project |
| Keep every reference control, disable unsupported actions | Rendered reference does not establish most hidden interactions | Inventing dialogs, exports, notification/auth workflows |
| Enable only local table/drawer/menu interactions | Makes review testable without backend scope | Calling feature 001 or adding mock network endpoints |
| SVG chart and existing assets | No chart/UI dependency is required for this small fixture | Installing a component framework or chart library |
| Fix mobile overflow | Observed 390px viewport had 845px document width | Pixel-copying an inaccessible mobile defect |

Evidence: actual full desktop screenshot visually inspected, rendered text/control inventory read, mobile captured, row menu opened. Filters, Table settings, New board and Notifications clicks yielded no newly visible text; no missing dialog design is inferred. Use plan's inventory and UI contract. No paid TypeUI export, MCP entitlement or source ownership is claimed. Recapture upstream screenshots during implementation; investigation files are temporary local evidence.
