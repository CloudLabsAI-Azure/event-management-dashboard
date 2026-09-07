import assert from 'node:assert/strict'
import { test } from 'node:test'
import { catalogueDate, catalogueDateFilter, catalogueRangeKey, normalizeCatalogueRange, catalogueSourceKey, fetchRmpCatalogue, mapCatalogueTrack } from '../backend/rmpCatalogueService.js'
import { RmpApiError } from '../backend/rmpService.js'

const config = { apiBaseUrl: 'https://example.invalid', tenantId: 'TENANT' }
const guid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n = 1, overrides = {}) => ({
  TrackUniqueName: guid(n), TrackName: `Catalogue lab ${n}`, TrackDescription: '<p>Learn &amp; build <strong>agents</strong>.</p>',
  Popularity: 'New Release, Trending', IsRetired: false, IsHide: false, TotalRows: 1,
  Level: 'Beginner', EventFormat: 'Hands-On Lab', TrackTopic: 'Innovate with AI', Language: 'English, Spanish',
  AdditionalInfo: JSON.stringify({ AvailableLabLanguage: 'English', LabInfo: [{ TestLabActivationCode: 'SYNTHETIC-DO-NOT-PUBLISH' }] }), ...overrides,
})
const detail = (n = 1, overrides = {}) => ({ ...row(n), LaunchDate: '2026-05-22T00:00:00', ReleaseNoteUrl: 'https://example.invalid/release-notes', ...overrides })

test('maps the observed catalogue fields, not request titles, into safe release details', () => {
  const item = mapCatalogueTrack(row(), detail())
  assert.equal(item?.kind, 'new-release')
  assert.equal(item?.releaseDate, '2026-05-22')
  assert.equal(item?.description, 'Learn & build agents.')
  assert.equal(item?.labLanguages, 'English')
  assert.equal(item?.eventType, 'Hands-On Lab')
  assert.equal(item?.detailsUrl, `https://admin.cloudevents.ai/catalogue/${guid(1).toUpperCase()}`)
  assert.ok(!JSON.stringify(item).includes('SYNTHETIC-DO-NOT-PUBLISH'))
  assert.ok(!('AdditionalInfo' in item!))
})

test('only explicit IsRetired means retirement; hidden active labs are not releases', () => {
  assert.equal(mapCatalogueTrack(row(1, { IsHide: true }), detail(1, { IsHide: true })), null)
  const retired = mapCatalogueTrack(row(1, { IsHide: true, IsRetired: true }), detail(1, { IsRetired: true }))
  assert.equal(retired?.kind, 'retired')
  assert.equal(retired?.retirementDate, null)
  assert.equal(retired?.releaseDate, '2026-05-22')
  assert.equal(mapCatalogueTrack(row(1, { Popularity: 'Not New Release' }))?.kind, 'catalogue-release')
})

test('LaunchDate is calendar-safe and invalid dates stay unknown', () => {
  assert.equal(catalogueDate('2026-06-01T00:00:00'), '2026-06-01')
  assert.equal(catalogueDate('2026-02-30T00:00:00'), null)
  assert.equal(catalogueDate(null), null)
  assert.equal(catalogueDate('invalid'), null)
  assert.equal(mapCatalogueTrack(row(), null)?.releaseDate, null)
})

test('does not emit unsafe links or hidden credentials from raw detail fields', () => {
  for (const url of ['javascript:alert(1)', 'https://example.invalid/?token=synthetic', 'https://user:synthetic@example.invalid/']) {
    assert.equal(mapCatalogueTrack(row(), detail(1, { ReleaseNoteUrl: url }))?.releaseNotesUrl, null)
  }
})

test('fetches complete clamped catalogue pages with literal $ keys and enriches details', async () => {
  const calls: string[] = []
  const request = async (path: string) => {
    calls.push(path)
    if (path.includes('/trackList?')) {
      const page = Number(path.match(/\$pagenumber=(\d+)/)?.[1])
      if (page === 1) return { Status: 'Success', Data: [row(1, { TotalRows: 2 })] }
      assert.match(path, /\$pagesize=1$/)
      return { Status: 'Success', Data: [row(2, { TotalRows: 2, IsRetired: true, IsHide: true })] }
    }
    const n = path.endsWith(guid(1)) ? 1 : 2
    return { Status: 'Success', Data: [detail(n, { IsRetired: n === 2 })] }
  }
  const snapshot = await fetchRmpCatalogue('synthetic-token', { request, config })
  assert.equal(snapshot.totalTracks, 2)
  assert.equal(snapshot.items.length, 2)
  assert.equal(snapshot.detailErrors, 0)
  assert.equal(snapshot.sourceKey, catalogueSourceKey(config))
  assert.ok(calls.every(path => !path.includes('myevents')))
  assert.ok(!JSON.stringify(snapshot).includes('synthetic-token'))
})

test('overlapping or incomplete pages fail rather than publish a truncated catalogue', async () => {
  const request = async () => ({ Status: 'Success', Data: [row(1, { TotalRows: 2 })] })
  await assert.rejects(fetchRmpCatalogue('fixture', { request, config }), { statusCode: 502 })
})

