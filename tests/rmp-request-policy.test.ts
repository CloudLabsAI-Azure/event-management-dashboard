import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import {
  isRmpRequestImport, preserveHiddenRmpImports, rmpRequestImportsEnabled,
  visibleDashboardData, visibleLabResource,
} from '../backend/rmpRequestPolicy.js'

const manual = { id: 'manual', sr: 2, type: 'roadmapItem', trackTitle: 'Manual lab', phase: 'Under assessment' }
const imported = { id: 'rmp_fixture', sr: 99, type: 'roadmapItem', trackTitle: 'Unneeded RMP request', source: 'rmp', rmpRequestUniqueName: 'fixture-request', eventId: 'EXAMPLE-RESERVED' }
const stored = () => ({
  catalog: [structuredClone(manual), structuredClone(imported), { id: 'notice', sr: 3, type: 'generalAnnouncement', title: 'Team notice' }],
  tracks: [], events: [], reviews: [{ id: 'feedback' }],
  _rmpSync: { processedRequestIds: ['fixture-request'], lastSync: '2026-09-07T00:00:00Z' },
})

test('request imports default to paused and require explicit opt-in to restore', () => {
  assert.equal(rmpRequestImportsEnabled({}), false)
  for (const value of ['', 'false', '0', 'yes']) assert.equal(rmpRequestImportsEnabled({ RMP_REQUEST_IMPORTS_ENABLED: value }), false)
  assert.equal(rmpRequestImportsEnabled({ RMP_REQUEST_IMPORTS_ENABLED: 'true' }), true)
  assert.equal(rmpRequestImportsEnabled({ RMP_REQUEST_IMPORTS_ENABLED: ' TRUE ' }), true)
})

test('recognizes RMP provenance without hiding manual or real catalogue release records', () => {
  assert.equal(isRmpRequestImport(imported), true)
  assert.equal(isRmpRequestImport({ source: ' RMP ' }), true)
  assert.equal(isRmpRequestImport({ rmpRequestUniqueName: 'legacy-request' }), true)
  assert.equal(isRmpRequestImport(manual), false)
  assert.equal(isRmpRequestImport({ id: 'track-guid', source: 'RMP Catalog', kind: 'new-release' }), false)
  assert.equal(isRmpRequestImport(null), false)
})

test('response projection hides all imported lab types without mutating or renumbering storage', () => {
  const data = stored()
  data.catalog.push(...['tttSession', 'customLabRequest', 'localizedTrack'].map((type, index) => ({ ...imported, id: `import-${index}`, sr: 100 + index, type })))
  const before = structuredClone(data)
  const visible = visibleDashboardData(data)
  assert.deepEqual(visible.catalog.map((item: { sr: number }) => item.sr), [2, 3])
  assert.deepEqual(visible.reviews, data.reviews)
  assert.deepEqual(data, before)
  assert.equal(visibleLabResource('catalog', data.catalog, true), data.catalog)
  assert.equal(visibleDashboardData(data, true).catalog.length, data.catalog.length)
})

test('visibility filtering applies only to lab resources', () => {
  assert.deepEqual(visibleLabResource('tracks', [manual, imported]), [manual])
  assert.deepEqual(visibleLabResource('events', [manual, imported]), [manual])
  assert.deepEqual(visibleLabResource('users', [manual, imported]), [manual, imported])
})

test('round-tripping filtered data cannot remove hidden imports or reset their baseline', () => {
  const data = stored()
  const filtered = visibleDashboardData(data)
  const next = preserveHiddenRmpImports({ ...filtered, _rmpSync: {} }, data)
  assert.deepEqual(next.catalog.find((item: { id: string }) => item.id === imported.id), imported)
  assert.deepEqual(next._rmpSync, data._rmpSync)
  assert.equal(next.catalog.length, data.catalog.length)
  assert.deepEqual(data, stored())
})

test('stale whole-data updates cannot overwrite hidden imports by ID or serial number', () => {
  const data = stored()
  const next = preserveHiddenRmpImports({ catalog: [{ ...manual, trackTitle: 'Edited manually' }, { ...imported, source: '', rmpRequestUniqueName: '', trackTitle: 'Stale edit' }] }, data)
  assert.equal(next.catalog.length, 2)
  assert.equal(next.catalog[0].trackTitle, 'Edited manually')
  assert.deepEqual(next.catalog[1], imported)
  assert.equal(preserveHiddenRmpImports({}, data).catalog.length, 1)
})

