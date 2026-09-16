# Verified RMP tokens and automatic announcements

## Request imports (restored September 16, 2026)

Request-based RMP lab/onboarding imports are **enabled** via
`RMP_REQUEST_IMPORTS_ENABLED=true`. They were paused on September 8, 2026 and
restored on September 16, 2026. The actual Admin Center Catalog releases and
Content Release Date filtering described below are independent of this flag and
stayed enabled throughout.

- Records marked `source: rmp` or carrying `rmpRequestUniqueName` are visible
	again in the catalog, track, event and full-data GET responses.
- Lab Development and TTT show their request **Sync RMP** buttons. Dashboard
	counts/stale lists use the full catalog and the imported-request metrics strip
	is shown again.
- The request-sync endpoint, core sync and hourly request job import and
	reconcile requests normally. Login supplies a verified token to both the
	request sync and the separate catalogue sync.
- **The pause deleted and renumbered nothing.** Records retained during the
	pause returned without a data migration, and duplicate event IDs stayed
	reserved while hidden.
- The pre-pause `_rmpSync` baseline was preserved, so restoring did not reimport
	history. Requests created *during* the pause were not in the baseline, so the
	first run after restart imported that backlog in one pass.
- The flag remains an explicit opt-in and doubles as a kill switch: it must be
	exactly `true`. Set it to anything else and restart to hide and pause imports
	again, without data loss.

The separate [read-only TTT scan](RMP_TTT_SCAN.md) reads **My Events →
Train-The-Trainer** with the caller's own account. It does not re-enable imports
or change saved dashboard sessions.
Likewise [Custom Tech automatic sync](RMP_CUSTOM_TECH.md) reads only **My Events →
Custom Tech Event** in Lab Development while that source view is open. It does
not restore the paused bulk importer or overwrite manual development phases.

## Token admission

The backend keeps a token in memory **only after the configured RMP tenant confirms request visibility**. It sends an unfiltered, one-record `myevents` probe using the candidate B2C ID token. Decoding a JWT expiry is not an authorization check.

- A successful response must contain a request identifier. Expired tokens, 401/403 responses, malformed responses, and empty / `No event found` responses do not admit a token.
- An empty response is inconclusive: it can mean no requests or no RMP access. The conservative default is not to cache it; this can exclude an authorized account with an empty tenant.
- A denied candidate or a transient upstream failure does not overwrite another user's verified token.
- An upstream 401/403 for the currently cached token evicts that token, including rejection during detail enrichment or a scheduled sync.
- Expired tokens are removed on access. A slower, older access check cannot overwrite a newer successful check.
- `/api/rmp/sync-status` exposes availability and verification/expiry timestamps, **never the token**.
- Tokens remain process-local and short-lived. This does not implement server-side refresh tokens or guarantee unattended sync after token expiry/server restart.

The existing first-sync baseline, selective request mapping, and hourly sync schedule are unchanged for **requests**. Catalogue announcements use a separate service and are not limited by that baseline. Errors distinguish reauthentication (`401`, `requiresReauth`) from unconfirmed tenant access (`403`, `requiresRmpAccess`).

## Announcements data sources

The page derives a read-only feed rather than inserting generated announcements every time someone opens it.

| Entry | Source | Meaning |
| --- | --- | --- |
| Content releases | Admin Center `trackList` + `partnertrack/{TrackUniqueName}` | Actual catalogue labs. `LaunchDate` is the portal's **Content Release Date**. Historical labs remain included after their New Release highlight expires. |
| New Release | Catalogue `Popularity` includes the exact `New Release` tag | Optional highlight filter within content release results; **not** a `myevents` request or a local roadmap entry. |
| RMP retirement | Catalogue `IsRetired === true` | Explicit current retirement state. `IsHide` alone is not retirement. RMP does not supply a retirement date in the observed response. |
| Added / retired update | Existing `trackChange` records | Explicit administrator-confirmed catalog changes. |
| Confirmed retirement | FY27 review entries labeled `FY26 — already removed` | Previously confirmed retirement; the effective date is not fabricated. |
| Planned retirement | FY27 review entries labeled `FY27 — pending removal` | A plan, not an already-retired lab. |
| Team notice / PDF | Existing `generalAnnouncement` / `pdfCatalog` records | Preserved administrator-managed content. |

**All roadmap/event requests are excluded**, including requests whose format was incorrectly mapped to "New Lab Onboarding". Budget and milestone request titles no longer appear as catalogue releases. A disappeared RMP request, a cancelled event, or a missing catalogue item is **never** inferred to be a retirement.

On September 7, 2026, the signed-in Admin Center Catalog confirmed the live `IsRetired` and `LaunchDate` fields. These take precedence over matching FY27 reference retirement entries. Existing manual history remains editable and the FY27 reference remains separately labeled.