test('empty, malformed and failed list responses never become an empty success', async () => {
  for (const response of [{ Status: 'Success', Data: [] }, { Status: 'Error', Data: [row()] }, { Status: 'Success', Data: [row(1, { TotalRows: 20000 })] }]) {
    await assert.rejects(fetchRmpCatalogue('fixture', { request: async () => response, config }))
  }
  await assert.rejects(fetchRmpCatalogue('fixture', { request: async () => { throw new RmpApiError('Denied', 403) }, config }), { statusCode: 403 })
})

test('detail errors are visible and retried on a later sync, without inventing dates', async () => {
  let fail = true
  const request = async (path: string) => {
    if (path.includes('/trackList?')) return { Status: 'Success', Data: [row()] }
    if (fail) throw new RmpApiError('Temporary failure', 502)
    return { Status: 'Success', Data: [detail()] }
  }
  const first = await fetchRmpCatalogue('fixture', { request, config })
  assert.equal(first.detailErrors, 1)
  assert.equal(first.items[0].releaseDate, null)
  assert.equal(first.items[0].detailAvailable, false)
  fail = false
  const next = await fetchRmpCatalogue('fixture', { request, config })
  assert.equal(next.detailErrors, 0)
  assert.equal(next.items[0].releaseDate, '2026-05-22')
})

test('a mismatched detail identity cannot supply another labs release date', async () => {
  const request = async (path: string) => ({ Status: 'Success', Data: [path.includes('/trackList?') ? row() : detail(2)] })
  const result = await fetchRmpCatalogue('fixture', { request, config })
  assert.equal(result.detailErrors, 1)
  assert.equal(result.items[0].releaseDate, null)
})

test('detail token rejection aborts sync rather than caching failed authentication', async () => {
  const request = async (path: string) => {
    if (path.includes('/trackList?')) return { Status: 'Success', Data: [row()] }
    throw new RmpApiError('Expired', 401)
  }
  await assert.rejects(fetchRmpCatalogue('fixture', { request, config }), { statusCode: 401 })
})

test('emits the exact Content Release Date expression observed in the portal', () => {
  assert.equal(catalogueDateFilter({ from: '2026-08-01', to: '2026-09-07' }), '(content_release_datefrom in (2026-08-01)) and (content_release_dateto in (2026-09-07))')
  assert.equal(catalogueDateFilter(null), '')
  assert.equal(catalogueRangeKey({ from: '2026-08-01', to: '2026-09-07' }), '2026-08-01:2026-09-07')
  assert.equal(catalogueRangeKey(null), 'all')
})

test('date range validates both calendar dates and order and cannot inject filter expressions', () => {
  for (const range of [
    { from: '2026-09-07' }, { to: '2026-09-07' },
    { from: '2026-09-07', to: '2026-08-01' },
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-08-01)) or (IsRetired eq true', to: '2026-09-07' },
    { from: ['2026-08-01'], to: '2026-09-07' },
  ]) assert.throws(() => normalizeCatalogueRange(range), { statusCode: 400 })
  assert.deepEqual(normalizeCatalogueRange({ from: '2026-09-07', to: '2026-09-07' }), { from: '2026-09-07', to: '2026-09-07' })
  assert.equal(normalizeCatalogueRange({ from: '', to: '' }), null)
})

test('every page carries the source date range and historical releases are not hidden by missing tags', async () => {
  const range = { from: '2026-08-01', to: '2026-09-07' }
  const seen: string[] = []
  const request = async (path: string) => {
    if (path.includes('/trackList?')) {
      const url = new URL(path, config.apiBaseUrl)
      seen.push(url.searchParams.get('$filter') || '')
      const n = Number(url.searchParams.get('$pagenumber'))
      return { Status: 'Success', Data: [row(n, { TotalRows: 2, Popularity: n === 1 ? 'New Release' : 'Trending' })] }
    }
    const n = path.endsWith(guid(1)) ? 1 : 2
    return { Status: 'Success', Data: [detail(n, { LaunchDate: n === 1 ? '2026-08-01T00:00:00' : '2026-09-07T00:00:00' })] }
  }
  const result = await fetchRmpCatalogue('fixture', { range, request, config })
  assert.deepEqual(result.range, range)
  assert.equal(seen.length, 2)
  assert.ok(seen.every(filter => filter === catalogueDateFilter(range)))
  assert.equal(result.items.length, 2)
  assert.equal(result.items[1].kind, 'catalogue-release')
  assert.deepEqual(result.items.map(item => item.releaseDate), ['2026-08-01', '2026-09-07'])
})

test('zero date-range matches are a successful scoped empty result, not failed access or retirements', async () => {
  const range = { from: '2000-01-01', to: '2000-01-02' }
  const result = await fetchRmpCatalogue('fixture', { range, config, request: async () => ({ Status: 'Success', Data: [] }) })
  assert.deepEqual(result.range, range)
  assert.equal(result.totalTracks, 0)
  assert.deepEqual(result.items, [])
})