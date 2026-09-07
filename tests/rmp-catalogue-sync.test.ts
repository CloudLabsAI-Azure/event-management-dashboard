import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRmpCatalogueSync, createRmpCatalogueStore, registerRmpCatalogueRoutes } from '../backend/rmpCatalogueSync.js'
import { RmpApiError } from '../backend/rmpService.js'

const sourceKey = 'fixture/tenant'
const old = { version: 1, sourceKey, lastSyncedAt: '2026-05-01T00:00:00Z', totalTracks: 1, detailErrors: 0, items: [{ id: 'saved' }] }

function harness(options: { hasToken?: boolean; fail?: number; persisted?: object | null } = {}) {
  let current: { token: string } | null = options.hasToken === false ? null : { token: 'verified-fixture' }
  let now = Date.parse('2026-09-07T00:00:00Z')
  let calls = 0
  let writes = 0
  const stored = options.persisted === undefined ? old : options.persisted
  const service = createRmpCatalogueSync({
    sourceKey, now: () => now,
    tokenCache: { get: () => current, invalidate: (token: string) => { if (current?.token === token) current = null } },
    readSnapshot: async () => structuredClone(stored),
    writeSnapshot: async () => { writes++ },
    fetchCatalogue: async () => {
      calls++
      if (options.fail) throw new RmpApiError('Synthetic failure', options.fail)
      return { ...old, lastSyncedAt: new Date(now).toISOString(), items: [{ id: 'fresh' }] }
    },
  })
  return { service, calls: () => calls, writes: () => writes, advance: (ms: number) => { now += ms }, setToken: (token: string) => { current = { token } } }
}

test('saved catalogue remains available without a valid token, and is marked stale', async () => {
  const app = harness({ hasToken: false })
  const result = await app.service.get()
  assert.equal(result.items[0].id, 'saved')
  assert.equal(result.stale, true)
  assert.equal(result.tokenAvailable, false)
  assert.equal(app.calls(), 0)
})

test('fresh cache avoids repeated upstream calls; stale cache refreshes automatically', async () => {
  const app = harness()
  await app.service.refresh()
  assert.equal(app.calls(), 1)
  const fresh = await app.service.get()
  assert.equal(fresh.stale, false)
  assert.equal(fresh.items[0].id, 'fresh')
  assert.equal(app.calls(), 1)
  app.advance(16 * 60_000)
  await app.service.get()
  await app.service.refresh()
  assert.equal(app.calls(), 2)
})

test('ordinary failures preserve the snapshot and token and apply retry backoff', async () => {
  const app = harness({ fail: 502 })
  const state = await app.service.refresh()
  assert.equal(state.items[0].id, 'saved')
  assert.equal(state.lastSyncedAt, old.lastSyncedAt)
  assert.equal(state.tokenAvailable, true)
  assert.ok(state.error)
  assert.equal(app.writes(), 0)
  await app.service.refresh({ force: true })
  assert.equal(app.calls(), 1)
  app.advance(60_001)
  await app.service.refresh()
  assert.equal(app.calls(), 2)
})

test('revoked credentials are evicted, while catalogue-only permission denial leaves request token intact', async () => {
  const revoked = harness({ fail: 401 })
  assert.equal((await revoked.service.refresh()).tokenAvailable, false)
  const deniedCatalogue = harness({ fail: 403 })
  const state = await deniedCatalogue.service.refresh()
  assert.equal(state.tokenAvailable, true)
  assert.equal(state.items[0].id, 'saved')
})

test('snapshots from another tenant are never served', async () => {
  const app = harness({ hasToken: false, persisted: { ...old, sourceKey: 'other/tenant' } })
  assert.deepEqual((await app.service.get()).items, [])
})

test('concurrent readers share one sync and publish only after persistence', async () => {
  let finish!: (value: typeof old) => void
  let writes = 0
  let calls = 0
  const service = createRmpCatalogueSync({
    sourceKey, tokenCache: { get: () => ({ token: 'fixture' }) },
    readSnapshot: async () => old, writeSnapshot: async () => { writes++ },
    fetchCatalogue: () => { calls++; return new Promise<typeof old>(resolve => { finish = resolve }) },
  })
  const reads = await Promise.all([service.get(), service.get(), service.queueRefresh({ force: true })])
  assert.ok(reads.every(read => read.refreshing))
  assert.equal(calls, 1)
  assert.equal(writes, 0)
  finish({ ...old, lastSyncedAt: new Date().toISOString() })
  await service.refresh()
  assert.equal(writes, 1)
  assert.equal((await service.get()).refreshing, false)
})

test('failed persistence cannot replace last-known-good catalogue data', async () => {
  const service = createRmpCatalogueSync({
    sourceKey, tokenCache: { get: () => ({ token: 'fixture' }) },
    readSnapshot: async () => old,
    writeSnapshot: async () => { throw new Error('Storage unavailable') },
    fetchCatalogue: async () => ({ ...old, items: [{ id: 'not-persisted' }], lastSyncedAt: new Date().toISOString() }),
  })
  assert.equal((await service.refresh()).items[0].id, 'saved')
})

