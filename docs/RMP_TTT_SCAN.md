# TTT scan and explicit dashboard saves

## Using the page

1. Sign in to the dashboard with your RMP-enabled B2C account.
2. Open **Train The Trainer → Import from RMP** or the **RMP scan** tab.
3. Select scheduled **From / To** dates, or **All scheduled dates**, then **Scan RMP**.
4. Refine the completed scan by **scheduled month/year**, **RMP status** and **search**.
5. As an admin, choose **Save** on a row or **Save N to dashboard** for the matching
  unsaved results, then confirm **Save to dashboard**.
6. Select **View Dashboard sessions**. Saved sessions and counts refresh immediately
  and remain available after a reload. Rows already present show **Saved**.

The old top-level **Sync RMP** button used the general request importer, which
intentionally baselines existing requests and can skip history. It has been
replaced on this page by **Import from RMP**, opening the TTT-specific scan/save
workflow. Historical TTT requests can now be explicitly saved even when already
in that baseline or when general onboarding imports are paused.

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
view refinements. Unsaved scan results are retained while switching the two TTT
tabs, but not across reloads or accounts. Explicitly saved dashboard sessions
are shared dashboard records, not private per-account scan caches.

## Read-only boundaries

- `POST /api/rmp/ttt/scan` is separate from the `/api/rmp/sync` request importer.
- Scanning alone never writes dashboard data. Neither scanning nor saving enables
  `RMP_REQUEST_IMPORTS_ENABLED`, changes RMP, modifies the baseline, or updates metrics.
- Existing saved dashboard sessions remain editable in **Dashboard sessions**.
  Merely opening that page no longer auto-completes or writes past sessions.
- Admins explicitly save through `POST /api/rmp/ttt/import`; changing a source
  request itself still requires RMP. Viewers can scan but cannot save.
- The scan is explicit, not automatic polling; changing local filters makes no
  additional upstream calls.

## Persistence and duplicate handling

- The save body supplies only selected request GUIDs, the **applied** scan range,
  and the caller's B2C ID token. The server repeats the complete TTT scan with that
  token before writing. Client-supplied titles, statuses, formats or URLs are ignored.
  If any selected request is no longer visible in that range, nothing is saved.
- Save-all uses the current month/status/search filters, not every source result.
  Editing date inputs without scanning again does not silently change the save range.
- Only an allowlisted snapshot is stored: request GUID/code, title, actual source
  status, scheduled date, template, language/timezone, session details and a safe RMP
  View link. No B2C tokens, requestor emails or raw upstream settings are copied.
- New records have `type: tttSession`, `source: rmp`, and `rmpImportMode: ttt-scan`.
  This narrow marker keeps explicitly saved TTT sessions visible while unrelated
  automatic RMP imports remain paused/hidden.
- Dedupe is case-insensitive by source GUID or nonempty, non-`TBD` event code. Existing
  TTT sessions and manual notes are preserved, not overwritten with source values.
  A selected hidden TTT import becomes visible in place; its ID/serial/local fields
  remain intact. If a visible manual session already represents it, the hidden copy
  is left alone. Cross-resource or different-source-ID conflicts are reported and
  skipped rather than overwritten; other selected nonconflicting requests can save.
- Only explicit saves can create or reveal these records. The legacy general
  importer's drift pass does not modify `ttt-scan` snapshots, even if re-enabled later.
  Use dashboard editing for local changes; rescanning still shows live RMP values.
- Writes use the application's process mutex. Blob writes capture a fresh ETag;
  a conflict re-reads and re-merges the selected requests, with at most three attempts.
  Failed/empty storage reads cannot become unconditional replacement writes. The
  input cache is not mutated before persistence. UTF-8 byte lengths are used for
  multilingual titles in the data and audit blobs.
- Success is reported only after storage confirms the write; retries do not create
  another session. Save failures retain the scan for retry (except rejected access,
  which hides the source results). If only the list refresh fails, the UI says the
  save succeeded and requests a page reload. Audit failures do not misreport a
  committed save as a failed write.

## Authentication and source reads

- TTT and [Custom Tech](RMP_CUSTOM_TECH.md) reuse the same complete-page scanner
  and safe display projection, but their fixed source formats and routes remain
  separate. TTT remains an explicit scan; Custom Tech has a five-minute active-view check.
- The scan route requires dashboard authentication; the save route additionally
  requires admin access. Both use the caller-supplied B2C **ID token** acquired
  through MSAL for that account.
- Locally decoded expiry only rejects unusable tokens; RMP's actual API call is
  the authority on token validity and request visibility.
- No shared cached credential is borrowed. Tokens and unsaved per-account scans
  are never persisted; only explicitly saved session snapshots enter the dashboard.
  Responses are `private, no-store`. Browser scans and pending save feedback are
  hidden/cleared on account change or sign-out.
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
  Saving accepts up to 500 selected requests, with at most two concurrent save
  operations per process and one per dashboard user. Each save re-verifies RMP.

## Validation

Offline contract, persistence and filter tests use synthetic tokens, isolated
storage and mocked RMP requests. Save coverage includes historical requests,
authorization, repeat saves, hidden imports, conflicts, failed writes, ETag merge
retries, source status preservation and filtered selection.
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