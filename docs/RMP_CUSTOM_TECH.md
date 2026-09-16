# Custom Tech automatic source sync

Open **Lab Development → Custom Tech**. The default is **All scheduled dates**,
including upcoming and undated requests. The view loads automatically, then
refreshes every **five minutes while open**, with **Sync now** for an immediate
check. It is not an unattended server import or a background job after sign-out.

## Source and scope

- Source: **My Events → Custom Tech Event**, not Custom Non-Tech Event and not
  requests that only mention custom tech in their title.
- On September 8, 2026 the user's signed-in portal confirmed **256 visible
  requests**, with the format filter
  `9EA99230-9DB6-4C57-BEBE-BFC7B5CCBD4E`. Counts are account-scoped, not a tenant-wide
  guarantee. Only read-only filtering was performed; no source record was changed.
- `RMP_CUSTOM_TECH_EVENT_FORMAT_ID` can override the verified default-tenant GUID.
  A different tenant without that setting falls back to date-filtered My Events
  pagination and exact returned-format matching, never a guessed GUID.
- Dates filter the **scheduled start date** using `YYYY-MM-DDT00:00:00` without
  a UTC suffix. Month/year, RMP status and metadata search share that complete
  applied dataset. Filters remain set across refreshes and timeframe changes.
- My Events status stays authoritative. Completed does **not** mean a lab has
  been Released; no development phase, sponsor, finalized title or note is inferred.
- Session details retain event-local dates/times and timezone. Missing details
  are explicitly marked and retried; source View links are read-only.

## Data and authentication boundaries

`POST /api/rmp/custom-tech/sync` uses the caller's MSAL B2C ID token and the existing
dashboard authentication middleware. It uses the shared complete-page scanner
also used by TTT, with separate fixed-format routes. Raw client format input is
ignored. Limits and error/identity handling are described in [RMP_TTT_SCAN.md](RMP_TTT_SCAN.md).

This is **source-only synchronization into a separate Custom Tech view**:

- No catalog rows are inserted; no request baseline or dashboard metrics are changed.
- `RMP_REQUEST_IMPORTS_ENABLED` remains off. Existing onboarding and other hidden
  request imports are not restored or silently deleted.
- The **Development Roadmap** tab retains existing manual edits, activities,
  CRUD, CSV uploads and exports. The separate **Custom Lab Request** page is unchanged.
- The server does not borrow another user's cached token or persist request
  results. Responses are `private, no-store`.
- Frontend query keys include account identity and applied dates. No data from
  another range/account is used as placeholder data. Query cache is removed when
  unobserved; nothing is persisted in browser storage by this feature.
- Missing sign-in stops sync. Expired/rejected credentials hide stale results.
  A transient outage can retain only the same account/range's last successful
  snapshot, with a visible warning. Automatic retries/backoff loops are disabled;
  the five-minute interval or Sync now retries normally.
- Automatic checks stop when the Custom Tech tab is not selected or the browser
  is in the background. An already-running read may finish within its deadline.

## Validation

Offline regression tests use synthetic data and tokens: exact Custom Tech vs
Non-Tech filtering, the live GUID, all 256 records over clamped pages, dates,
status/search/month, duplicates/incomplete pages, auth/query isolation and paused
import/manual-data preservation. Browser validation uses only a localhost mock
API, including automatic refresh, denied/empty results and responsive layout.