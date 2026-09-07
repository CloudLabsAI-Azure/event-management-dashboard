import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAnnouncementData, formatAnnouncementDate, safeResourceUrl } from '../src/lib/announcements.ts'
import { retirements } from '../src/data/fy27Readout.ts'

const onboarding = {
  id: 'rmp-fixture', sr: 42, type: 'roadmapItem', labType: 'New Lab Onboarding',
  trackTitle: 'Example onboarding lab', phase: 'Under assessment', source: 'rmp',
  rmpStatus: 'Approved', eventId: 'EXAMPLE-42', rmpRequestUniqueName: 'request-guid',
  createdAt: '2026-09-07T10:00:00Z',
}

test('onboarding is projected from RMP imports without claiming that a request is released', () => {
  const rows = [onboarding]
  const snapshot = structuredClone(rows)
  const result = buildAnnouncementData(rows)
  assert.equal(result.labUpdates.length, 1)
  assert.equal(result.labUpdates[0].kind, 'onboarding')
  assert.equal(result.labUpdates[0].status, 'Under assessment')
  assert.equal(result.labUpdates[0].source, 'RMP')
  assert.equal(result.labUpdates[0].href, '/dashboard/roadmap?sr=42')
  assert.equal(result.labUpdates[0].manualRecord, undefined)
  assert.deepEqual(rows, snapshot)
  assert.deepEqual(buildAnnouncementData(rows), result)
})

test('completed RMP requests do not automatically mean the lab has been released', () => {
  const result = buildAnnouncementData([{ ...onboarding, rmpStatus: 'Completed' }])
  assert.equal(result.labUpdates[0].status, 'Under assessment')
  assert.match(result.labUpdates[0].description, /RMP status: Completed/)
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

test('manual Lab Development onboarding is included with its correct provenance', () => {
  const result = buildAnnouncementData([{ ...onboarding, source: '', rmpStatus: '', isUpgrade: 'false' }])
  assert.equal(result.labUpdates[0].source, 'Lab Development')
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

test('manual added announcements deduplicate equivalent onboarding projections', () => {
  const result = buildAnnouncementData([onboarding,
    { type: 'trackChange', sr: 43, trackName: onboarding.trackTitle, changeType: 'added', changeDate: '2026-09-07' },
  ])
  assert.equal(result.labUpdates.length, 1)
  assert.equal(result.labUpdates[0].status, 'Added to catalog')
})

test('unknown dates stay unknown, valid updates sort newest first', () => {
  const result = buildAnnouncementData([
    { ...onboarding, id: 'unknown', rmpRequestUniqueName: 'unknown', trackTitle: 'Unknown date', createdAt: 'invalid' },
    { ...onboarding, id: 'older', rmpRequestUniqueName: 'older', trackTitle: 'Older', createdAt: '2026-01-01' },
    { ...onboarding, id: 'newer', trackTitle: 'Newer' },
  ])
  assert.deepEqual(result.labUpdates.map(item => item.title), ['Newer', 'Older', 'Unknown date'])
  assert.equal(result.labUpdates[2].date, null)
})

test('source deletion or loss of RMP visibility is never inferred to be retirement', () => {
  assert.equal(buildAnnouncementData([onboarding]).labUpdates[0].kind, 'onboarding')
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
    { ...onboarding, trackTitle: 'Learn C++' },
    { ...onboarding, id: 'second', rmpRequestUniqueName: 'second', trackTitle: 'Learn C++' },
    { ...onboarding, trackTitle: 'Learn C++' },
  ])
  assert.equal(result.labUpdates.length, 3)
})