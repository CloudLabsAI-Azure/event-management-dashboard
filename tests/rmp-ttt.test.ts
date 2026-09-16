import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isExplicitTttFormat, mapTttScanRequest, normalizeTttRange, registerRmpTttRoutes, scanRmpTtt } from '../backend/rmpTttService.js'
import { RmpApiError, getRmpConfig } from '../backend/rmpService.js'
import type { RmpTttRange, RmpTttScanResult } from '../src/types/rmpTtt'

const config = { apiBaseUrl: 'https://example.invalid', tenantId: 'fixture-tenant', tttEventFormatId: '4CEE1672-2E96-47FC-93B4-93433FCE98A2' }
const guid = (n: number) => `abcdef01-0000-4000-8000-${String(n).padStart(12, '0')}`
const token = (subject = 'fixture', expiry = Math.floor(Date.now() / 1000) + 3600) => `fixture.${Buffer.from(JSON.stringify({ sub: subject, exp: expiry })).toString('base64url')}.not-a-real-signature`
const row = (n = 1, overrides = {}) => ({
  RequestUniqueName: guid(n), RequestId: `TEST-TTT-${n}`, Title: `Trainer workshop ${n}`,
  EventFormat: 'Train-The-Trainer', Status: 'Approved', ScheduledDate: '2026-08-20T00:00:00',
  TemplateName: 'AI trainer lab', TimeZoneLabel: 'India Standard Time', TotalRecords: 1,
  AdminURL: `https://admin.cloudevents.ai/events/${guid(n)}`,
  RequestorEmail: 'private-fixture@example.invalid', AdditionalEventSettings: 'SYNTHETIC-PRIVATE-SETTING',
  ...overrides,
})
const detail = (n = 1, overrides = {}) => ({
  UniqueName: guid(n), TimeZone: 'India Standard Time', DeliveryLanguageName: 'English',
  SessionRequests: [{ Title: 'Facilitation', StartDate: '2026-08-20T00:00:00', StartTime: '09:30:00', EndDate: '2026-08-20T00:00:00', EndTime: '11:30:00' }],
  RequestorEmail: 'private-fixture@example.invalid', AdditionalEventSettings: 'SYNTHETIC-PRIVATE-SETTING', ...overrides,
})
type CallOptions = { token: string; method?: string; body?: Record<string, unknown>; signal?: AbortSignal }
const success = (Data: unknown) => ({ Status: 'Success', Data })

test('TTT matches only the explicit My Events event format, never title keywords or loose acronyms', () => {
  for (const format of ['Train-The-Trainer', 'train-the-trainer', ' Train The Trainer ', 'Train–The–Trainer', 'Train_The_Trainer']) assert.equal(isExplicitTttFormat(format), true)
  for (const format of ['TTT', 'Train a trainer', 'Train-The-Trainer Budget', 'Custom', null, {}, 123]) assert.equal(isExplicitTttFormat(format), false)
  assert.throws(() => mapTttScanRequest(row(1, { EventFormat: 'Hands-On Lab', Title: 'TTT Train-The-Trainer lab' })), { statusCode: 502 })
})

test('TTT scheduled ranges are inclusive calendar dates and reject invalid or injected input', () => {
  assert.deepEqual(normalizeTttRange({ from: '2026-08-20', to: '2026-08-20' }), { from: '2026-08-20', to: '2026-08-20' })
  assert.deepEqual(normalizeTttRange({ from: '2024-02-29', to: '2024-03-01' }), { from: '2024-02-29', to: '2024-03-01' })
  assert.equal(normalizeTttRange(null), null)
  assert.equal(normalizeTttRange({ from: '', to: '' }), null)
  for (const range of [
    { from: '2026-02-29', to: '2026-03-01' }, { from: '2026-08-20', to: '2026-08-19' },
    { from: '2026-08-20' }, { to: '2026-08-20' }, { from: ['2026-08-20'], to: '2026-08-20' },
    { from: '2026-08-20T00:00:00', to: '2026-08-21' }, { from: '2026-08-20) or true', to: '2026-08-21' },
  ]) assert.throws(() => normalizeTttRange(range), { statusCode: 400 })
})

