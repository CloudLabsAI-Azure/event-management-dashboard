import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import express from 'express'
import { createRmpTttImporter, MAX_TTT_IMPORT_REQUESTS, normalizeTttImportIds, planTttImport, registerRmpTttImportRoutes } from '../backend/rmpTttImport.js'
import { RmpApiError } from '../backend/rmpService.js'
import { visibleLabResource } from '../backend/rmpRequestPolicy.js'
import { savedTttRequestIds } from '../src/lib/rmpTttImportState'
import { buildRmpTttView } from '../src/lib/rmpTttFilters'
import type { RmpTttImportResult, RmpTttRequest, RmpTttScanResult } from '../src/types/rmpTtt'

const guid = (n: number) => `ABCDEF01-0000-4000-8000-${String(n).padStart(12, '0')}`
const request = (n = 1, overrides: Partial<RmpTttRequest> = {}): RmpTttRequest => ({
  requestId: guid(n), requestCode: `TEST-TTT-${n}`, title: `TTT – Trainer ${n} 日本語`, eventFormat: 'Train-The-Trainer',
  status: 'Completed', scheduledDate: '2026-09-17', templateName: 'Trainer lab', timeZone: 'India Standard Time', language: 'English',
  adminUrl: `https://admin.cloudevents.ai/events/${guid(n)}/view`, detailsAvailable: true,
  sessions: [{ title: 'Training', date: '2026-09-17', endDate: '2026-09-17', startTime: '09:30', endTime: '11:00' }], ...overrides,
})
const initial = () => ({
  catalog: [{ id: 'manual-lab', sr: 40, type: 'roadmapItem', trackName: 'Manual lab', notes: 'Keep all fields' }],
  tracks: [], events: [{ id: 'unrelated' }], metrics: { completed: 12 }, tokens: [{ token: 'LOCAL-FIXTURE-ONLY' }],
  _rmpSync: { lastSync: '2026-09-01T00:00:00Z', processedRequestIds: [guid(1)] },
})
const snapshot = (items: RmpTttRequest[] = [request()]): RmpTttScanResult => ({ range: null, items, scannedAt: '2026-10-07T12:00:00Z', scannedRequests: items.length, detailErrors: 0, readOnly: true, scope: 'current-account' })
const token = (subject = 'fixture', exp = Math.floor(Date.now() / 1000) + 3600) => `fixture.${Buffer.from(JSON.stringify({ sub: subject, exp })).toString('base64url')}.not-a-real-signature`

test('TTT save selection accepts only a bounded, nonempty list of source GUIDs', () => {
  assert.deepEqual(normalizeTttImportIds([guid(1), ` ${guid(1).toLowerCase()} `, guid(2)]), [guid(1), guid(2)])
  for (const value of [undefined, [], 'a-guid', [null], ['TEST-TTT-1'], [123], [guid(1), 'bad'], Array(MAX_TTT_IMPORT_REQUESTS + 1).fill(guid(1))]) {
    assert.throws(() => normalizeTttImportIds(value), { statusCode: 400 })
  }
})

test('saving historical/baselined requests creates durable TTT sessions without changing other data', () => {
  const data = initial()
  const before = structuredClone(data)
  const source = { ...request(), privateSetting: 'DO-NOT-PERSIST', b2cToken: 'DO-NOT-PERSIST', requestorEmail: 'DO-NOT-PERSIST' }
  const result = planTttImport(data, [source], '2026-10-07T12:00:00Z')
  assert.deepEqual(data, before, 'the cached input must not be mutated before a successful storage write')
  assert.equal(result.summary.created, 1)
  assert.equal(result.data.catalog.length, 2)
  const saved = result.data.catalog[1]
  assert.equal(saved.sr, 41)
  assert.equal(saved.type, 'tttSession')
  assert.equal(saved.eventId, source.requestCode)
  assert.equal(saved.trackName, source.title)
  assert.equal(saved.status, 'Completed')
  assert.equal(saved.sessionDate, '2026-09-17')
  assert.equal(saved.rmpTimeZone, 'India Standard Time')
  assert.deepEqual(saved.rmpSessions, source.sessions)
  assert.equal(saved.rmpImportMode, 'ttt-scan')
  assert.equal(saved.rmpRequestUniqueName, guid(1))
  assert.ok(!JSON.stringify(saved).includes('DO-NOT-PERSIST'))
  for (const field of ['tracks', 'events', 'metrics', 'tokens', '_rmpSync']) assert.deepEqual(result.data[field], before[field])
  assert.ok(visibleLabResource('catalog', result.data.catalog, false).some(item => item.id === saved.id))
})

