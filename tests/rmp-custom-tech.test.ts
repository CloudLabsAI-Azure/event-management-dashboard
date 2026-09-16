import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QueryClient } from '@tanstack/react-query'
import { isCustomTechFormat, mapCustomTechRequest, registerRmpCustomTechRoutes, scanRmpCustomTech } from '../backend/rmpCustomTechService.js'
import { RmpApiError, getRmpConfig } from '../backend/rmpService.js'
import { rmpRequestImportsEnabled, visibleLabResource } from '../backend/rmpRequestPolicy.js'
import { buildRmpEventView } from '../src/lib/rmpEventFilters'
import { CUSTOM_TECH_REFRESH_MS, customTechError, customTechQueryOptions } from '../src/lib/rmpCustomTechQuery'
import type { RmpEventScanResult, RmpScheduledRange } from '../src/types/rmpEvents'

const config = { apiBaseUrl: 'https://example.invalid', tenantId: 'fixture', customTechEventFormatId: '9EA99230-9DB6-4C57-BEBE-BFC7B5CCBD4E', tttEventFormatId: '4CEE1672-2E96-47FC-93B4-93433FCE98A2' }
const guid = (n: number) => `abcdef01-0000-4000-8000-${String(n).padStart(12, '0')}`
const candidate = (sub = 'fixture') => `fixture.${Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic-signature`
const row = (n = 1, overrides = {}) => ({
  RequestUniqueName: guid(n), RequestId: `CUSTOM-${n}`, Title: `Custom technical workshop ${n}`, EventFormat: 'Custom Tech Event',
  Status: 'ApprovedActionRequired', ScheduledDate: '2026-09-16T00:00:00', TotalRecords: 1,
  RequestorEmail: 'private-fixture@example.invalid', AdditionalEventSettings: 'SYNTHETIC-PRIVATE', ...overrides,
})
const detail = (n = 1) => ({ UniqueName: guid(n), TimeZone: 'Eastern Standard Time', DeliveryLanguageName: 'Spanish', EventRequestStatus: 'Approved', SessionRequests: [{ Title: 'Agent architecture', StartDate: '2026-09-16', EndDate: '2026-09-16', StartTime: '08:30:00', EndTime: '10:00:00' }] })
const success = (Data: unknown) => ({ Status: 'Success', Data })

test('Custom Tech source matching excludes Non-Tech, onboarding, TTT and titles that merely mention custom tech', () => {
  for (const value of ['Custom Tech Event', ' custom tech event ', 'CUSTOM TECH EVENT', 'Custom-Tech-Event']) assert.equal(isCustomTechFormat(value), true)
  for (const value of ['Custom Non-Tech Event', 'Custom Non Tech Event', 'Custom Tech Event Budget', 'Onboarding & Maintenance', 'Train-The-Trainer', 'Custom Tech', null]) assert.equal(isCustomTechFormat(value), false)
  assert.throws(() => mapCustomTechRequest(row(1, { EventFormat: 'Custom Non-Tech Event', Title: 'Custom Tech Event title' })), { statusCode: 502 })
})

test('default tenant Custom Tech GUID is the observed portal filter and is not the TTT GUID', () => {
  const actual = getRmpConfig()
  if (actual.tenantId.toUpperCase() === 'EAB203B6-FF38-4DFE-912F-D09EBD3E57E6' && !process.env.RMP_CUSTOM_TECH_EVENT_FORMAT_ID) assert.equal(actual.customTechEventFormatId, config.customTechEventFormatId)
  assert.notEqual(config.customTechEventFormatId, config.tttEventFormatId)
})

