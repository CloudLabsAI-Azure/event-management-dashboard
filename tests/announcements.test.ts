import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAnnouncementData, formatAnnouncementDate, safeResourceUrl, announcementMonth, filterLabUpdates, groupLabUpdatesByMonth } from '../src/lib/announcements.ts'
import { retirements } from '../src/data/fy27Readout.ts'
import type { RmpCatalogueItem } from '../src/types/rmpCatalogue.ts'
import { contentReleaseRangeError, defaultContentReleaseRange } from '../src/lib/contentReleaseDates.ts'

const release = (overrides: Partial<RmpCatalogueItem> = {}): RmpCatalogueItem => ({
  id: 'track-1', title: 'Example catalogue lab', description: 'Lab description', kind: 'new-release',
  highlights: ['New Release'], level: 'Beginner', eventType: 'Hands-On Lab', topic: 'Innovate with AI',
  labLanguages: 'English', registrationLanguages: 'English, Spanish', releaseDate: '2026-05-22',
  retirementDate: null, lastContentModifiedDate: null, releaseNotesUrl: null,
  detailsUrl: 'https://admin.cloudevents.ai/catalogue/track-1', detailAvailable: true, ...overrides,
})

const onboarding = {
  id: 'rmp-fixture', sr: 42, type: 'roadmapItem', labType: 'New Lab Onboarding',
  trackTitle: 'Example onboarding lab', phase: 'Under assessment', source: 'rmp',
  rmpStatus: 'Approved', eventId: 'EXAMPLE-42', rmpRequestUniqueName: 'request-guid',
  createdAt: '2026-09-07T10:00:00Z',
}

test('request-based onboarding is never advertised as a catalogue release', () => {
  const rows = [onboarding]
  const snapshot = structuredClone(rows)
  const result = buildAnnouncementData(rows)
  assert.equal(result.labUpdates.length, 0)
  assert.deepEqual(rows, snapshot)
  assert.deepEqual(buildAnnouncementData(rows), result)
})

test('completed RMP requests do not automatically mean the lab has been released', () => {
  const result = buildAnnouncementData([{ ...onboarding, rmpStatus: 'Completed' }])
  assert.equal(result.labUpdates.length, 0)
})

test('drafts, cancellations, rejected requests, upgrades and other item types are excluded', () => {
  const rows = ['Draft', 'Canceled', 'Cancelled', 'Rejected'].map(rmpStatus => ({ ...onboarding, rmpStatus }))
  const result = buildAnnouncementData([
    ...rows,
    { ...onboarding, labType: 'Lab Upgrade' },
    { ...onboarding, isUpgrade: true },
    { ...onboarding, type: 'tttSession' },
    { ...onboarding, type: 'customLabRequest' },
    { ...onboarding, phase: 'Cancelled' },
  ])
  assert.deepEqual(result.labUpdates, [])
})

test('manual roadmap items are not catalogue releases either', () => {
  const result = buildAnnouncementData([{ ...onboarding, source: '', rmpStatus: '', isUpgrade: 'false' }])
  assert.equal(result.labUpdates.length, 0)
})

test('confirmed FY26 retirements and planned FY27 removals stay separate', () => {
  const result = buildAnnouncementData([], retirements)
  assert.equal(result.labUpdates.filter(item => item.kind === 'retired').length, 19)
  assert.equal(result.labUpdates.filter(item => item.kind === 'planned-retirement').length, 3)
  assert.ok(result.labUpdates.every(item => item.date === null))
  assert.ok(result.labUpdates.every(item => !item.manualRecord))
})

test('manual retirement supersedes an undated reference and a planned removal', () => {
  const result = buildAnnouncementData([
    { id: 'retired', sr: 14, type: 'trackChange', trackName: 'Example — Lab', changeType: 'removed', changeDate: '2026-09-07', notes: 'Confirmed' },
  ], [
    { title: 'example - lab', reason: 'Old reference', bucket: 'FY26 — already removed' },
    { title: 'Example Lab', reason: 'Pending', bucket: 'FY27 — pending removal' },
  ])
  assert.equal(result.labUpdates.length, 1)
  assert.equal(result.labUpdates[0].source, 'Manual update')
  assert.equal(result.labUpdates[0].date, '2026-09-07')
  assert.equal(result.labUpdates[0].manualRecord?.sr, 14)
})