test('display-only projection preserves source statuses and event-local times without private metadata', () => {
  for (const status of ['Draft', 'Submitted', 'ApprovedActionRequired', 'PendingActionRequired', 'Canceled', 'Cancelled', 'Rejected', 'Completed']) {
    const item = mapTttScanRequest(Object.freeze(row(1, { Status: status })), detail())
    assert.equal(item.status, status)
    assert.equal(item.requestId, guid(1).toUpperCase())
    assert.equal(item.requestCode, 'TEST-TTT-1')
    assert.equal(item.scheduledDate, '2026-08-20')
    assert.equal(item.sessions[0].startTime, '09:30')
    assert.equal(item.sessions[0].date, '2026-08-20')
    assert.equal(item.timeZone, 'India Standard Time')
    assert.equal(item.language, 'English')
    assert.ok(!JSON.stringify(item).includes('private-fixture'))
    assert.ok(!JSON.stringify(item).includes('SYNTHETIC-PRIVATE-SETTING'))
    assert.equal('sr' in item, false)
    assert.equal('source' in item, false)
  }
  assert.equal(mapTttScanRequest(row(1, { Status: '' })).status, 'Unknown')
})

test('missing or malformed dates/times remain unknown and camelCase scheduled fallback is supported', () => {
  const item = mapTttScanRequest(row(1, { ScheduledDate: '2026-02-30', scheduleStartDate: '2026-08-21T00:00:00' }), detail(1, {
    SessionRequests: [
      { StartDate: '2026-02-30', StartTime: '25:00', EndTime: '11:60' },
      { StartDate: '2026-08-20', EndDate: '2026-08-21', StartTime: '09:30:00.0000000', EndTime: '11:30:99' },
    ],
  }))
  assert.equal(item.scheduledDate, '2026-08-21')
  assert.equal(item.sessions[0].date, null)
  assert.equal(item.sessions[0].startTime, null)
  assert.equal(item.sessions[0].endTime, null)
  assert.equal(item.sessions[1].endDate, '2026-08-21')
  assert.equal(item.sessions[1].startTime, '09:30')
  assert.equal(item.sessions[1].endTime, null)
  const unavailable = mapTttScanRequest(row(1, { ScheduledDate: null }))
  assert.equal(unavailable.scheduledDate, null)
  assert.equal(unavailable.detailsAvailable, false)
  assert.deepEqual(unavailable.sessions, [])
})

test('source links use the verified read-only View route, even when AdminURL is absent or unsafe', () => {
  for (const AdminURL of [
    'javascript:alert(1)', 'https://example.invalid/events', 'http://admin.cloudevents.ai/events',
    'https://user:fixture@admin.cloudevents.ai/events', 'https://admin.cloudevents.ai:8080/events',
    'https://admin.cloudevents.ai/events?token=fixture', 'https://admin.cloudevents.ai/events?code=fixture',
    'https://admin.cloudevents.ai/events#access_token=fixture',
    undefined,
  ]) assert.equal(mapTttScanRequest(row(1, { AdminURL })).adminUrl, `https://admin.cloudevents.ai/events/${guid(1).toUpperCase()}/view`)
  assert.equal(mapTttScanRequest(row()).adminUrl, `https://admin.cloudevents.ai/events/${guid(1).toUpperCase()}/view`)
})

