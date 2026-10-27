# UI preview interaction contract

This is a user-interface contract, not a new HTTP/OpenAPI contract. All activity is local and synthetic.

| Control | Observed reference | Planned preview behavior |
| --- | --- | --- |
| Dashboard | Selected sidebar entry | Link to preview overview anchor |
| Other sidebar entries | Boards/Templates/Team/Settings, mostly `#` destinations | Preserve labels/icons/badges; disabled with shared preview explanation; no invented screens |
| Mobile sidebar trigger | Open sidebar control present | Open modal drawer; label, focus containment, Escape/backdrop dismissal, focus return |
| Workspace, notifications, profile | Visible header controls; no new notification text observed on click | Render matching controls disabled; explain unavailable preview actions |
| Header search | Search boards input | Search same fixture projects as table search; shared query, visibly synchronized |
| Table search | Search projects, owners input | Trimmed case-insensitive title/owner match; combines with status filter |
| All/Active/In review/Archived | Status radio group | Filter fixtures; update footer; no-results state offers reset of search/status/sort |
| Strokes/Updated headers | Sort buttons/arrows | Ascending first click, then toggle; switching key starts ascending; aria-sort only on active column |
| Row action trigger | Four actions appear on click | Accessible menu, keyboard navigation, Escape/outside dismissal and focus return |
| Share/Edit/Archive/Delete menu items | Labels observed | Disabled preview actions; no modal, persistence or network effect |
| List view/Export/Filters/Table settings/New board | Controls visible; no extra text from tested Filters/Table settings/New board | Keep all visible, disabled and explained; existing status/search controls remain functional |
| Print/Duplicate/Export CSV | Footer actions visible | Disabled and explained; no download, print or mutation |
| Chart | Two series/metrics and plotted points | Static visual plus summary and accessible data disclosure from the same fixtures |
| Storage | Usage/progress | Static labeled progress, sample values; no real quota claim |

Generic interaction states: visible controls support clear default, hover where actionable, focus-visible and active states. Native disabled controls are not keyboard stops; provide a readable nearby explanation rather than tooltip-only text. No enabled control may silently no-op. There is no asynchronous data source, so do not simulate loading or failure fetches. Search with no matches is the relevant empty state. Menu/drawer roles and focus behavior must match their actual implementation; do not add menu roles without implementing the required keyboard model.