test('manual added announcements remain separate from authoritative New Release labs', () => {
  const result = buildAnnouncementData([onboarding,
    { type: 'trackChange', sr: 43, trackName: onboarding.trackTitle, changeType: 'added', changeDate: '2026-09-07' },
  ], [], [release({ title: onboarding.trackTitle })])
  assert.equal(result.labUpdates.length, 2)
  assert.equal(result.labUpdates.filter(item => item.kind === 'new-release').length, 1)
  assert.equal(result.labUpdates.find(item => item.manualRecord)?.kind, 'manual-update')
})

test('unknown dates stay unknown, valid updates sort newest first', () => {
  const result = buildAnnouncementData([], [], [
    release({ id: 'unknown', title: 'Unknown date', releaseDate: 'invalid' }),
    release({ id: 'older', title: 'Older', releaseDate: '2026-01-01' }),
    release({ id: 'newer', title: 'Newer' }),
  ])
  assert.deepEqual(result.labUpdates.map(item => item.title), ['Newer', 'Older', 'Unknown date'])
  assert.equal(result.labUpdates[2].date, null)
})

test('source deletion or loss of RMP visibility is never inferred to be retirement', () => {
  assert.equal(buildAnnouncementData([], [], [release()]).labUpdates[0].kind, 'new-release')
  assert.deepEqual(buildAnnouncementData([]).labUpdates, [])
})

test('existing PDFs and general announcements retain fields and identifiers', () => {
  const result = buildAnnouncementData([
    { type: 'pdfCatalog', id: 'pdf', sr: 23, title: 'Catalog', description: 'Reference', pdfUrl: 'https://example.invalid/catalog.pdf', uploadDate: '2026-09-06' },
    { type: 'generalAnnouncement', id: 'notice', sr: 24, title: 'Notice', message: 'Team update', announcementDate: '2026-09-07' },
  ])
  assert.equal(result.pdfCatalogs[0].sr, 23)
  assert.equal(result.announcements[0].message, 'Team update')
  assert.deepEqual(result.labUpdates, [])
})

test('malformed payloads and unknown change types do not create false updates', () => {
  assert.deepEqual(buildAnnouncementData({ error: true }).labUpdates, [])
  assert.deepEqual(buildAnnouncementData([null, 3, 'x', [], { type: 'trackChange', changeType: 'unknown' }]).labUpdates, [])
})