test('scans every My Events page, retains all statuses and fetches details only for genuine TTT', async () => {
  const range = { from: '2026-08-01', to: '2026-09-08' }
  const calls: { path: string; options: CallOptions }[] = []
  const rows = [
    row(1, { TotalRecords: 5, EventFormat: 'Hands-On Lab', Title: 'TTT unrelated title' }),
    row(2, { TotalRecords: 5, Status: 'Completed', ScheduledDate: '2026-08-01T00:00:00' }),
    row(3, { TotalRecords: 5, EventFormat: 'Budget', Title: 'Train-The-Trainer funding' }),
    row(4, { TotalRecords: 5, Status: 'Canceled', ScheduledDate: '2026-09-08T00:00:00' }),
    row(5, { TotalRecords: 5, Status: 'Rejected' }),
  ]
  const candidate = token()
  const request = async (path: string, options: CallOptions) => {
    calls.push({ path, options })
    if (path.endsWith('/myevents')) {
      const page = Number(options.body?.PageNumber)
      // Emulate the portal clamping a request for 100 rows down to two.
      if (page > 1) assert.equal(options.body?.PageSize, 2)
      return success(rows.slice((page - 1) * 2, page * 2))
    }
    const n = Number(path.slice(-12))
    return success(detail(n))
  }
  const result = await scanRmpTtt(candidate, { range, request, config })
  assert.equal(result.scannedRequests, 5)
  assert.deepEqual(result.items.map(item => item.requestCode), ['TEST-TTT-2', 'TEST-TTT-4', 'TEST-TTT-5'])
  assert.deepEqual(result.items.map(item => item.status), ['Completed', 'Canceled', 'Rejected'])
  assert.equal(result.detailErrors, 0)
  assert.equal(result.readOnly, true)
  assert.equal(result.scope, 'current-account')
  assert.deepEqual(result.range, range)
  const list = calls.filter(call => call.path.endsWith('/myevents'))
  assert.deepEqual(list.map(call => call.options.body?.PageNumber), [1, 2, 3])
  for (const call of list) {
    assert.equal(call.path, '/api/admin/v1.0/tenants/fixture-tenant/myevents')
    assert.equal(call.options.method, 'POST')
    assert.equal(call.options.body?.ScheduleStartDate, `${range.from}T00:00:00`)
    assert.equal(call.options.body?.ScheduleEndDate, `${range.to}T00:00:00`)
    assert.equal(call.options.body?.Status, null)
    assert.equal(call.options.body?.EventFormat, config.tttEventFormatId)
    assert.equal(call.options.body?.SearchTitle, null)
    assert.equal(call.options.body?.SearchRequest, null)
  }
  assert.equal(calls.filter(call => call.path.startsWith('/api/tenants/fixture-tenant/eventrequests/')).length, 3)
  assert.ok(calls.every(call => call.options.token === candidate && call.options.signal instanceof AbortSignal))
  assert.ok(!JSON.stringify(result).includes(candidate))
})

test('the verified default-tenant TTT filter is configured without applying it blindly to another tenant', async () => {
  const configured = getRmpConfig()
  if (configured.tenantId.toUpperCase() === 'EAB203B6-FF38-4DFE-912F-D09EBD3E57E6' && !process.env.RMP_TTT_EVENT_FORMAT_ID) {
    assert.equal(configured.tttEventFormatId, config.tttEventFormatId)
  }
  let called = false
  await scanRmpTtt(token(), { config: { ...config, tttEventFormatId: null }, request: async (_path, options) => {
    called = true
    assert.equal(options.body?.EventFormat, null)
    assert.equal(options.body?.ScheduleStartDate, null)
    assert.equal(options.body?.ScheduleEndDate, null)
    return success([])
  } })
  assert.equal(called, true)
  await assert.rejects(scanRmpTtt(token(), { config: { ...config, tttEventFormatId: 'not-a-guid' }, request: async () => { assert.fail('Must reject bad configuration before upstream call') } }), { statusCode: 502 })
})

test('the My Events status remains authoritative if the detail endpoint reports an older workflow status', () => {
  const item = mapTttScanRequest(row(1, { Status: 'Completed' }), detail(1, { EventRequestStatus: 'Approved' }))
  assert.equal(item.status, 'Completed')
})