test('saving preserves source cancellations, rejections and unknown schedules instead of inventing completion', () => {
  for (const status of ['Canceled', 'Cancelled', 'Rejected', 'Approved', 'PendingActionRequired', 'Draft', 'Unknown']) {
    const result = planTttImport(initial(), [request(1, { status, scheduledDate: null, detailsAvailable: false, sessions: [] })])
    assert.equal(result.data.catalog[1].status, status)
    assert.equal(result.data.catalog[1].sessionDate, null)
    assert.equal(result.data.catalog[1].rmpDetailsAvailable, false)
    assert.equal(result.summary.detailErrors, 1)
  }
})

test('manual sessions deduplicate by case-insensitive event code without overwriting fields or adding provenance', () => {
  const existing = { id: 'manual', sr: 80, type: 'tttSession', eventId: ' test-ttt-1 ', trackName: 'My title', status: 'Scheduled', notes: 'Important local note' }
  const result = planTttImport({ ...initial(), catalog: [existing] }, [request()])
  assert.deepEqual(result.data.catalog, [existing])
  assert.equal(result.summary.existing, 1)
  assert.equal(result.summary.created, 0)
  assert.equal(result.changes.length, 0)
})

test('saved requests deduplicate by GUID even if the RMP request code or title changes', () => {
  const first = planTttImport(initial(), [request()])
  const second = planTttImport(first.data, [request(1, { requestId: guid(1).toLowerCase(), requestCode: 'RENAMED', title: 'Changed upstream' })])
  assert.equal(second.summary.existing, 1)
  assert.equal(second.summary.created, 0)
  assert.deepEqual(second.data, first.data)
  assert.equal(second.changes.length, 0)
})

test('only the selected hidden TTT import becomes visible and retains its ID, status and manual notes', () => {
  const hidden = { ...initial().catalog[0], id: 'hidden', sr: 100, type: 'tttSession', source: 'rmp', eventId: 'TEST-TTT-1', rmpRequestUniqueName: guid(1).toLowerCase(), status: 'Scheduled', notes: 'Keep my note' }
  const unrelated = { ...hidden, id: 'other-hidden', sr: 101, eventId: 'TEST-TTT-2', rmpRequestUniqueName: guid(2) }
  const data = { ...initial(), catalog: [hidden, unrelated] }
  const plan = planTttImport(data, [request()])
  assert.equal(plan.summary.restored, 1)
  assert.equal(plan.summary.created, 0)
  assert.deepEqual(plan.data.catalog[0], { ...hidden, rmpImportMode: 'ttt-scan', rmpTttSavedAt: plan.data.catalog[0].rmpTttSavedAt })
  assert.deepEqual(plan.data.catalog[1], unrelated)
  assert.deepEqual(visibleLabResource('catalog', plan.data.catalog, false).map(item => item.id), ['hidden'])
})

test('an already visible manual session takes precedence over an old hidden duplicate', () => {
  const visible = { id: 'visible', sr: 90, type: 'tttSession', eventId: 'TEST-TTT-1', status: 'Completed' }
  const hidden = { ...visible, id: 'hidden', sr: 91, source: 'rmp', rmpRequestUniqueName: guid(1) }
  const result = planTttImport({ ...initial(), catalog: [hidden, visible] }, [request()])
  assert.equal(result.summary.existing, 1)
  assert.equal(result.summary.restored, 0)
  assert.deepEqual(result.data.catalog, [hidden, visible])
})