test('calendar dates remain the same day in western timezones', () => {
  const previous = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    assert.equal(formatAnnouncementDate('2026-09-07'), 'Sep 7, 2026')
    assert.equal(formatAnnouncementDate(null), 'Date not recorded')
    assert.equal(formatAnnouncementDate('not-a-date'), 'Date not recorded')
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('resource links allow only HTTP(S)', () => {
  assert.equal(safeResourceUrl('https://example.invalid/catalog.pdf'), 'https://example.invalid/catalog.pdf')
  for (const url of ['javascript:alert(1)', 'data:text/html,test', '//example.invalid', 'https-not-a-url']) {
    assert.equal(safeResourceUrl(url), null)
  }
})

test('distinct manual history remains editable even when the lab names match', () => {
  const result = buildAnnouncementData([
    { type: 'trackChange', sr: 1, trackName: 'Example Lab', changeType: 'removed', changeDate: '2026-01-01' },
    { type: 'trackChange', sr: 2, trackName: 'Example — Lab', changeType: 'removed', changeDate: '2026-09-01' },
  ])
  assert.equal(result.labUpdates.length, 2)
  assert.deepEqual(result.labUpdates.map(item => item.manualRecord?.sr), [2, 1])
})

test('deduplication preserves meaningful symbols and distinct RMP request identities', () => {
  const result = buildAnnouncementData([
    { type: 'trackChange', sr: 1, trackName: 'Learn C#', changeType: 'added' },
  ], [], [release({ title: 'Learn C++' }), release({ id: 'second', title: 'Learn C++' }), release({ title: 'Learn C++' })])
  assert.equal(result.labUpdates.length, 3)
})

test('New Release metadata and grouping date come from the catalogue, not import time', () => {
  const result = buildAnnouncementData([onboarding], [], [release()])
  assert.equal(result.labUpdates[0].source, 'RMP Catalog')
  assert.equal(result.labUpdates[0].date, '2026-05-22')
  assert.equal(result.labUpdates[0].eventType, 'Hands-On Lab')
  assert.equal(result.labUpdates[0].labLanguages, 'English')
  assert.equal(result.labUpdates[0].manualRecord, undefined)
})

test('retirement is undated even when the retired lab has a LaunchDate', () => {
  const result = buildAnnouncementData([], [], [release({ kind: 'retired', releaseDate: '2024-01-01' })])
  assert.equal(result.labUpdates[0].date, null)
  assert.equal(groupLabUpdatesByMonth(result.labUpdates)[0].label, 'Undated')
})

test('live RMP retirement supersedes stale FY27 retirement plans/reference duplicates', () => {
  const result = buildAnnouncementData([], [
    { title: 'Example catalogue lab', reason: 'Pending', bucket: 'FY27 — pending removal' },
    { title: 'Example catalogue lab', reason: 'Removed', bucket: 'FY26 — already removed' },
  ], [release({ kind: 'retired' })])
  assert.equal(result.labUpdates.length, 1)
  assert.equal(result.labUpdates[0].source, 'RMP Catalog')
})

test('month/year grouping sorts newest first, keeps years separate and puts undated last', () => {
  const items = buildAnnouncementData([], [], [
    release({ id: 'old', releaseDate: '2025-05-01' }),
    release({ id: 'may', releaseDate: '2026-05-22' }),
    release({ id: 'may2', releaseDate: '2026-05-10' }),
    release({ id: 'june', releaseDate: '2026-06-01' }),
    release({ id: 'unknown', releaseDate: null }),
  ]).labUpdates
  const groups = groupLabUpdatesByMonth(items)
  assert.deepEqual(groups.map(group => group.month), ['2026-06', '2026-05', '2025-05', 'undated'])
  assert.equal(groups[1].updates.length, 2)
  assert.equal(groups[1].label, 'May 2026')
  assert.equal(announcementMonth('2026-02-30'), 'undated')
})

test('month, type, level and text filters compose without mutating source data', () => {
  const items = buildAnnouncementData([], [], [
    release({ id: 'match', title: 'Build agents', releaseDate: '2026-06-01', level: 'Intermediate' }),
    release({ id: 'wrongmonth', title: 'Build agents', level: 'Intermediate' }),
    release({ id: 'wrongtype', title: 'Build agents', releaseDate: '2026-06-01', level: 'Intermediate', eventType: 'Challenge Based Hack' }),
    release({ id: 'undated', releaseDate: null }),
  ]).labUpdates
  const matches = filterLabUpdates(items, { kind: 'new-release', month: '2026-06', level: 'Intermediate', eventType: 'Hands-On Lab', query: 'AGENTS' })
  assert.deepEqual(matches.map(item => item.id), ['catalogue:MATCH'])
  assert.equal(filterLabUpdates(items, { month: 'undated' }).length, 1)
  assert.equal(filterLabUpdates(items, { month: 'all' }).length, 4)
  assert.equal(items.length, 4)
})

test('content release mode includes historical releases that no longer have New Release tags', () => {
  const items = buildAnnouncementData([], [], [release(), release({ id: 'historical', kind: 'catalogue-release', highlights: ['Trending'] })]).labUpdates
  assert.equal(filterLabUpdates(items, { kind: 'releases' }).length, 2)
  assert.equal(filterLabUpdates(items, { kind: 'new-release' }).length, 1)
})

test('source range controls use local calendar dates and correctly roll back across years', () => {
  assert.deepEqual(defaultContentReleaseRange(new Date(2026, 8, 7)), { from: '2026-08-01', to: '2026-09-07' })
  assert.deepEqual(defaultContentReleaseRange(new Date(2026, 0, 2)), { from: '2025-12-01', to: '2026-01-02' })
  assert.equal(contentReleaseRangeError({ from: '2026-09-07', to: '2026-09-07' }), null)
  assert.ok(contentReleaseRangeError({ from: '2026-09-08', to: '2026-09-07' }))
  assert.ok(contentReleaseRangeError({ from: '2026-02-30', to: '2026-09-07' }))
  assert.ok(contentReleaseRangeError({ from: '', to: '2026-09-07' }))
})