test('known out-of-range and undated requests cannot leak into a bounded scan', async () => {
  const rows = [
    row(1, { TotalRecords: 4, ScheduledDate: '2026-07-31' }), row(2, { TotalRecords: 4, ScheduledDate: '2026-08-01' }),
    row(3, { TotalRecords: 4, ScheduledDate: null }), row(4, { TotalRecords: 4, ScheduledDate: '2026-09-01' }),
  ]
  const request = async (path: string) => path.endsWith('/myevents') ? success(rows) : success(detail(Number(path.slice(-12))))
  const scoped = await scanRmpTtt(token(), { range: { from: '2026-08-01', to: '2026-08-31' }, request, config })
  assert.deepEqual(scoped.items.map(item => item.requestCode), ['TEST-TTT-2'])
  const all = await scanRmpTtt(token(), { request, config })
  assert.equal(all.items.length, 4)
  assert.equal(all.items[2].scheduledDate, null)
  assert.equal(all.range, null)
})

test('source empty/no-visibility behavior is explicit and ordinary failures never become zero results', async () => {
  for (const request of [
    async () => success([]),
    async () => { throw new RmpApiError('No results', 500, 'No event found.') },
  ]) {
    const result = await scanRmpTtt(token(), { request, config })
    assert.equal(result.scannedRequests, 0)
    assert.deepEqual(result.items, [])
  }
  for (const status of [401, 403, 500, 503]) {
    await assert.rejects(scanRmpTtt(token(), { config, request: async () => { throw new RmpApiError('Failure', status, 'Unrelated error') } }), { statusCode: status })
  }
})

test('malformed or changing totals and incomplete/duplicate pages cannot publish partial TTT counts', async () => {
  const cases = [
    [{ Status: 'Error', Data: [] }], [success(null)], [success([null])],
    [success([row(1, { TotalRecords: null })])], [success([row(1, { RequestUniqueName: 'bad' })])],
    [success([row(1, { TotalRecords: 2 })]), success([])],
    [success([row(1, { TotalRecords: 2 })]), success([row(1, { TotalRecords: 2, RequestUniqueName: guid(1).toUpperCase() })])],
    [success([row(1, { TotalRecords: 2 })]), success([row(2, { TotalRecords: 3 })])],
    [success([row(1, { TotalRecords: 3 }), row(2, { TotalRecords: 3 })]), success([row(2, { TotalRecords: 3 })])],
  ]
  for (const pages of cases) {
    let page = 0
    await assert.rejects(scanRmpTtt(token(), { config, request: async () => pages[page++] }), { statusCode: 502 })
  }
})

test('safety cap and cancellation fail before expensive detail reads', async () => {
  let reads = 0
  await assert.rejects(scanRmpTtt(token(), { config, maxPages: 2, request: async () => { reads++; return success([row(1, { TotalRecords: 3 })]) } }), { statusCode: 422 })
  assert.equal(reads, 1)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(scanRmpTtt(token(), { config, signal: controller.signal, request: async () => { reads++; return success([]) } }), { name: 'AbortError' })
  assert.equal(reads, 1)
})

test('expired or malformed tokens and invalid ranges never contact RMP', async () => {
  let reads = 0
  const request = async () => { reads++; return success([]) }
  for (const candidate of ['', 'not-a-jwt', token('expired', Math.floor(Date.now() / 1000) - 1)]) {
    await assert.rejects(scanRmpTtt(candidate, { request, config }), { statusCode: 401 })
  }
  await assert.rejects(scanRmpTtt(token(), { request, config, range: { from: '2026-09-08', to: '2026-08-01' } }), { statusCode: 400 })
  assert.equal(reads, 0)
})

