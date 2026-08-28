# Plan: Rebuild Event Management Dashboard on `base-template-saas`

> **Status: PLAN ONLY — nothing applied.**
> Source app: this repo (Vite + React 18 + Express 5 + Azure Blob JSON, MSAL B2C).
> Target: `C:\base-template-saas-main` conventions — Next.js 16 App Router, React 19,
> tRPC v11, Drizzle + PostgreSQL, Better Auth, Tailwind 4 + Shadcn, Biome, Vitest/Playwright,
> multi-tenant organizations.

---

## Why a rebuild (not in-place alignment)

The template and this app disagree on runtime (Next vs Vite+Express), data layer
(Postgres/Drizzle vs single JSON blob), auth (Better Auth vs MSAL-in-browser + token
table), and API style (tRPC vs generic REST `/api/:resource`). There is no incremental
path — the honest approach is a fresh scaffold from the template and a phased port,
with the current app staying live until cutover.

**Recommended repo strategy**: new repo (e.g. `event-management-dashboard-v2`) created
from the template; current repo stays deployable throughout. Final DNS swap at the end.

---

## Phase 0 — Decisions to confirm before starting

| # | Decision | Recommendation |
|---|---|---|
| 0.1 | Auth: template ships Better Auth + Microsoft Entra SSO. RMP **requires Azure AD B2C id_tokens** (user-delegated, no service account). | Add CloudLabs B2C as a **generic OIDC provider** in Better Auth alongside Entra. Better Auth persists `access/id/refresh` tokens server-side per user → RMP "token borrowing" finally gets **real refresh tokens** (spec §4/§7) instead of today's in-memory 60-min cache. Needs B2C redirect URI for the new domain(s). |
| 0.2 | Hosting: template assumes Vercel (`vercel.json`); today we deploy Azure App Service with dev slot. | Either works. If staying on Azure: Next `output: standalone`, startup `node server.js`, separate `.next` build dir (see deployment notes), keep dev-slot flow. If Vercel: preview deployments replace the dev slot. |
| 0.3 | Tenancy: single team today. | Keep template's org model; seed one organization ("MS Innovation"); org-scope every table anyway (template CRITICAL rule). |
| 0.4 | Local accounts: current `users[]` has bcrypt passwords + roles (admin/developer/viewer). | Map to Better Auth users; roles → platform `admin` / org `member` (+ org `admin`). Prefer SSO-first; password reset flow for stragglers. `NEXT_PUBLIC_ALLOWED_DOMAINS` replaces `ALLOWED_DOMAINS` auto-provisioning. |
| 0.5 | Blob images (reviews/screenshots) | Template has `lib/storage` (S3 presigned). Either point it at Azure Blob via S3-compatible layer or write a small Azure adapter. One-time copy of existing `uploads/`. |

---

## Phase 1 — Scaffold & branding (S)

1. Copy template → new repo; `npm ci`; `.env` from `.env.template.dev`; `docker compose up` Postgres.
2. Re-skin per template rule — edit **only** `app/theme/brand.css` (`--brand` → CloudLabs indigo `#6256ce`); `config/app.config.ts` (name "MS Innovation Event Management", contact email); logo/favicon into `public/` + `<Logo>`/`<LogoMark>`.
3. Auth flags: `NEXT_PUBLIC_DISABLE_SIGNUP=true`, SSO-only (`NEXT_PUBLIC_DISABLE_PASSWORD_AUTH`) if 0.4 allows, `NEXT_PUBLIC_ALLOWED_DOMAINS=spektrasystems.com,...`.
4. Delete reference feature (`leadTable`, lead routers/pages) per `REFERENCE_ONLY.md`.

**Gate**: sign-in works (Entra + B2C OIDC), empty dashboard shell renders, `npm run check && typecheck && test` green.

## Phase 2 — Database schema (M)

Drizzle tables in `lib/db/schema/tables.ts` (+ `enums.ts`), all with `organizationId` FK, replacing the catalog-array-with-`type`-field model:

