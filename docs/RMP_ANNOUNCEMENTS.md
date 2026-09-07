# Verified RMP tokens and automatic announcements

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
- **Month / year**: groups the returned releases by `LaunchDate`, newest first. Missing dates stay **Undated**; a sync timestamp is never substituted.
- Additional filters: content releases, New Release highlight, event type, level, keyword search, retirement notices and manual updates. New Release is optional, so older releases without that tag are still available for historical periods.
- Source date filters apply only to RMP catalogue data. Manual notices and FY27 plans remain clearly separate. For retired labs, the upstream range filters their original content release date, **not retirement time**; retirement dates remain unknown.
- The page checks its snapshot every 60 seconds (every 2 seconds during refresh), on focus and after sync events. Source data refreshes when stale and a verified token is available. Sign-in/request sync and the existing hourly job also queue a catalogue refresh.
- Full source metadata cards, month headings, a matching timeframe link to RMP, stale/error states, manual notice editing and PDF resources are retained. No production-data migration or deletion is performed.

## Validation

- `npm test` runs offline regression tests using Node's test runner and `tsx`. All RMP responses are mocked and tokens are synthetic fixtures.
- `npm run typecheck` checks the frontend and Vite configuration.
- Source contracts are inspected read-only through the user's signed-in Catalog UI; no tokens/passwords are extracted. Application browser validation uses an isolated build with synthetic local API data and never writes production data.

Before production rollout, verify one RMP-enabled account and one account without RMP visibility against the configured tenant. The second account must not displace the first account's token. Confirm a source date range in both pages; catalogue access can differ from event-request access. Tokens remain process-local and cannot refresh indefinitely after expiry/restart.