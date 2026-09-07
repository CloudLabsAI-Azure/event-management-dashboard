import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import { createRmpTokenCache } from '../backend/rmpTokenCache.js'
import { RmpApiError, getRequestDetail, verifyRmpAccess } from '../backend/rmpService.js'

const originalFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = originalFetch })

// Synthetic JWT-shaped fixtures only. The upstream fetch is always mocked.
function token(subject: string, seconds = 3600) {
  const payload = Buffer.from(JSON.stringify({ sub: subject, exp: Math.floor(Date.now() / 1000) + seconds })).toString('base64url')
  return `test.${payload}.not-a-real-signature`
}

function mockResponse(body: unknown, status = 200) {
  globalThis.fetch = async () => new Response(JSON.stringify(body), { status })
}

test('RMP access is confirmed with a real unfiltered, minimal upstream request', async () => {
  const candidate = token('visible')
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /\/api\/admin\/v1\.0\/tenants\/[^/]+\/myevents$/)
    assert.equal(init?.method, 'POST')
    const body = JSON.parse(String(init?.body))
    assert.equal(body.PageNumber, 1)
    assert.equal(body.PageSize, 1)
    assert.equal(body.Status, null)
    assert.equal(body.SearchRequest, null)
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${candidate}`)
    return new Response(JSON.stringify({ Status: 'Success', Data: [{ RequestUniqueName: 'request-guid' }] }))
  }
  assert.equal(await verifyRmpAccess(candidate), true)
})

for (const scenario of [
  { name: 'empty visible set', status: 200, body: { Status: 'Success', Data: [] }, expected: 403 },
  { name: 'no-event-found response', status: 500, body: { ErrorDetail: 'No event found.' }, expected: 403 },
  { name: 'upstream forbidden', status: 403, body: {}, expected: 403 },
  { name: 'upstream unauthorized', status: 401, body: {}, expected: 401 },
  { name: 'unexpected successful body', status: 200, body: { Data: 'not an array' }, expected: 502 },
  { name: 'application error in 200 response', status: 200, body: { Status: 'Error', Data: [{ RequestUniqueName: 'x' }] }, expected: 502 },
  { name: 'ordinary server error', status: 500, body: { error: 'Unavailable' }, expected: 500 },
]) {
  test(`access probe rejects ${scenario.name}`, async () => {
    mockResponse(scenario.body, scenario.status)
    await assert.rejects(verifyRmpAccess(token('candidate')), (error: unknown) => error instanceof RmpApiError && error.statusCode === scenario.expected)
  })
}

test('access probe rejects expiry without contacting RMP', async () => {
  globalThis.fetch = async () => { throw new Error('Must not contact RMP') }
  await assert.rejects(verifyRmpAccess(token('expired', -1)), { statusCode: 401 })
})

test('network failures and timeouts are not treated as permission success', async () => {
  globalThis.fetch = async () => { throw new DOMException('Timed out', 'TimeoutError') }
  await assert.rejects(verifyRmpAccess(token('timeout')), { statusCode: 408 })
  globalThis.fetch = async () => { throw new TypeError('Network unavailable') }
  await assert.rejects(verifyRmpAccess(token('offline')), { statusCode: 0 })
})

test('cache stays empty until verification completes', async () => {
  let confirm!: (value: boolean) => void
  const cache = createRmpTokenCache({ verifyAccess: () => new Promise<boolean>(resolve => { confirm = resolve }) })
  const candidate = token('valid')
  const pending = cache.cacheIfAuthorized(candidate, 'fixture@example.invalid')
  assert.equal(cache.get(), null)
  confirm(true)
  await pending
  assert.equal(cache.get()?.token, candidate)
  assert.ok(cache.get()?.verifiedAt)
})

test('a denied user cannot replace the working token', async () => {
  const valid = token('valid')
  const cache = createRmpTokenCache({ verifyAccess: async (candidate: string) => {
    if (candidate === valid) return true
    throw new RmpApiError('Denied', 403)
  } })
  await cache.cacheIfAuthorized(valid)
  await assert.rejects(cache.cacheIfAuthorized(token('denied')), { statusCode: 403 })
  assert.equal(cache.get()?.token, valid)
})

test('inconclusive access and transient errors preserve a previously verified token', async () => {
  let response: boolean | Error = true
  const cache = createRmpTokenCache({ verifyAccess: async () => {
    if (response instanceof Error) throw response
    return response
  } })
  const valid = token('valid')
  await cache.cacheIfAuthorized(valid)
  response = false
  await assert.rejects(cache.cacheIfAuthorized(token('empty')), { statusCode: 403 })
  assert.equal(cache.get()?.token, valid)
  response = new RmpApiError('Timeout', 408)
  await assert.rejects(cache.cacheIfAuthorized(valid), { statusCode: 408 })
  assert.equal(cache.get()?.token, valid)
})

test('rejecting the cached credential evicts it but not a different credential', async () => {
  let permitted = true
  const cache = createRmpTokenCache({ verifyAccess: async () => {
    if (!permitted) throw new RmpApiError('Revoked', 401)
    return true
  } })
  const valid = token('valid')
  await cache.cacheIfAuthorized(valid)
  cache.invalidate(token('other'))
  assert.equal(cache.get()?.token, valid)
  permitted = false
  await assert.rejects(cache.cacheIfAuthorized(valid), { statusCode: 401 })
  assert.equal(cache.get(), null)
})

test('expired or expiring tokens are never retained', async context => {
  const cache = createRmpTokenCache({ verifyAccess: async () => true })
  await assert.rejects(cache.cacheIfAuthorized(token('expired', -1)), { statusCode: 401 })
  await assert.rejects(cache.cacheIfAuthorized(token('expiring', 30)), { statusCode: 401 })
  await cache.cacheIfAuthorized(token('valid'))
  const now = Date.now()
  context.mock.method(Date, 'now', () => now + 3600_000)
  assert.equal(cache.get(), null)
})

test('a token that expires during its access check is not cached', async context => {
  const now = Date.now()
  const candidate = token('will-expire', 120)
  const cache = createRmpTokenCache({ verifyAccess: async () => {
    context.mock.method(Date, 'now', () => now + 120_000)
    return true
  } })
  await assert.rejects(cache.cacheIfAuthorized(candidate), { statusCode: 401 })
  assert.equal(cache.get(), null)
})

test('a slow older probe cannot overwrite a newer verified token', async () => {
  const first = token('first')
  const second = token('second')
  let completeFirst!: (value: boolean) => void
  const cache = createRmpTokenCache({ verifyAccess: (candidate: string) => candidate === first
    ? new Promise<boolean>(resolve => { completeFirst = resolve }) : Promise.resolve(true) })
  const pending = cache.cacheIfAuthorized(first)
  await cache.cacheIfAuthorized(second)
  completeFirst(true)
  await pending
  assert.equal(cache.get()?.token, second)
})

test('best-effort detail enrichment still propagates credential revocation', async () => {
  mockResponse({}, 401)
  await assert.rejects(getRequestDetail(token('revoked'), 'request-guid'), { statusCode: 401 })
})

test('a fast denial does not block an older successful access check', async () => {
  const first = token('first')
  let completeFirst!: (value: boolean) => void
  const cache = createRmpTokenCache({ verifyAccess: (candidate: string) => candidate === first
    ? new Promise<boolean>(resolve => { completeFirst = resolve })
    : Promise.reject(new RmpApiError('Denied', 403)) })
  const pending = cache.cacheIfAuthorized(first)
  await assert.rejects(cache.cacheIfAuthorized(token('denied')), { statusCode: 403 })
  completeFirst(true)
  await pending
  assert.equal(cache.get()?.token, first)
})