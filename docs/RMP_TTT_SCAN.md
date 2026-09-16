# Read-only TTT scan

## Using the page

1. Sign in to the dashboard with your RMP-enabled B2C account.
2. Open **Train The Trainer → RMP scan (read-only)**.
3. Select scheduled **From / To** dates, or **All scheduled dates**, then **Scan RMP**.
4. Refine the completed scan by **scheduled month/year**, **RMP status** and **search**.

The source is **My Events → Train-The-Trainer** at
https://admin.cloudevents.ai/events — not the Catalog's Content Release Date.
The timeframe and month groups use each request's scheduled start date. Session
times are displayed separately in their source event timezone, without converting
wall-clock times into UTC. Missing dates/times remain explicitly unavailable.

The source format must normalize to `train the trainer` (case, whitespace and
dash variations are accepted). A title containing `TTT`, budget requests or other
event formats do not qualify. All source statuses are included. Past dates do not
automatically mean Completed; Cancelled, Rejected, Draft, Pending and unknown
statuses are preserved.

Counts and displayed rows use the same combined filters across the entire scan,
not only the first page. Search includes request codes/IDs, title, template,
language, status, timezone and individual sessions. Filter options remain stable,
and selections are retained on a new scan. **Clear scan filters** resets only
view refinements. Results are retained while switching the two TTT tabs, but not
persisted across page reloads or accounts.

## Read-only boundaries

- `POST /api/rmp/ttt/scan` is separate from the paused `/api/rmp/sync` importer.
- This feature does **not** enable `RMP_REQUEST_IMPORTS_ENABLED`, unhide old
  imported labs, create catalog rows, modify the baseline, or update metrics.
- Existing saved dashboard sessions remain editable in **Dashboard sessions**.
  Merely opening that page no longer auto-completes or writes past sessions.
- Scan results have no edit/import controls. Change source requests in RMP itself.
- The scan is explicit, not automatic polling; changing local filters makes no
  additional upstream calls.

## Authentication and source reads

- TTT and [Custom Tech](RMP_CUSTOM_TECH.md) reuse the same complete-page scanner
  and safe display projection, but their fixed source formats and routes remain
  separate. TTT remains an explicit scan; Custom Tech has a five-minute active-view check.
- The route requires the existing dashboard authentication middleware plus the
  caller-supplied B2C **ID token** acquired through MSAL for that account.
- Locally decoded expiry only rejects unusable tokens; RMP's actual API call is
  the authority on token validity and request visibility.
- No shared cached credential is borrowed, and neither tokens nor per-account
  scan results are persisted by this feature. Responses are `private, no-store`.
  Browser results are immediately hidden/cleared on account change or sign-out.
- The dashboard's legacy session-authentication implementation is unchanged;
  this feature does not claim to repair its independent authentication issues.
- Reads `POST /api/admin/v1.0/tenants/{tenantId}/myevents` with all statuses,
  null unused filters, and the validated `ScheduleStartDate` / `ScheduleEndDate`
  as `YYYY-MM-DDT00:00:00` (calendar midnight, no UTC suffix).
  The default tenant uses the **observed** TTT `EventFormat` GUID
  `4CEE1672-2E96-47FC-93B4-93433FCE98A2` on every page. For other tenants,
  configure `RMP_TTT_EVENT_FORMAT_ID`; without one it scans the date-filtered
  formats and still matches only the exact returned Train-The-Trainer name.
  `scannedRequests` counts source requests checked; `items` contains only genuine
  TTT matches within the timeframe. Raw client format/filter input is ignored.
- Every page is read and GUID-deduplicated against stable `TotalRecords`. Invalid,
  changed, truncated or duplicate-only pagination fails the scan, not its counts.
- Details use `GET /api/tenants/{tenantId}/eventrequests/{RequestUniqueName}`,
  verifying returned `Data.UniqueName`. Details run in batches of five; a failed
  detail is visibly unavailable and retried on a subsequent scan. A detail 401
  aborts; detail-specific 403 does not erase an authorized list record.
- Only display fields are returned, not requestor emails, raw settings or tokens.
  Source links use the verified read-only `/events/{RequestUniqueName}/view`
  route. The live list does not provide `AdminURL`; arbitrary source URLs and
  credentials are never forwarded.
- Empty / exact upstream `No event found` behavior means no visible matches,
  not proof that the account has access to all tenant records. Nothing is cached
  or inferred deleted from an empty result. Ordinary errors remain errors.
- Limits: 100 list pages, 90-second scan deadline, at most two concurrent scans
  per server process, and a 30-second per-dashboard-user retry cooldown.

## Validation

Offline contract and filter tests use synthetic tokens and mocked RMP requests.
Browser verification uses a localhost-only synthetic API; it does not call RMP
or modify production storage. After the user signed in again on September 8,
2026, the real My Events UI confirmed:

- TTT EventFormat GUID above; 32 visible TTT requests, with Approved, Completed
  and Canceled statuses. This is that account's visibility, not a universal total.
- September 1–8, 2026 sends calendar-midnight dates and returns one Completed
  request scheduled September 4.
- The View action opens `/events/{GUID}/view`; detail identity is `Data.UniqueName`.
  Sessions use `StartDate`, `EndDate`, `StartTime`, `EndTime` in `TimeZone`.
- Detail `EventRequestStatus` can still be Approved while My Events reports
  Completed. Display **My Events status**, not the older detail workflow status.

Only read-only list/filter/View actions were used; no credentials were extracted
and no live request statuses or other records were changed.