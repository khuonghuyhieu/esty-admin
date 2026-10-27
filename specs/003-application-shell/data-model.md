# Display fixtures and transient state

No persistent model, schema, migration or API DTO is introduced. Types live in the preview feature only; they must not become a duplicate backend contract.

| Entity | Fields and constraints |
| --- | --- |
| Workspace/profile | Synthetic display name, plan label, initials and profile name; explicitly sample identities |
| Metric | Stable id, label, value, optional trend/status, decorative icon/color |
| Chart point | Stable date label, nonnegative numeric strokes/session values; accessible data alternative shares the same fixture |
| Activity event | Stable id, category, title, description, time label; five reference entries and four category counters |
| Project | Unique id; icon; nonempty title/owner; nonnegative integer collaborators/strokes; updatedLabel and numeric updatedAt for sorting; status exactly Active, Review or Archived |
| Table state | Search string; status All, Active, Review or Archived; sort key strokes or updatedAt; direction ascending or descending; open row id or null |
| Shell state | Drawer open/closed; transient only, no persisted preference |

Use five reference project fixtures. Total default strokes: 17,540. Default project count: 5. Match reference initial row order explicitly rather than inferring it from the sample's sort arrows. Initial sort is unset; choosing a sortable header starts ascending and subsequent clicks toggle. Derive totals after search/filter; sort never changes totals. Search matches title or owner case-insensitively after trimming; search and status combine with AND. Display `In review` maps to stored `Review`. Numeric timestamp drives Updated sorting; never sort relative-time strings lexically. Stable id breaks equal sort values. These are UI-preview rules, not real order lifecycle definitions.