test('detail identity/schema failures and detail-specific denial are visibly unavailable, not fabricated schedules', async () => {
  for (const response of [success(detail(2)), { Status: 'Error', Data: detail() }, success(null), success([detail()])]) {
    const result = await scanRmpTtt(token(), { config, request: async path => path.endsWith('/myevents') ? success([row()]) : response })
    assert.equal(result.detailErrors, 1)
    assert.equal(result.items[0].detailsAvailable, false)
    assert.deepEqual(result.items[0].sessions, [])
  }
  const denied = await scanRmpTtt(token(), { config, request: async path => {
    if (path.endsWith('/myevents')) return success([row()])
    throw new RmpApiError('Detail denied', 403)
  } })
  assert.equal(denied.items.length, 1)
  assert.equal(denied.detailErrors, 1)
  const retry = await scanRmpTtt(token(), { config, request: async path => success(path.endsWith('/myevents') ? [row()] : detail()) })
  assert.equal(retry.detailErrors, 0)
})

test('token revocation or total scan cancellation during details aborts rather than publishing stale access', async () => {
  await assert.rejects(scanRmpTtt(token(), { config, request: async path => {
    if (path.endsWith('/myevents')) return success([row()])
    throw new RmpApiError('Revoked', 401)
  } }), { statusCode: 401 })
  const controller = new AbortController()
  await assert.rejects(scanRmpTtt(token(), { config, signal: controller.signal, request: async path => {
    if (path.endsWith('/myevents')) return success([row()])
    controller.abort()
    return success(detail())
  } }), { name: 'AbortError' })
})

test('session details are bounded to five concurrent reads while scanning every matched request', async () => {
  let active = 0
  let peak = 0
  let fetched = 0
  const rows = Array.from({ length: 12 }, (_, n) => row(n + 1, { TotalRecords: 12 }))
  const result = await scanRmpTtt(token(), { config, request: async path => {
    if (path.endsWith('/myevents')) return success(rows)
    active++; peak = Math.max(peak, active); fetched++
    await new Promise(resolve => setImmediate(resolve))
    active--
    return success(detail(Number(path.slice(-12))))
  } })
  assert.equal(peak, 5)
  assert.equal(fetched, 12)
  assert.equal(result.items.length, 12)
  assert.equal(result.detailErrors, 0)
})

type Scan = (candidate: string, options: { range: RmpTttRange | null }) => Promise<RmpTttScanResult>
const emptyResult = (range: RmpTttRange | null = null): RmpTttScanResult => ({ range, scannedAt: '2026-09-08T12:00:00Z', scannedRequests: 0, items: [], detailErrors: 0, readOnly: true, scope: 'current-account' })
type FakeRequest = { body: Record<string, unknown>; user?: { id: string | number } }
type FakeResponse = { setHeader(key: string, value: string): void; status(code: number): FakeResponse; json(body: unknown): FakeResponse }
type Handler = (req: FakeRequest, res: FakeResponse) => Promise<void>

function routeHarness(scan: Scan = async (_candidate, { range }) => emptyResult(range)) {
  let handler: Handler
  let clock = 1000
  const requireAuth = () => {}
  registerRmpTttRoutes({ post(path: string, auth: unknown, callback: Handler) {
    assert.equal(path, '/api/rmp/ttt/scan')
    assert.equal(auth, requireAuth, 'route must retain the dashboard authentication middleware')
    handler = callback
  } }, { requireAuth, scan, now: () => clock })
  const call = async (body: Record<string, unknown> = {}, user: FakeRequest['user'] = { id: 'user-a' }) => {
    let code = 200
    let response: Record<string, unknown> = {}
    const headers = new Map<string, string>()
    const res: FakeResponse = {
      setHeader(key, value) { headers.set(key, value) },
      status(value) { code = value; return res },
      json(value) { response = value as Record<string, unknown>; return res },
    }
    await handler({ body, user }, res)
    return { code, response, headers }
  }
  return { call, advance: () => { clock += 30_001 } }
}