type Request = { params?: Record<string, string>; body?: Record<string, unknown>; query?: Record<string, string>; user?: Record<string, string> }
type Handler = (req: Request, res: { json: (body: unknown) => unknown; status: (code: number) => unknown }) => Promise<void>

/** Exercise the real GET and manual-edit routes without booting the live server. */
function routeHarness(enabled = false) {
  const code = readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8')
  const routes = new Map<string, Handler>()
  let data: Record<string, unknown> = stored()
  let writes = 0
  const register = (method: string) => (path: string, ...callbacks: Handler[]) => routes.set(`${method} ${path}`, callbacks[callbacks.length - 1])
  const context = vm.createContext({
    app: { get: register('GET'), post: register('POST'), put: register('PUT'), delete: register('DELETE') },
    RMP_REQUEST_IMPORTS_ENABLED: enabled, visibleLabResource, visibleDashboardData, preserveHiddenRmpImports,
    requireAdmin: () => {}, sanitizeRequest: () => {},
    readData: async () => structuredClone(data),
    writeData: async (next: Record<string, unknown>) => { writes++; data = structuredClone(next) },
    withLock: async (fn: () => unknown) => fn(),
    logAudit: async () => {}, crypto: { randomBytes: () => Buffer.from('synthetic-id') },
    process: { env: { STORAGE_MODE: 'local' } }, console: { log() {}, warn() {}, error() {} },
  })
  const section = (from: string, to: string) => {
    const start = code.indexOf(from)
    const end = code.indexOf(to, start)
    assert.ok(start >= 0 && end > start)
    vm.runInContext(code.slice(start, end), context)
  }
  section('const VALID_RESOURCES =', '// Ensure data schema')
  section("app.get('/api/data'", '// Proxy endpoint')
  section("app.post('/api/data'", '// Delete review endpoint')
  section("app.get('/api/:resource'", '// Start server')
  section("app.get('/api/check-duplicate-eventid'", '// Diagnostics: lock status')

  async function call(route: string, request: Request = {}) {
    let body: unknown
    let status = 200
    const res = { json: (value: unknown) => { body = value; return res }, status: (value: number) => { status = value; return res } }
    await routes.get(route)!({ body: {}, params: {}, query: {}, user: { email: 'fixture@example.invalid' }, ...request }, res)
    return { status, body }
  }
  return { call, data: () => data, writes: () => writes }
}

test('actual catalog/data GET routes hide imports while internal reads keep them', async () => {
  const app = routeHarness()
  const catalog = await app.call('GET /api/:resource', { params: { resource: 'catalog' } })
  assert.equal((catalog.body as object[]).length, 2)
  const whole = await app.call('GET /api/data')
  assert.equal((whole.body as { catalog: object[] }).catalog.length, 2)
  assert.equal((app.data().catalog as object[]).length, 3)
  assert.equal(app.writes(), 0)
})

test('manual edits/creates do not drop hidden rows and allocate IDs after them', async () => {
  const app = routeHarness()
  await app.call('PUT /api/:resource/:id', { params: { resource: 'catalog', id: '2' }, body: { trackTitle: 'Edited manual lab' } })
  const created = await app.call('POST /api/:resource', { params: { resource: 'catalog' }, body: { trackTitle: 'Another manual lab', type: 'roadmapItem' } })
  assert.equal((created.body as { item: { sr: number } }).item.sr, 100)
  const rows = app.data().catalog as Array<typeof imported>
  assert.equal(rows.find(item => item.id === manual.id)?.trackTitle, 'Edited manual lab')
  assert.deepEqual(rows.find(item => item.id === imported.id), imported)
})

test('legacy whole-data API preserves hidden rows when saving its filtered GET result', async () => {
  const app = routeHarness()
  const response = await app.call('GET /api/data')
  await app.call('POST /api/data', { body: response.body as Record<string, unknown> })
  assert.equal((app.data().catalog as object[]).length, 3)
})

test('hidden import event IDs remain reserved and re-enable reveals the stored records', async () => {
  const app = routeHarness()
  const result = await app.call('GET /api/check-duplicate-eventid', { query: { eventId: imported.eventId } })
  assert.equal((result.body as { isDuplicate: boolean }).isDuplicate, true)
  const enabled = routeHarness(true)
  assert.equal(((await enabled.call('GET /api/:resource', { params: { resource: 'catalog' } })).body as object[]).length, 3)
})