test('conflicting IDs in other resources or source identities are reported without overwriting them', () => {
  for (const data of [
    { ...initial(), catalog: [{ ...initial().catalog[0], eventId: 'TEST-TTT-1' }] },
    { ...initial(), tracks: [{ id: 'track', eventId: 'test-ttt-1' }] },
    { ...initial(), catalog: [{ id: 'different-request', sr: 2, type: 'tttSession', eventId: 'TEST-TTT-1', rmpRequestUniqueName: guid(9) }] },
  ]) {
    const result = planTttImport(data, [request(), request(2)])
    assert.deepEqual(result.summary.conflicts, [{ requestId: guid(1), requestCode: 'TEST-TTT-1' }])
    assert.equal(result.summary.created, 1)
    assert.deepEqual(result.summary.savedRequestIds, [guid(2)])
    assert.deepEqual(result.data.catalog.slice(0, -1), data.catalog)
  }
})

test('empty and TBD event codes do not collapse distinct requests; duplicate input GUIDs are saved once', () => {
  const result = planTttImport(initial(), [request(1, { requestCode: '' }), request(2, { requestCode: '' }), request(3, { requestCode: 'TBD' }), request(4, { requestCode: 'TBD' }), request(4)])
  assert.equal(result.summary.created, 4)
  assert.equal(result.data.catalog.length, 5)
  assert.equal(new Set(result.data.catalog.map(item => item.sr)).size, 5)
})

test('unsafe storage reads or non-TTT projections cannot replace the dashboard', () => {
  for (const data of [null, {}, { catalog: {} }, { catalog: [], tracks: {} }]) assert.throws(() => planTttImport(data, [request()]))
  assert.throws(() => planTttImport(initial(), [request(1, { eventFormat: 'Custom Tech Event' as 'Train-The-Trainer' })]))
})

test('the importer serializes repeated saves and performs no second write for already-saved requests', async () => {
  let data: Record<string, unknown> = initial()
  let writes = 0
  let chain = Promise.resolve()
  const importer = createRmpTttImporter({
    readSnapshot: async () => ({ data, etag: 'v1' }),
    writeSnapshot: async next => { writes++; data = structuredClone(next) },
    withLock: fn => { const result = chain.then(fn); chain = result.then(() => undefined, () => undefined); return result },
  })
  const results = await Promise.all([importer([request()]), importer([request()]), importer([request(2)])])
  assert.deepEqual(results.map(result => result.summary.created), [1, 0, 1])
  assert.equal(writes, 2)
  assert.equal((data.catalog as object[]).length, 3)
})

test('failed writes never mutate cached storage or report success', async () => {
  const data = initial()
  const before = structuredClone(data)
  const importer = createRmpTttImporter({ readSnapshot: async () => ({ data, etag: 'v1' }), writeSnapshot: async () => { throw new Error('Write failed') }, withLock: fn => fn() })
  await assert.rejects(importer([request()]), /Write failed/)
  assert.deepEqual(data, before)
})

test('ETag conflicts re-read and re-merge instead of overwriting a concurrent edit or creating duplicates', async () => {
  let data = initial()
  let version = 1
  let writes = 0
  const conflict = new Error('ETag conflict')
  const importer = createRmpTttImporter({
    readSnapshot: async () => ({ data, etag: `v${version}` }),
    writeSnapshot: async (next, etag) => {
      writes++
      assert.equal(etag, `v${version}`)
      if (writes === 1) {
        data = { ...data, metrics: { completed: 99 }, catalog: [{ ...data.catalog[0], notes: 'Concurrent edit survives' }] }
        data = planTttImport(data, [request()]).data
        version++
        throw conflict
      }
      data = next
    },
    withLock: fn => fn(), isConflict: error => error === conflict,
  })
  const result = await importer([request(), request(2)])
  assert.equal(writes, 2)
  assert.equal(result.summary.existing, 1)
  assert.equal(result.summary.created, 1)
  assert.equal(data.metrics.completed, 99)
  assert.equal(data.catalog[0].notes, 'Concurrent edit survives')
  assert.equal(data.catalog.length, 3)
})