## Content Release Date: source filtering

The date picker sends `from` and `to` as calendar dates to the backend. The backend uses the **exact filter expression observed from the portal**, not request/import dates:

`(content_release_datefrom in (2026-08-01)) and (content_release_dateto in (2026-09-07))`

It is passed as the encoded value of the literal `$filter` query key on:

`GET /api/admin/v1.0/tenants/{tenantId}/trackList?$filter=...&$pagenumber=1&$pagesize=100`

- Both dates must be valid `YYYY-MM-DD` calendar dates, start <= end. No client-supplied raw filter expression is accepted.
- Every pagination request retains the same date filter. Pagination uses the actual returned page size and verifies deduplicated count against `TotalRows`; incomplete results do not replace a snapshot.
- The observed source response for August 1–September 7, 2026 contained 11 catalogue records. A genuinely empty interval returned HTTP 200 with `Status: Success, Data: []`; empty ranges do not imply deleted/retired labs.
- `GET /api/rmp/catalogue?from=...&to=...` serves/queues that range. `POST /api/rmp/catalogue/sync` accepts the same dates with an optional candidate B2C token.
- Range caches are isolated: a failed/empty range cannot overwrite all-catalogue data or display cached results from a different interval. The unfiltered sanitized snapshot is persisted separately; bounded per-range caches live in memory.
- Upstream calls for different ranges are serialized; detail fetches run in batches of five. Repeated polling shares the in-flight refresh. Fifteen-minute TTL and retry cooldown limit upstream requests.
- Only allowlisted display fields are retained. Descriptions are converted to plain text; raw catalogue metadata, OAuth tokens, activation codes, and signed resource URLs are not persisted in the publication snapshot.

## Page behavior

- **Content Release Date**: start/end inputs, Apply dates, All dates. Default range is the first day of the previous month through today.
- **Month / year**: groups and filters every RMP lab category by its `LaunchDate`, including retired and recently updated labs. The actual retirement date remains unknown and is displayed separately. Local updates/notices/PDFs use their recorded dates. Missing dates stay **Undated**; a sync timestamp is never substituted.
- **All updates** is the default. Category/highlight filters include Content releases, New Release, Recently Updated, Upgraded, Trending, More Languages Available, Retired, Planned retirement and Manual update. Highlight matching uses exact, case-insensitive RMP tags; neither a sync time nor a modification date alone invents a Recently Updated tag. Highlights can overlap; All updates lists each record once.
- Every category scans the same applied dataset, not a separate unfiltered list. Switching categories or summary cards does **not** clear dates, month, type, level or keyword search. Applying new dates also retains the view selections. **Clear view filters** explicitly resets those refinements; **All dates** removes only the date range.
- Results and category/summary counts share the applied date range, month, event type, level and metadata search. Counts for a category equal the rows displayed when that category is selected. Options are built across the applied dataset so switching categories does not discard a selected filter; a selection with no matches remains visible as such.
- The date range is sent upstream unchanged for RMP records. Manual lab changes, team notices and PDF resources are additionally scoped locally by their recorded effective/publication dates. Undated manual/FY27 entries are excluded from a bounded date range, with a notice explaining that **All dates** restores them. They are not deleted.
- Date controls and month/search are shared across all page tabs. Event type, level and lab-category filters apply only to lab updates, because team notices and PDFs do not have those fields; this distinction is shown in the UI.
- Search scans titles, descriptions, source/status, highlights, topic, type, level, languages, IDs and recorded dates across all fetched rows. Multiple terms may match different fields. It is not limited to the first upstream page or the currently selected category.
- For RMP-retired or updated labs, the applied timeframe remains their original **Content Release Date**, not a claim they were retired or modified within that timeframe. Source modification dates are displayed separately when available.
- The page checks its snapshot every 60 seconds (every 2 seconds during refresh), on focus and after sync events. Source data refreshes when stale and a verified token is available. Sign-in/request sync and the existing hourly job also queue a catalogue refresh.
- Full source metadata cards, month headings, a matching timeframe link to RMP, stale/error states, manual notice editing and PDF resources are retained. No production-data migration or deletion is performed.

## Validation

- `npm test` runs offline regression tests using Node's test runner and `tsx`. All RMP responses are mocked and tokens are synthetic fixtures.
- `npm run typecheck` checks the frontend and Vite configuration.
- Source contracts are inspected read-only through the user's signed-in Catalog UI; no tokens/passwords are extracted. Application browser validation uses an isolated build with synthetic local API data and never writes production data.

Before production rollout, verify one RMP-enabled account and one account without RMP visibility against the configured tenant. The second account must not displace the first account's token. Confirm a source date range in both pages; catalogue access can differ from event-request access. Tokens remain process-local and cannot refresh indefinitely after expiry/restart.