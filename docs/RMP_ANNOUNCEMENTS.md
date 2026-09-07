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

The existing first-sync baseline, selective request mapping, and hourly sync schedule are unchanged. Errors distinguish reauthentication (`401`, `requiresReauth`) from unconfirmed tenant access (`403`, `requiresRmpAccess`).

## Announcements data sources

The page derives a read-only feed rather than inserting generated announcements every time someone opens it.

| Entry | Source | Meaning |
| --- | --- | --- |
| Lab onboarding | Catalog `roadmapItem` with `labType: New Lab Onboarding`, including RMP imports | A new onboarding request/work item, **not necessarily a released lab**. Local phase is displayed separately from RMP status. |
| Added / retired update | Existing `trackChange` records | Explicit administrator-confirmed catalog changes. |
| Confirmed retirement | FY27 review entries labeled `FY26 — already removed` | Previously confirmed retirement; the effective date is not fabricated. |
| Planned retirement | FY27 review entries labeled `FY27 — pending removal` | A plan, not an already-retired lab. |
| Team notice / PDF | Existing `generalAnnouncement` / `pdfCatalog` records | Preserved administrator-managed content. |

Draft, cancelled and rejected onboarding requests, upgrades, TTT and custom event requests are not promoted to new-lab announcements. A disappeared RMP request, a cancelled event, or a missing catalogue item is **never** inferred to be a retirement.

No reliable live RMP retirement field was present in either reviewed project. Retirement notices therefore use the explicit records above, not a fabricated upstream API or user-scoped catalogue disappearance. The FY27 reference remains curated source data; updating it updates the derived feed on the next deployment.

The page fetches the catalog/status on mount, window focus, every 60 seconds while active, and after catalog/RMP change events. A separate RMP sync action fetches upstream data with verified access. Search, lifecycle filters, source links, read-only automatic entries, editable notices, and PDF resources are retained. Matching manual entries take precedence over automatic projections, and confirmed retirement records supersede matching planned removals.

## Validation

- `npm test` runs offline regression tests using Node's test runner and `tsx`. All RMP responses are mocked and tokens are synthetic fixtures.
- `npm run typecheck` checks the frontend and Vite configuration.
- Browser validation uses an isolated build with synthetic local API data; it does not contact RMP or write production data.

Before production rollout, verify one RMP-enabled account and one account without RMP visibility against the configured tenant. The second account must not displace the first account's token. Confirm that the first nonempty sync's existing baseline behavior is still the desired onboarding policy.