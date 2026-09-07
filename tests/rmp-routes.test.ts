import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import { createRmpTokenCache } from '../backend/rmpTokenCache.js'
import { RmpApiError } from '../backend/rmpService.js'

function token(subject: string) {
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
  return `fixture.${payload}.not-a-real-signature`
}

type ResponseBody = Record<string, unknown>
type Handler = (req: { body?: Record<string, unknown>; user?: { email: string } }, res: {
  status: (status: number) => unknown
  json: (body: ResponseBody) => unknown
}) => Promise<void>

/**
 * Exercise the actual registered RMP handlers without booting the legacy server:
 * startup otherwise writes its data schema and can start live integration jobs.
 * Storage and upstream calls are synthetic, isolated in a VM sandbox.
 */
function harness(options: { deny?: string; upstreamError?: RmpApiError } = {}) {
  const source = readFileSync(new URL('../backend/server.js', import.meta.url), 'utf8')
  const start = source.indexOf('const rmpTokenCache = createRmpTokenCache();')
  const end = source.indexOf("app.get('/api/:resource',", start)
  assert.ok(start > 0 && end > start, 'RMP route section must be present')
  const handlers = new Map<string, Handler>()
  const cache = createRmpTokenCache({ verifyAccess: async (candidate: string) => {
    if (candidate === options.deny) throw new RmpApiError('Denied', 403)
    return true
  } })
  let writes = 0
  let fetches = 0
  let stored: Record<string, unknown> = { catalog: [], _rmpSync: {} }
  const register = (path: string, ...callbacks: Handler[]) => handlers.set(path, callbacks[callbacks.length - 1])
  vm.runInNewContext(source.slice(start, end), {
    createRmpTokenCache: () => cache,
    app: { get: register, post: register },
    requireAuth: () => {},
    RmpApiError,
    process: { env: {} },
    console: { log() {}, error() {} },
    readData: async () => structuredClone(stored),
    writeData: async (data: Record<string, unknown>) => { stored = structuredClone(data); writes++ },
    withLock: async (fn: () => Promise<unknown>) => fn(),
    fetchAllRequests: async () => {
      fetches++
      if (options.upstreamError) throw options.upstreamError
      return [{ requestUniqueName: 'REQUEST-FIXTURE' }]
    },
    getRequestDetail: async () => null,
    classifyRequest: () => null,
    mapRequestToCatalogItem: () => null,
    isLocalizedLanguage: () => false,
    logAudit: async () => {},
    getRmpConfig: () => ({ apiBaseUrl: 'https://example.invalid', tenantId: 'fixture' }),
  })

  async function call(path: string, body: Record<string, unknown> = {}) {
    let status = 200
    let response: ResponseBody = {}
    const res = {
      status(value: number) { status = value; return res },
      json(value: ResponseBody) { response = value; return res },
    }
    await handlers.get(path)!({ body, user: { email: 'fixture@example.invalid' } }, res)
    return { status, response }
  }
  return { cache, call, getWrites: () => writes, getFetches: () => fetches }
}

test('sync endpoint refuses a denied candidate without touching data or a working token', async () => {
  const denied = token('denied')
  const working = token('working')
  const app = harness({ deny: denied })
  await app.cache.cacheIfAuthorized(working)
  const result = await app.call('/api/rmp/sync', { b2cToken: denied })
  assert.equal(result.status, 403)
  assert.equal(result.response.requiresRmpAccess, true)
  assert.equal(app.cache.get()?.token, working)
  assert.equal(app.getFetches(), 0)
  assert.equal(app.getWrites(), 0)
})

test('verified sync preserves baseline semantics and status never serializes credentials', async () => {
  const app = harness()
  const candidate = token('working')
  const result = await app.call('/api/rmp/sync', { b2cToken: candidate })
  assert.equal(result.status, 200)
  assert.equal(result.response.baselined, true)
  assert.equal(result.response.imported, 0)
  assert.equal(app.getWrites(), 1)
  const status = await app.call('/api/rmp/sync-status')
  assert.equal(status.response.tokenAvailable, true)
  assert.equal(typeof status.response.tokenVerifiedAt, 'string')
  assert.equal(typeof status.response.tokenExpiresAt, 'string')
  assert.ok(!JSON.stringify(status.response).includes(candidate))
  assert.ok(!JSON.stringify(result.response).includes(candidate))
})

test('revocation during the actual sync evicts the cached token', async () => {
  const app = harness({ upstreamError: new RmpApiError('Revoked', 401) })
  const result = await app.call('/api/rmp/sync', { b2cToken: token('revoked') })
  assert.equal(result.status, 401)
  assert.equal(result.response.requiresReauth, true)
  assert.equal(app.cache.get(), null)
  assert.equal(app.getWrites(), 0)
})

test('a request without a token cannot start sync unless a verified credential is cached', async () => {
  const app = harness()
  const unavailable = await app.call('/api/rmp/sync')
  assert.equal(unavailable.status, 401)
  assert.equal(app.getFetches(), 0)
  await app.cache.cacheIfAuthorized(token('verified'))
  const result = await app.call('/api/rmp/sync')
  assert.equal(result.status, 200)
  assert.equal(result.response.baselined, true)
})