test('persistent ETag conflict retries are bounded and return an actionable conflict', async () => {
  let writes = 0
  const importer = createRmpTttImporter({ readSnapshot: async () => ({ data: initial(), etag: 'v1' }), writeSnapshot: async () => { writes++; throw new Error('Conflict') }, withLock: fn => fn(), isConflict: () => true })
  await assert.rejects(importer([request()]), { statusCode: 409 })
  assert.equal(writes, 3)
})

type FakeResponse = { setHeader(key: string, value: string): void; status(value: number): FakeResponse; json(value: unknown): FakeResponse }
type Handler = (req: { body: Record<string, unknown>; user?: { id: string | number; role?: string } }, res: FakeResponse) => Promise<void>
function harness(scan = async (_candidate: string, _options: unknown) => snapshot()) {
  let handler: Handler
  let data: Record<string, unknown> = initial()
  let writes = 0
  let audits = 0
  let failWrite = false
  let failAudit = false
  const requireAdmin = () => {}
  const importer = createRmpTttImporter({ readSnapshot: async () => ({ data, etag: 'v1' }), writeSnapshot: async next => { if (failWrite) throw new Error('PRIVATE-STORAGE-ERROR'); writes++; data = next }, withLock: fn => fn() })
  registerRmpTttImportRoutes({ post(path, auth, callback) { assert.equal(path, '/api/rmp/ttt/import'); assert.equal(auth, requireAdmin); handler = callback } }, {
    requireAdmin, scan, importRequests: importer, logAudit: async () => { if (failAudit) throw new Error('PRIVATE-AUDIT-ERROR'); audits++ },
  })
  const call = async (body: Record<string, unknown> = {}, user = { id: 'admin-a' as string | number, role: 'admin' }) => {
    let status = 200
    let response: Record<string, unknown> = {}
    const headers = new Map<string, string>()
    const res: FakeResponse = { setHeader(name, value) { headers.set(name, value) }, status(value) { status = value; return res }, json(value) { response = value as Record<string, unknown>; return res } }
    await handler({ body, user }, res)
    return { status, response, headers }
  }
  return { call, data: () => data, writes: () => writes, audits: () => audits, failWrite: () => { failWrite = true }, failAudit: () => { failAudit = true } }
}

test('the save route rejects invalid selections, dates, missing identity and unusable caller tokens before RMP reads', async () => {
  let reads = 0
  const app = harness(async () => { reads++; return snapshot() })
  assert.equal((await app.call()).status, 400)
  assert.equal((await app.call({ requestIds: [guid(1)] })).status, 401)
  assert.equal((await app.call({ requestIds: [guid(1)], b2cToken: token('expired', 1) })).status, 401)
  assert.equal((await app.call({ requestIds: [guid(1)], b2cToken: token(), from: 'bad', to: '2026-10-07' })).status, 400)
  assert.equal((await app.call({ requestIds: [guid(1)], b2cToken: token() }, { id: '', role: 'admin' })).status, 401)
  assert.equal(reads, 0)
  assert.equal(app.writes(), 0)
})

test('save re-verifies the caller and applied range, imports only selected IDs, and ignores forged row data', async () => {
  const candidate = token('current-admin')
  const range = { from: '2026-09-01', to: '2026-10-07' }
  const app = harness(async (actual, options) => { assert.equal(actual, candidate); assert.deepEqual(options, { range }); return snapshot([request(), request(2)]) })
  const result = await app.call({ b2cToken: candidate, requestIds: [guid(1)], ...range, title: 'FORGED', status: 'FORGED', source: 'FORGED', EventFormat: 'Budget', items: [request(2)] })
  assert.equal(result.status, 200)
  assert.equal(result.headers.get('Cache-Control'), 'private, no-store')
  assert.equal(result.response.created, 1)
  assert.equal(app.writes(), 1)
  assert.equal(app.audits(), 1)
  assert.equal((app.data().catalog as object[]).length, 2)
  assert.ok(!JSON.stringify(app.data()).includes('FORGED'))
  assert.ok(!JSON.stringify(result.response).includes(candidate))
  const duplicate = await app.call({ b2cToken: candidate, requestIds: [guid(1)], ...range })
  assert.equal(duplicate.response.existing, 1)
  assert.equal(app.writes(), 1)
  assert.equal(app.audits(), 1)
})

