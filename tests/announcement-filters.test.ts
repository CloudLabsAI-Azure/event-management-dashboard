import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildAnnouncementData, buildAnnouncementView, filterLabUpdates, groupLabUpdatesByMonth,
  LAB_UPDATE_FILTERS, labUpdateFilterDate, matchesAnnouncementSearch, scopeAnnouncementData,
} from '../src/lib/announcements.ts'
import type { ContentReleaseRange, RmpCatalogueItem } from '../src/types/rmpCatalogue.ts'

const range: ContentReleaseRange = { from: '2026-08-01', to: '2026-09-08' }
const lab = (id: string, overrides: Partial<RmpCatalogueItem> = {}): RmpCatalogueItem => ({
  id, title: `Fixture ${id}`, description: 'Catalogue learning content', kind: 'catalogue-release',
  highlights: [], level: 'Intermediate', eventType: 'Hands-On Lab', topic: 'Analytics',
  labLanguages: 'English', registrationLanguages: 'English, Spanish', releaseDate: '2026-08-05',
  retirementDate: null, lastContentModifiedDate: null, releaseNotesUrl: null,
  detailsUrl: `https://example.invalid/catalogue/${id}`, detailAvailable: true, ...overrides,
})

const mixedData = () => buildAnnouncementData([
  { id: 'manual-inside', sr: 10, type: 'trackChange', trackName: 'Dated manual retirement', changeType: 'removed', changeDate: '2026-08-03' },
  { id: 'manual-outside', sr: 11, type: 'trackChange', trackName: 'Older manual retirement', changeType: 'removed', changeDate: '2026-07-31' },
  { id: 'manual-undated', sr: 12, type: 'trackChange', trackName: 'Undated manual retirement', changeType: 'removed' },
  { id: 'notice-inside', sr: 13, type: 'generalAnnouncement', title: 'Inside notice', message: 'Team announcement', announcementDate: '2026-08-08' },
  { id: 'notice-outside', sr: 14, type: 'generalAnnouncement', title: 'Outside notice', message: 'Team announcement', announcementDate: '2025-08-08' },
  { id: 'pdf-inside', sr: 15, type: 'pdfCatalog', title: 'Inside PDF', description: 'Resource', uploadDate: '2026-09-01' },
  { id: 'pdf-outside', sr: 16, type: 'pdfCatalog', title: 'Outside PDF', description: 'Resource', uploadDate: '2026-07-01' },
], [
  { title: 'Readout retirement', reason: 'Confirmed historical change', bucket: 'FY26 — already removed' },
  { title: 'Readout plan', reason: 'Removal not yet confirmed', bucket: 'FY27 — pending removal' },
], [
  lab('new-and-updated', { kind: 'new-release', highlights: ['New Release', 'Recently Updated'], lastContentModifiedDate: '2026-09-07' }),
  lab('retired-and-updated', { kind: 'retired', highlights: ['Recently Updated', 'Upgraded'] }),
  lab('updated-only', { highlights: ['Recently Updated'], releaseDate: '2026-09-02', eventType: 'Challenge Based Hack' }),
  lab('plain-release'),
  lab('old-retired', { kind: 'retired', releaseDate: '2025-08-05' }),
])

test('the applied range scopes retired/manual/FY27 records, notices and PDFs, not just releases', () => {
  const original = mixedData()
  const before = structuredClone(original)
  const scoped = scopeAnnouncementData(original, range)
  assert.equal(scoped.labUpdates.length, 5)
  assert.ok(!scoped.labUpdates.some(item => item.id === 'manual:manual-outside' || item.id === 'manual:manual-undated' || item.source === 'FY27 review'))
  assert.deepEqual(scoped.announcements.map(item => item.id), ['notice-inside'])
  assert.deepEqual(scoped.pdfCatalogs.map(item => item.id), ['pdf-inside'])
  assert.deepEqual(original, before)
  assert.equal(scopeAnnouncementData(original, null), original)
})