| Current (`catalog[].type` / arrays) | New table |
|---|---|
| `roadmapItem` | `roadmap_item` (phase enum, labType, eta, needsAttention, activity log → `activity_entry` child table or jsonb) |
| `tttSession` | `ttt_session` |
| `customLabRequest` | `custom_lab_request` |
| `localizedTrack` | `localized_track` (spanish/portuguese status enums) |
| `catalog` (health, frozen) | `catalog_health_item` (import as archive; page already redirects to Admin Center) |
| `trackChange`, `generalAnnouncement`, `pdfCatalog` | `announcement` (kind enum) |
| `tracks[]` (GitHub trending) | `trending_track` |
| `reviews[]` (DevOps screenshots) | `participant_feedback` |
| `metrics{}` | `metric` (key/value) + `rmp_auto_metrics` snapshot |
| audit blob | `audit_log` (actor, action, resource, old/new jsonb) |
| `_rmpSync` | `rmp_sync_state` (singleton per org) + `rmp_processed_request` ledger (GUID unique) |

RMP columns (per rmpintegration.md §6) live on each importable table: `source`,
`rmpRequestUniqueName` (unique), `rmpStatus`, `rmpScheduledDate`, requestor fields,
`rmpAdminUrl`/`rmpRegistrationsPageUrl`/`rmpAttendanceReportUrl`, timestamps.

**Gate**: `db:generate` + `db:migrate` clean; Drizzle Studio shows schema.

## Phase 3 — API layer (tRPC) (M)

- `trpc/routers/organization/`: `roadmap-router`, `ttt-router`, `custom-lab-router`, `localized-tracks-router`, `announcements-router`, `feedback-router`, `metrics-router`, `audit-router`, `rmp-router`.
- Zod schemas in `schemas/`; all mutations `protectedOrganizationProcedure`; admin-only mutations check `ctx.membership.role`.
- Port server rules: event-ID duplicate check, null-guard merge semantics, sr → real PKs (keep `eventId` human code), stale-item logic.
- Structured logging via `lib/logger` (no console.log).

**Gate**: CRUD parity for all entities via tRPC; vitest unit tests for routers.

## Phase 4 — RMP integration port (M) ⭐ the crown jewel

- `lib/integrations/rmp/`: `api-client.ts` (fetch wrapper + `myevents` + detail + STATUS_MAP + PascalCase→camelCase), `token-manager.ts` (Better Auth token store + B2C refresh grant — spec §4.3 contract incl. NO_ACCOUNT/TOKEN_EXPIRED codes), `sync.ts` (baseline → import → drift → auto-metrics), `mappers.ts`.
- **Preserve every hard-won behavior** (all verified in prod this week):
  - `myevents` unused filters must be `null` (empty strings → 0 rows)
  - HTTP 500 "No event found." = empty result, not error
  - Routing by `EventFormat`: Onboarding & Maintenance → roadmap, Train-The-Trainer → TTT, Custom Tech/Non-Tech → custom lab; others skipped
  - Baseline-first (strict go-live), re-baseline when ledger empty, ledger prevents resurrection of deleted items
  - Drift: conservative (Cancel/Reject → On-Hold + attention; never override manual phase), TTT date/status follow RMP, localized flips to Available on Completed
  - Detail enrichment (cap ~20/run): Spanish/Portuguese → `localized_track`; session times + `RequiredInsrtuctorCount` typo handling
  - Statuses `Canceled` (one L), `PendingActionRequired`, `ApprovedActionRequired`→3
- Cron: `app/api/cron/rmp-sync/route.ts` guarded by `CRON_SECRET` (constant-time compare), scheduled by GitHub Actions cron or Vercel cron — replaces in-process node-cron. Token borrowing now uses stored refresh tokens (works even when nobody signed in recently — an upgrade over today).
- Client trigger: keep once-per-session auto-sync + manual "Sync RMP" buttons.
- Port the vitest suite from this week's mock-server tests (baseline, drift, dedupe, format routing, token expiry).