test('missing, moved, non-visible, or wrong-format selections cannot partially save the remaining rows', async () => {
  for (const items of [[], [request(2)]]) {
    const app = harness(async () => snapshot(items))
    assert.equal((await app.call({ b2cToken: token(), requestIds: [guid(1), guid(2)] })).status, 422)
    assert.equal(app.writes(), 0)
  }
  const wrongFormat = harness(async () => snapshot([request(1, { eventFormat: 'Custom Tech Event' as 'Train-The-Trainer' })]))
  assert.equal((await wrongFormat.call({ b2cToken: token(), requestIds: [guid(1)] })).status, 503)
  assert.equal(wrongFormat.writes(), 0)
})

test('RMP failures are sanitized and never result in writes or borrowing another account token', async () => {
  const candidate = token()
  for (const [upstream, expected] of [[401, 401], [403, 403], [408, 504], [500, 502]]) {
    const app = harness(async () => { throw new RmpApiError(`PRIVATE-UPSTREAM-${candidate}`, upstream) })
    const result = await app.call({ b2cToken: candidate, requestIds: [guid(1)] })
    assert.equal(result.status, expected)
    assert.ok(!JSON.stringify(result.response).includes('PRIVATE-UPSTREAM'))
    assert.ok(!JSON.stringify(result.response).includes(candidate))
    assert.equal(app.writes(), 0)
  }
})

test('storage failure is not reported as success and audit failure does not undo a committed save', async () => {
  const app = harness()
  app.failWrite()
  const failed = await app.call({ b2cToken: token(), requestIds: [guid(1)] })
  assert.equal(failed.status, 503)
  assert.equal(app.writes(), 0)
  assert.equal(app.audits(), 0)
  assert.ok(!JSON.stringify(failed.response).includes('PRIVATE-STORAGE-ERROR'))
  const auditApp = harness()
  auditApp.failAudit()
  const committed = await auditApp.call({ b2cToken: token(), requestIds: [guid(1)] })
  assert.equal(committed.status, 200)
  assert.equal(committed.response.created, 1)
  assert.equal(auditApp.writes(), 1)
})

test('duplicate and excessive concurrent saves are rejected until capacity is released', async () => {
  const release: (() => void)[] = []
  const app = harness(async () => { await new Promise<void>(resolve => release.push(resolve)); return snapshot() })
  const body = { b2cToken: token(), requestIds: [guid(1)] }
  const first = app.call(body)
  assert.equal((await app.call(body)).status, 429)
  const second = app.call(body, { id: 'admin-b', role: 'admin' })
  assert.equal((await app.call(body, { id: 'admin-c', role: 'admin' })).status, 429)
  release.splice(0).forEach(resolve => resolve())
  assert.equal((await first).status, 200)
  assert.equal((await second).status, 200)
  const next = app.call(body)
  release.splice(0).forEach(resolve => resolve())
  assert.equal((await next).status, 200)
})