test('automatic Custom Tech scan reads all 256 records across clamped pages, including upcoming events', async () => {
  const rows = Array.from({ length: 256 }, (_, i) => row(i + 1, { TotalRecords: 256, Status: i === 255 ? 'Completed' : 'ApprovedActionRequired' }))
  const pages: number[] = []
  let details = 0
  const token = candidate()
  const result = await scanRmpCustomTech(token, { config, request: async (path, options) => {
    assert.equal(options.token, token)
    if (path.endsWith('/myevents')) {
      const body = options.body!
      const page = Number(body.PageNumber)
      pages.push(page)
      assert.equal(body.EventFormat, config.customTechEventFormatId)
      assert.equal(body.Status, null)
      assert.equal(body.ScheduleStartDate, null)
      assert.equal(body.ScheduleEndDate, null)
      if (page > 1) assert.equal(body.PageSize, 50)
      return success(rows.slice((page - 1) * 50, page * 50))
    }
    assert.match(path, /^\/api\/tenants\/fixture\/eventrequests\//)
    details++
    return success(detail(Number(path.slice(-12))))
  } })
  assert.deepEqual(pages, [1, 2, 3, 4, 5, 6])
  assert.equal(result.scannedRequests, 256)
  assert.equal(result.items.length, 256)
  assert.equal(details, 256)
  assert.equal(result.range, null)
  assert.equal(result.items[255].status, 'Completed')
  assert.equal(result.items[255].scheduledDate, '2026-09-16')
  assert.equal(result.readOnly, true)
  assert.equal(result.scope, 'current-account')
  assert.ok(!JSON.stringify(result).includes(token))
  assert.ok(!JSON.stringify(result).includes('private-fixture'))
})

test('Custom Tech validates returned format even if an upstream filter is ignored and ignores caller format overrides', async () => {
  const rows = [row(1, { TotalRecords: 4 }), row(2, { TotalRecords: 4, EventFormat: 'Custom Non-Tech Event' }), row(3, { TotalRecords: 4, EventFormat: 'Train-The-Trainer' }), row(4, { TotalRecords: 4, EventFormat: 'Onboarding & Maintenance' })]
  const result = await scanRmpCustomTech(candidate(), { config, eventFormat: 'Custom Non-Tech Event', request: async path => success(path.endsWith('/myevents') ? rows : detail()) })
  assert.deepEqual(result.items.map(item => item.requestCode), ['CUSTOM-1'])
  assert.equal(result.items[0].eventFormat, 'Custom Tech Event')
})

test('scheduled dates and local month/status/search filters scan the same applied Custom Tech data', async () => {
  const range = { from: '2026-09-01', to: '2026-09-30' }
  const rows = [row(1, { TotalRecords: 3, ScheduledDate: '2026-08-31' }), row(2, { TotalRecords: 3, Status: 'Completed' }), row(3, { TotalRecords: 3, Status: 'Canceled' })]
  const result = await scanRmpCustomTech(candidate(), { config, range, request: async (path, options) => {
    if (path.endsWith('/myevents')) {
      assert.equal(options.body?.ScheduleStartDate, '2026-09-01T00:00:00')
      assert.equal(options.body?.ScheduleEndDate, '2026-09-30T00:00:00')
      return success(rows)
    }
    return success(detail(Number(path.slice(-12))))
  } })
  assert.equal(result.items.length, 2)
  const view = buildRmpEventView(result.items, { month: '2026-09', status: 'Completed', query: 'SPANISH architecture CUSTOM-2' })
  assert.equal(view.matches.length, 1)
  assert.equal(view.completed, 1)
  assert.equal(view.groups[0].label, 'September 2026')
})

test('successive syncs replace source snapshots by GUID without inventing development phases or modifying saved rows', async () => {
  const stored = [{ id: 'manual-1', type: 'roadmapItem', eventId: 'CUSTOM-1', trackTitle: 'Manually curated title', phase: 'Testing', sponsor: 'Manual sponsor', notes: 'Keep this' }, { id: 'hidden', type: 'roadmapItem', source: 'rmp', labType: 'New Lab Onboarding' }]
  const before = JSON.stringify(stored)
  let status = 'ApprovedActionRequired'
  const request = async (path: string) => success(path.endsWith('/myevents') ? [row(1, { Status: status })] : detail())
  const first = await scanRmpCustomTech(candidate(), { config, request })
  status = 'Completed'
  const next = await scanRmpCustomTech(candidate(), { config, request })
  assert.equal(first.items.length, 1)
  assert.equal(next.items.length, 1)
  assert.equal(first.items[0].requestId, next.items[0].requestId)
  assert.equal(next.items[0].status, 'Completed')
  for (const field of ['phase', 'sponsor', 'sr', 'labType', 'activityLog']) assert.equal(field in next.items[0], false)
  assert.equal(JSON.stringify(stored), before)
  assert.equal(rmpRequestImportsEnabled({}), false)
  assert.equal(visibleLabResource('catalog', stored).length, 1)
})

test('Custom Tech incomplete pagination fails and detail failures stay separate from successful request lists', async () => {
  await assert.rejects(scanRmpCustomTech(candidate(), { config, request: async () => success([row(1, { TotalRecords: 2 })]) }), { statusCode: 502 })
  const result = await scanRmpCustomTech(candidate(), { config, request: async path => {
    if (path.endsWith('/myevents')) return success([row()])
    throw new RmpApiError('Unavailable', 403)
  } })
  assert.equal(result.items.length, 1)
  assert.equal(result.detailErrors, 1)
  assert.equal(result.items[0].detailsAvailable, false)
  for (const code of [401, 403, 500]) await assert.rejects(scanRmpCustomTech(candidate(), { config, request: async () => { throw new RmpApiError('Failed', code) } }), { statusCode: code })
})

type Request = { body: Record<string, unknown>; user: { id: string } }
type Response = { setHeader(key: string, value: string): void; status(code: number): Response; json(body: unknown): Response }
type Handler = (req: Request, res: Response) => Promise<void>
type Scan = (token: string, options: { range: RmpScheduledRange | null }) => Promise<RmpEventScanResult<'Custom Tech Event'>>
const empty = (): RmpEventScanResult<'Custom Tech Event'> => ({ items: [], range: null, scannedAt: '2026-09-08T00:00:00Z', scannedRequests: 0, detailErrors: 0, readOnly: true, scope: 'current-account' })

function harness(scan: Scan) {
  let handler: Handler
  let now = 1000
  const requireAuth = () => {}
  registerRmpCustomTechRoutes({ post(path: string, auth: unknown, fn: Handler) {
    assert.equal(path, '/api/rmp/custom-tech/sync')
    assert.equal(auth, requireAuth)
    handler = fn
  } }, { requireAuth, scan, now: () => now })
  return {
    advance: () => { now += 30_001 },
    call: async (body: Record<string, unknown>, id = 'dashboard-a') => {
      let status = 200
      let data: Record<string, unknown> = {}
      const headers: Record<string, string> = {}
      const res: Response = { setHeader(key, value) { headers[key] = value }, status(value) { status = value; return res }, json(value) { data = value as Record<string, unknown>; return res } }
      await handler({ body, user: { id } }, res)
      return { status, data, headers }
    },
  }
}

test('Custom Tech route requires caller credentials and never uses the paused importer or another account token', async () => {
  const seen: string[] = []
  const tokenA = candidate('a')
  const tokenB = candidate('b')
  const app = harness(async token => { seen.push(token); return empty() })
  assert.equal((await app.call({})).status, 401)
  assert.equal((await app.call({ b2cToken: 'invalid' })).status, 401)
  assert.equal((await app.call({ b2cToken: candidate(), from: 'bad', to: '2026-09-08' })).status, 400)
  assert.equal(seen.length, 0)
  const first = await app.call({ b2cToken: tokenA, eventFormat: 'Custom Non-Tech Event' })
  assert.equal(first.status, 200)
  assert.equal(first.headers['Cache-Control'], 'private, no-store')
  assert.equal((await app.call({ b2cToken: tokenA })).status, 429)
  assert.equal((await app.call({ b2cToken: tokenB }, 'dashboard-b')).status, 200)
  app.advance()
  assert.equal((await app.call({ b2cToken: tokenA })).status, 200)
  assert.deepEqual(seen, [tokenA, tokenB, tokenA])
  assert.ok(!JSON.stringify(first.data).includes(tokenA))
})

test('Custom Tech auto refresh uses five minutes only when enabled, no background polling or automatic retries', () => {
  const active = customTechQueryOptions('account-a', null, true)
  assert.equal(CUSTOM_TECH_REFRESH_MS, 300_000)
  assert.equal(active.refetchInterval, 300_000)
  assert.equal(active.staleTime, 300_000)
  assert.equal(active.gcTime, 0)
  assert.equal(active.retry, false)
  assert.equal(active.refetchIntervalInBackground, false)
  const hidden = customTechQueryOptions('account-a', null, false)
  assert.equal(hidden.enabled, false)
  assert.equal(hidden.refetchInterval, false)
})

test('query keys isolate Custom Tech users and applied date ranges and never include credentials', async () => {
  const all = customTechQueryOptions('a', null, true)
  const september = customTechQueryOptions('a', { from: '2026-09-01', to: '2026-09-30' }, true)
  const otherAccount = customTechQueryOptions('b', null, true)
  assert.notDeepEqual(all.queryKey, september.queryKey)
  assert.notDeepEqual(all.queryKey, otherAccount.queryKey)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  try {
    client.setQueryData(all.queryKey, { ...empty(), items: [mapCustomTechRequest(row())] })
    assert.equal(client.getQueryData(september.queryKey), undefined)
    assert.equal(client.getQueryData(otherAccount.queryKey), undefined)
    await assert.rejects(client.fetchQuery({ ...otherAccount, queryFn: async () => { throw new Error('Denied') } }))
    assert.equal(client.getQueryData(otherAccount.queryKey), undefined)
    assert.equal((client.getQueryData(all.queryKey) as RmpEventScanResult).items.length, 1)
  } finally { client.clear() }
})

test('UI hides previous Custom Tech results on rejected credentials but can label a transient same-account snapshot', () => {
  for (const status of [401, 403]) assert.equal(customTechError({ response: { status, data: { error: 'Access rejected' } } }).accessDenied, true)
  assert.equal(customTechError({ requiresReauth: true, message: 'Sign in' }).accessDenied, true)
  assert.equal(customTechError({ response: { status: 502, data: { error: 'Temporarily unavailable' } } }).accessDenied, false)
  assert.equal(customTechError({ response: { status: 502, data: { error: 'Temporarily unavailable' } } }).message, 'Temporarily unavailable')
})