test('TTT route requires the caller token, never borrows a shared token, and validates dates before scanning', async () => {
  let scans = 0
  const harness = routeHarness(async () => { scans++; return emptyResult() })
  assert.equal((await harness.call()).code, 401)
  assert.equal((await harness.call({ b2cToken: 'invalid' })).code, 401)
  assert.equal((await harness.call({ b2cToken: token(), from: 'bad', to: '2026-09-08' })).code, 400)
  assert.equal((await harness.call({ b2cToken: token() }, { id: '' })).code, 401)
  assert.equal(scans, 0)
})

test('successful route uses exactly the supplied account token and returns private no-store results', async () => {
  const candidate = token('current-user')
  const range = { from: '2026-08-01', to: '2026-09-08' }
  const harness = routeHarness(async (actual, options) => {
    assert.equal(actual, candidate)
    assert.deepEqual(options.range, range)
    return emptyResult(options.range)
  })
  const response = await harness.call({ b2cToken: candidate, ...range, EventFormat: 'Budget', SearchTitle: 'Ignored input' }, { id: 12 })
  assert.equal(response.code, 200)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(response.response.readOnly, true)
  assert.ok(!JSON.stringify(response.response).includes(candidate))
})

test('scans are not cached or shared between dashboard users or supplied B2C accounts', async () => {
  const candidates: string[] = []
  const firstToken = token('one')
  const secondToken = token('two')
  const harness = routeHarness(async candidate => {
    candidates.push(candidate)
    return { ...emptyResult(), items: [mapTttScanRequest(row(candidates.length))] }
  })
  const first = await harness.call({ b2cToken: firstToken })
  const second = await harness.call({ b2cToken: secondToken }, { id: 'user-b' })
  assert.notDeepEqual(first.response.items, second.response.items)
  assert.deepEqual(candidates, [firstToken, secondToken])
})

test('route limits same-user retries and global concurrent scans, then releases capacity', async () => {
  const release: (() => void)[] = []
  const harness = routeHarness(async () => { await new Promise<void>(resolve => release.push(resolve)); return emptyResult() })
  const first = harness.call({ b2cToken: token() })
  const duplicate = await harness.call({ b2cToken: token() })
  assert.equal(duplicate.code, 429)
  assert.equal(duplicate.headers.get('Retry-After'), '30')
  const second = harness.call({ b2cToken: token() }, { id: 'user-b' })
  assert.equal((await harness.call({ b2cToken: token() }, { id: 'user-c' })).code, 429)
  release.splice(0).forEach(resolve => resolve())
  assert.equal((await first).code, 200)
  assert.equal((await second).code, 200)
  assert.equal((await harness.call({ b2cToken: token() })).code, 429)
  harness.advance()
  const retry = harness.call({ b2cToken: token() })
  release.splice(0).forEach(resolve => resolve())
  assert.equal((await retry).code, 200)
})

test('upstream errors are sanitized, correctly mapped, and never expose credentials or raw request details', async () => {
  const candidate = token()
  for (const [upstream, expected] of [[401, 401], [403, 403], [408, 504], [0, 502], [500, 502], [429, 502]]) {
    const harness = routeHarness(async () => { throw new RmpApiError('SYNTHETIC-PRIVATE-UPSTREAM', upstream, candidate) })
    const result = await harness.call({ b2cToken: candidate })
    assert.equal(result.code, expected)
    assert.ok(!JSON.stringify(result.response).includes('SYNTHETIC-PRIVATE-UPSTREAM'))
    assert.ok(!JSON.stringify(result.response).includes(candidate))
    if (upstream === 401) assert.equal(result.response.requiresReauth, true)
    if (upstream === 403) assert.equal(result.response.requiresRmpAccess, true)
  }
  const tooBroad = routeHarness(async () => { throw new RmpApiError('Choose a narrower range.', 422) })
  assert.equal((await tooBroad.call({ b2cToken: token() })).code, 422)
})