**Gate**: mock-RMP vitest suite green; manual smoke against QA RMP (`events-qa-api.cloudlabs.ai`) before prod tenant.

## Phase 5 — UI pages (L)

`app/(saas)/dashboard/organization/…` using template primitives (`DataTable` with toolbar filters, `PagePrimaryBar`, `PageEntityContext`, `UnderlinedTabs` + `?tab=` via nuqs, `useZodForm`):

1. Dashboard home: KPI cards + roadmap pie + **RMP auto-metrics strip**
2. Lab Development roadmap (RMP badge, links, activity log, needs-attention, On-Hold sort rule)
3. TTT sessions (RMP link button, session times, auto-complete past dates)
4. Custom lab requests · 5. Localized tracks · 6. Trending tracks · 7. Announcements
8. Participant feedback (image grid) · 9. Audit log · 10. Users/members (template admin area)
11. Catalog Health redirect page · 12. Analytics (existing charts)

**Gate**: side-by-side visual/functional parity walk of every page vs prod.

## Phase 6 — Data migration (M)

One-time script (`scripts/migrate-from-blob.ts`):
1. Read prod `data.json` blob (+ audit blob, + uploads/ images).
2. Insert org → users (Better Auth) → all entity tables → metrics → audit → RMP ledger (`processedRequestIds` → `rmp_processed_request`).
3. Verify counts (74 roadmap / 64 health / 35 custom / 11 TTT / 11 localized / 30 tracks as of 2026-08-09) + spot-check items with `source='rmp'`.
4. Dry-run mode + idempotent (upsert by natural keys) so it can re-run at cutover.

## Phase 7 — Aux integrations (S)

- DevOps feedback sync + GitHub trending sync → cron routes (same CRON_SECRET pattern), config via `lib/env.ts`.
- Image proxy route replacing `/api/blob-image/:filename`.

## Phase 8 — Deploy & cutover (M)

1. CI: template's Biome/typecheck/vitest + build; two-stage deploy (dev slot or Vercel previews) mirroring today's flow (auto-dev, manual prod).
2. Parallel run on `dev.update.cloudlabs.ai` (B2C redirect URI needed) with **fresh baseline** against prod RMP; disable old app's RMP cron during overlap to avoid double-writes (different stores, but avoid confusion).
3. Freeze old app writes → final data migration run → DNS swap `update.cloudlabs.ai` → new app → old app kept read-only for rollback window.

---

## Sequencing & sizing

| Phase | Size | Depends on |
|---|---|---|
| 0 Decisions | S | — |
| 1 Scaffold | S | 0 |
| 2 Schema | M | 1 |
| 3 tRPC | M | 2 |
| 4 RMP port | M | 3 (0.1 for tokens) |
| 5 UI | L | 3 (pages land incrementally) |
| 6 Data migration | M | 2 (script), 5 (cutover) |
| 7 Aux crons | S | 3 |
| 8 Cutover | M | all |

Parallelizable: 4 ∥ 5 after 3; 6-script alongside 5.

## Top risks

1. **B2C inside Better Auth** (0.1) — needs a spike first: custom OIDC provider against `B2C_1A_CUSTOM_SIGNUP_SIGNIN` policy, confirm refresh-token rotation persists. Fallback: keep MSAL on the client posting id_tokens (today's model) — works but loses offline cron tokens.
2. **User migration/passwords** — SSO-first strongly preferred; avoid porting bcrypt hashes.
3. **Blob→Postgres fidelity** — activity logs and free-text fields; mitigated by idempotent migration + count checks.
4. **Two RMP writers during overlap** — run new app against QA RMP until cutover week.

## Explicitly out of scope (unchanged from today)

Registration-count pulls (spec Phase 5), track-catalogue sync (spec Phase 6), historical RMP backfill (strict go-live stands), CatalogHealth data revival.