test('All, Retired and Recently Updated scan the same scoped data and their counts match displayed rows', () => {
  const data = mixedData()
  const all = buildAnnouncementView(data, { kind: 'all' }, range)
  assert.equal(all.updates.length, 5)
  assert.equal(all.categoryCounts.all, 5)
  assert.equal(all.categoryCounts.retired, 2)
  assert.equal(all.categoryCounts['recently-updated'], 3)
  assert.equal(all.categoryCounts.releases, 3)
  assert.equal(all.categoryCounts['planned-retirement'], 0)
  for (const option of LAB_UPDATE_FILTERS) {
    const category = buildAnnouncementView(data, { kind: option.value }, range)
    assert.equal(category.updates.length, all.categoryCounts[option.value], option.label)
    assert.deepEqual(category.categoryCounts, all.categoryCounts)
  }
})

test('a retired lab matches its content release month without claiming that it was retired then', () => {
  const result = buildAnnouncementView(mixedData(), { kind: 'retired', month: '2026-08', level: 'Intermediate', eventType: 'Hands-On Lab' }, range)
  assert.deepEqual(result.updates.map(item => item.id), ['catalogue:RETIRED-AND-UPDATED'])
  assert.equal(result.monthGroups[0].label, 'August 2026')
  assert.equal(result.updates[0].date, null)
  assert.equal(result.updates[0].dateLabel, 'Retired on')
  assert.equal(labUpdateFilterDate(result.updates[0]), '2026-08-05')
})

test('every category respects the selected month, event type, level and search together', () => {
  const filters = { month: '2026-08', eventType: 'Hands-On Lab', level: 'Intermediate', query: 'recently updated' }
  const result = buildAnnouncementView(mixedData(), { ...filters, kind: 'all' }, range)
  assert.equal(result.updates.length, 2)
  assert.equal(result.categoryCounts.retired, 1)
  assert.equal(result.categoryCounts['new-release'], 1)
  assert.equal(result.categoryCounts['recently-updated'], 2)
  assert.equal(buildAnnouncementView(mixedData(), { ...filters, kind: 'retired' }, range).updates.length, 1)
  assert.equal(buildAnnouncementView(mixedData(), { ...filters, kind: 'new-release' }, range).updates.length, 1)
  assert.equal(buildAnnouncementView(mixedData(), { ...filters, kind: 'all', level: 'Advanced' }, range).updates.length, 0)
})

test('highlight categories overlap without duplicating records in All updates', () => {
  const data = buildAnnouncementData([], [], [lab('all-tags', {
    kind: 'new-release', highlights: [' New Release ', 'RECENTLY UPDATED', 'Upgraded', 'Trending', 'More Languages Available'],
  })])
  const view = buildAnnouncementView(data, { kind: 'all' }, range)
  assert.equal(view.updates.length, 1)
  for (const key of ['new-release', 'recently-updated', 'upgraded', 'trending', 'more-languages'] as const) assert.equal(view.categoryCounts[key], 1)
})

test('a modification date or loose tag substring does not invent the Recently Updated highlight', () => {
  const data = buildAnnouncementData([], [], [
    lab('has-date-only', { lastContentModifiedDate: '2026-09-08' }),
    lab('different-tag', { highlights: ['Not Recently Updated', 'Upgraded later'] }),
  ])
  const view = buildAnnouncementView(data, { kind: 'recently-updated' }, range)
  assert.equal(view.updates.length, 0)
  assert.equal(view.categoryCounts.upgraded, 0)
  assert.equal(view.categoryCounts.all, 2)
})

test('search covers lifecycle, highlights and multiple metadata fields case-insensitively', () => {
  const items = buildAnnouncementData([], [], [lab('retired', { kind: 'retired', title: 'Fabric lab', highlights: ['Recently Updated'], lastContentModifiedDate: '2026-09-07' })]).labUpdates
  assert.equal(filterLabUpdates(items, { query: 'fabric retired spanish recently updated' }).length, 1)
  assert.equal(filterLabUpdates(items, { query: '2026-09-07' }).length, 1)
  assert.equal(filterLabUpdates(items, { query: 'missing word' }).length, 0)
  assert.equal(matchesAnnouncementSearch('   ', 'any data'), true)
})