test('catalogue routes require dashboard authentication and denied candidates cannot queue a refresh', async () => {
  const routes = new Map<string, { middleware: unknown; handler: (req: unknown, res: unknown) => Promise<void> }>()
  const guard = () => {}
  let queued = 0
  const register = (path: string, middleware: unknown, handler: (req: unknown, res: unknown) => Promise<void>) => routes.set(path, { middleware, handler })
  registerRmpCatalogueRoutes({ get: register, post: register }, {
    requireAuth: guard,
    tokenCache: { get: () => ({ token: 'working' }), cacheIfAuthorized: async () => { throw new RmpApiError('Denied', 403) } },
    catalogueSync: { queueRefresh: async () => { queued++; return {} }, get: async () => ({ items: [] }) },
  })
  assert.equal(routes.get('/api/rmp/catalogue')?.middleware, guard)
  assert.equal(routes.get('/api/rmp/catalogue/sync')?.middleware, guard)
  let status = 200
  const res = { status: (code: number) => { status = code; return res }, json: () => res }
  await routes.get('/api/rmp/catalogue/sync')!.handler({ body: { b2cToken: 'denied' }, user: {} }, res)
  assert.equal(status, 403)
  assert.equal(queued, 0)
})

test('range caches are isolated and cannot replace the full persisted snapshot', async () => {
  const written: unknown[] = []
  const fetched: unknown[] = []
  const august = { from: '2026-08-01', to: '2026-08-31' }
  const september = { from: '2026-09-01', to: '2026-09-07' }
  const service = createRmpCatalogueStore({
    sourceKey,
    tokenCache: { get: () => ({ token: 'fixture' }) },
    readSnapshot: async () => old,
    writeSnapshot: async (value: unknown) => { written.push(value) },
    fetchCatalogue: async (_token: string, { range }: { range: { from: string; to: string } | null }) => {
      fetched.push(range)
      return { ...old, range, lastSyncedAt: new Date().toISOString(), items: range?.from === september.from ? [] : [{ id: range?.from || 'full' }] }
    },
  })
  const first = await service.refresh({ range: august })
  assert.equal(first.items[0].id, august.from)
  const empty = await service.refresh({ range: september })
  assert.deepEqual(empty.items, [])
  assert.deepEqual(empty.range, september)
  const restored = await service.get({ range: august, refresh: false })
  assert.equal(restored.items[0].id, august.from)
  assert.equal(written.length, 0)
  assert.equal((await service.get({ refresh: false })).items[0].id, 'saved')
  await service.refresh()
  assert.equal(written.length, 1)
  assert.deepEqual(fetched, [august, september, null])
})

test('failed range refresh never falls back to a different date range or the full catalogue', async () => {
  const service = createRmpCatalogueStore({
    sourceKey, tokenCache: { get: () => ({ token: 'fixture' }) },
    readSnapshot: async () => old, writeSnapshot: async () => {},
    fetchCatalogue: async () => { throw new RmpApiError('Unavailable', 503) },
  })
  const state = await service.refresh({ range: { from: '2026-08-01', to: '2026-09-07' } })
  assert.deepEqual(state.items, [])
  assert.equal(state.lastSyncedAt, null)
  assert.ok(state.error)
})

test('upstream work for different ranges is serialized rather than multiplying concurrency', async () => {
  let finishFirst!: (value: typeof old & { range: unknown }) => void
  const calls: unknown[] = []
  const firstRange = { from: '2026-08-01', to: '2026-08-31' }
  const secondRange = { from: '2026-09-01', to: '2026-09-07' }
  const service = createRmpCatalogueStore({
    sourceKey, tokenCache: { get: () => ({ token: 'fixture' }) },
    readSnapshot: async () => old, writeSnapshot: async () => {},
    fetchCatalogue: (_token: string, { range }: { range: unknown }) => {
      calls.push(range)
      return calls.length === 1 ? new Promise<typeof old & { range: unknown }>(resolve => { finishFirst = resolve }) : Promise.resolve({ ...old, range })
    },
  })
  await service.get({ range: firstRange })
  await service.get({ range: secondRange })
  assert.equal(calls.length, 1)
  finishFirst({ ...old, range: firstRange })
  await service.refresh({ range: secondRange })
  assert.deepEqual(calls, [firstRange, secondRange])
})

test('catalogue routes forward validated GET/POST dates and reject malformed input before auth probing', async () => {
  const handlers = new Map<string, (req: unknown, res: unknown) => Promise<void>>()
  const register = (path: string, _guard: unknown, handler: (req: unknown, res: unknown) => Promise<void>) => handlers.set(path, handler)
  const forwarded: unknown[] = []
  let probes = 0
  registerRmpCatalogueRoutes({ get: register, post: register }, {
    requireAuth: () => {}, tokenCache: { get: () => ({ token: 'fixture' }), cacheIfAuthorized: async () => { probes++ } },
    catalogueSync: { get: async (args: unknown) => { forwarded.push(args); return {} }, queueRefresh: async (args: unknown) => { forwarded.push(args); return { refreshing: true } } },
  })
  let status = 200
  const res = { setHeader() {}, status: (value: number) => { status = value; return res }, json: () => res }
  const range = { from: '2026-08-01', to: '2026-09-07' }
  await handlers.get('/api/rmp/catalogue')!({ query: range }, res)
  await handlers.get('/api/rmp/catalogue/sync')!({ body: range }, res)
  assert.equal(status, 202)
  assert.deepEqual(forwarded, [{ range }, { force: true, range }])
  await handlers.get('/api/rmp/catalogue/sync')!({ body: { from: '2026-02-30', to: range.to, b2cToken: 'fixture' } }, res)
  assert.equal(status, 400)
  assert.equal(probes, 0)
})