test('HTTP integration requires admin access and saved sessions survive a fresh importer/GET while imports are paused', async () => {
  let data: Record<string, unknown> = initial()
  let upstreamReads = 0
  const app = express()
  app.use(express.json())
  registerRmpTttImportRoutes(app, {
    requireAdmin(req, res, next) {
      if (!req.headers.authorization) return res.status(401).json({ error: 'Unauthorized' })
      if (req.headers.authorization !== 'Bearer synthetic-admin') return res.status(403).json({ error: 'Admin required' })
      req.user = { id: 'fixture-admin', role: 'admin' }; next()
    },
    scan: async () => { upstreamReads++; return snapshot() },
    importRequests: createRmpTttImporter({ readSnapshot: async () => ({ data, etag: 'v1' }), writeSnapshot: async next => { data = structuredClone(next) }, withLock: fn => fn() }),
    logAudit: async () => {},
  })
  app.get('/api/catalog', (_req, res) => res.json(visibleLabResource('catalog', data.catalog, false)))
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    const base = `http://127.0.0.1:${address.port}`
    const body = JSON.stringify({ requestIds: [guid(1)], b2cToken: token() })
    const headers = { 'Content-Type': 'application/json' }
    assert.equal((await fetch(`${base}/api/rmp/ttt/import`, { method: 'POST', headers, body })).status, 401)
    assert.equal((await fetch(`${base}/api/rmp/ttt/import`, { method: 'POST', headers: { ...headers, Authorization: 'Bearer synthetic-viewer' }, body })).status, 403)
    assert.equal(upstreamReads, 0)
    const saved = await fetch(`${base}/api/rmp/ttt/import`, { method: 'POST', headers: { ...headers, Authorization: 'Bearer synthetic-admin' }, body })
    assert.equal(saved.status, 200)
    assert.equal((await saved.json() as RmpTttImportResult).created, 1)
    const reloaded = await fetch(`${base}/api/catalog`)
    assert.equal((await reloaded.json() as { type: string }[]).filter(item => item.type === 'tttSession').length, 1)
    const freshImporter = createRmpTttImporter({ readSnapshot: async () => ({ data, etag: 'v2' }), writeSnapshot: async () => assert.fail('Already saved rows must not be rewritten'), withLock: fn => fn() })
    assert.equal((await freshImporter([request()])).summary.existing, 1)
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

test('frontend saved indicators match GUIDs or manual codes and bulk save respects the active filters', () => {
  const rows = [request(), request(2, { status: 'Approved' }), request(3), request(4, { requestCode: 'TBD' }), request(5, { requestCode: '' })]
  const saved = savedTttRequestIds(rows, [{ rmpRequestUniqueName: guid(1).toLowerCase(), eventId: 'OLD-CODE' }, { eventId: ' test-ttt-3 ' }, { eventId: 'TBD' }, { eventId: '' }])
  assert.deepEqual([...saved], [guid(1), guid(3)])
  assert.equal(savedTttRequestIds([request()], [{ eventId: 'TEST-TTT-1', rmpRequestUniqueName: guid(99) }]).size, 0)
  const view = buildRmpTttView(rows, { query: 'Trainer', month: '2026-09', status: 'Approved' })
  assert.deepEqual(view.matches.filter(item => !saved.has(item.requestId)).map(item => item.requestId), [guid(2)])
})

test('blob and audit writes use UTF-8 byte counts for multilingual TTT titles', async () => {
  for (const [file, startMarker, endMarker, functionName, clientName] of [
    ['../backend/blobStorageService.js', 'export async function writeDataToBlob(', '/**\n * Delete the data blob', 'writeDataToBlob', 'blockBlobClient'],
    ['../backend/auditService.js', 'async function writeAuditLog(', '/**\n * Calculate changes', 'writeAuditLog', 'auditBlockBlobClient'],
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    const start = source.indexOf(startMarker)
    const end = source.indexOf(endMarker, start)
    assert.ok(start >= 0 && end > start)
    let writes = 0
    const context = vm.createContext({
      Buffer, console: { log() {}, warn() {}, error() {} }, RestError: Error,
      [clientName]: { async upload(content: string, length: number) {
        writes++
        assert.equal(length, Buffer.byteLength(content, 'utf8'))
        assert.ok(length > content.length, 'fixture includes multibyte characters')
        return { etag: 'new-etag' }
      } },
      input: functionName === 'writeAuditLog' ? [request()] : { catalog: [request()] },
    })
    vm.runInContext(source.slice(start, end).replace(/^export /, ''), context)
    await vm.runInContext(`${functionName}(input)`, context)
    assert.equal(writes, 1)
  }
})