test('month/type/level options do not change when the category changes', () => {
  const options = buildAnnouncementView(mixedData(), { kind: 'all' }, range).options
  assert.deepEqual(buildAnnouncementView(mixedData(), { kind: 'retired' }, range).options, options)
  assert.deepEqual(buildAnnouncementView(mixedData(), { kind: 'recently-updated' }, range).options, options)
  assert.deepEqual(options.months, ['2026-09', '2026-08'])
  assert.equal(buildAnnouncementView(mixedData(), { kind: 'retired', month: '2027-01' }, range).updates.length, 0)
})

test('team notices and resources use their own dates but the same range/month/search', () => {
  const august = buildAnnouncementView(mixedData(), { month: '2026-08', query: 'inside' }, range)
  assert.equal(august.announcements.length, 1)
  assert.equal(august.pdfCatalogs.length, 0)
  const september = buildAnnouncementView(mixedData(), { month: '2026-09', query: 'inside' }, range)
  assert.equal(september.announcements.length, 0)
  assert.equal(september.pdfCatalogs.length, 1)
})

test('unrelated lab-specific filters do not discard notices or PDFs with no such fields', () => {
  const view = buildAnnouncementView(mixedData(), { kind: 'retired', eventType: 'Hands-On Lab', level: 'Advanced' }, range)
  assert.equal(view.updates.length, 0)
  assert.equal(view.announcements.length, 1)
  assert.equal(view.pdfCatalogs.length, 1)
})

test('undated local history is counted separately and returns with All dates', () => {
  const data = mixedData()
  const scoped = buildAnnouncementView(data, { kind: 'all' }, range)
  assert.equal(scoped.undatedLocalCount, 3)
  assert.ok(!scoped.options.months.includes('undated'))
  const unrestricted = buildAnnouncementView(data, { kind: 'all', month: 'undated' }, null)
  assert.equal(unrestricted.updates.length, 3)
  assert.equal(unrestricted.undatedLocalCount, 0)
})

test('known boundary dates are inclusive and missing RMP detail dates remain explicitly undated', () => {
  const data = buildAnnouncementData([], [], [
    lab('first', { releaseDate: range.from }), lab('last', { releaseDate: range.to }),
    lab('before', { releaseDate: '2026-07-31' }), lab('after', { releaseDate: '2026-09-09' }),
    lab('detail-failed', { releaseDate: null, detailAvailable: false }),
  ])
  const scoped = scopeAnnouncementData(data, range)
  assert.deepEqual(scoped.labUpdates.map(item => item.id).sort(), ['catalogue:DETAIL-FAILED', 'catalogue:FIRST', 'catalogue:LAST'])
  assert.equal(groupLabUpdatesByMonth(scoped.labUpdates).at(-1)?.month, 'undated')
})

test('category filtering scans every fetched record, including entries beyond the first page', () => {
  const catalogue = Array.from({ length: 120 }, (_, index) => lab(`item-${index}`, {
    kind: index === 119 ? 'retired' : 'catalogue-release', highlights: index >= 110 ? ['Recently Updated'] : [],
  }))
  const data = buildAnnouncementData([], [], catalogue)
  assert.equal(buildAnnouncementView(data, { kind: 'all' }, range).categoryCounts.all, 120)
  assert.equal(buildAnnouncementView(data, { kind: 'recently-updated' }, range).updates.length, 10)
  assert.deepEqual(buildAnnouncementView(data, { kind: 'retired' }, range).updates.map(item => item.id), ['catalogue:ITEM-119'])
})

test('invalid applied ranges are rejected rather than silently showing unfiltered data', () => {
  assert.throws(() => scopeAnnouncementData(mixedData(), { from: '2026-09-09', to: '2026-09-01' }))
  assert.throws(() => scopeAnnouncementData(mixedData(), { from: '2026-02-30', to: '2026-09-01' }))
})