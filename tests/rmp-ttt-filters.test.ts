import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildRmpTttView } from '../src/lib/rmpTttFilters'
import type { RmpTttRequest } from '../src/types/rmpTtt'

const item = (n: number, overrides: Partial<RmpTttRequest> = {}): RmpTttRequest => ({
  requestId: `REQUEST-${n}`, requestCode: `TTT-${n}`, title: `Trainer workshop ${n}`, eventFormat: 'Train-The-Trainer',
  status: 'Approved', scheduledDate: '2026-08-20', templateName: 'AI facilitation', timeZone: 'India Standard Time', language: 'Spanish',
  adminUrl: null, detailsAvailable: true, sessions: [{ title: 'Responsible agents', date: '2026-08-20', endDate: '2026-08-20', startTime: '09:30', endTime: '11:30' }],
  ...overrides,
})
const filters = { month: 'all', status: 'all', query: '' }

test('TTT status, scheduled month and metadata search compose across the full scanned dataset', () => {
  const rows = [item(1, { status: 'Completed' }), item(2, { status: 'Canceled' }), item(3, { status: 'Completed', language: 'English' }), item(4, { status: 'Completed', scheduledDate: '2026-09-08' })]
  const view = buildRmpTttView(rows, { status: 'Completed', month: '2026-08', query: 'SPANISH agents 09:30' })
  assert.deepEqual(view.matches.map(row => row.requestCode), ['TTT-1'])
  assert.equal(view.completed, 1)
  assert.equal(view.cancelled, 0)
  assert.equal(view.groups[0].label, 'August 2026')
})

test('month/year groups stay distinct, newest first, with explicitly undated requests last', () => {
  const view = buildRmpTttView([item(1), item(2, { scheduledDate: '2025-08-20' }), item(3, { scheduledDate: null }), item(4, { scheduledDate: '2026-09-08' })], filters)
  assert.deepEqual(view.groups.map(group => group.month), ['2026-09', '2026-08', '2025-08', 'undated'])
  assert.deepEqual(view.months, ['2026-09', '2026-08', '2025-08', 'undated'])
})

test('status/count filters use actual RMP statuses, not inferred completion from a past date', () => {
  const rows = [item(1, { status: 'Approved', scheduledDate: '2024-01-01' }), item(2, { status: 'Completed' }), item(3, { status: 'Canceled' }), item(4, { status: 'Cancelled' }), item(5, { status: 'Rejected' }), item(6, { status: 'Unknown' })]
  const view = buildRmpTttView(rows, filters)
  assert.equal(view.matches.length, 6)
  assert.equal(view.completed, 1)
  assert.equal(view.cancelled, 3)
  assert.equal(buildRmpTttView(rows, { ...filters, status: 'Approved' }).completed, 0)
  assert.equal(buildRmpTttView(rows, { ...filters, status: 'Rejected' }).cancelled, 1)
})

test('search spans request codes, source IDs, status, timezone, language, template and individual sessions', () => {
  const rows = [item(1)]
  for (const query of ['ttt-1', 'request-1', 'approved spanish', 'india facilitation', 'agents 09:30', 'train-the-trainer workshop']) assert.equal(buildRmpTttView(rows, { ...filters, query }).matches.length, 1)
  assert.equal(buildRmpTttView(rows, { ...filters, query: 'agents french' }).matches.length, 0)
})

test('filter options do not disappear when another status/search produces zero matches', () => {
  const rows = [item(1), item(2, { status: 'Completed', scheduledDate: '2026-09-08' })]
  const all = buildRmpTttView(rows, filters)
  const none = buildRmpTttView(rows, { month: '2026-08', status: 'Completed', query: 'Missing text' })
  assert.equal(none.matches.length, 0)
  assert.deepEqual(none.statuses, all.statuses)
  assert.deepEqual(none.months, all.months)
})

test('scan filters search records beyond the first page and never change source rows or statuses', () => {
  const rows = Array.from({ length: 125 }, (_, index) => Object.freeze(item(index, { status: index === 124 ? 'Rejected' : 'Approved' })))
  const before = JSON.stringify(rows)
  const view = buildRmpTttView(Object.freeze(rows), { ...filters, status: 'Rejected', query: 'ttt-124' })
  assert.deepEqual(view.matches.map(row => row.requestCode), ['TTT-124'])
  assert.equal(view.cancelled, 1)
  assert.equal(JSON.stringify(rows), before)
})

test('empty datasets and unknown scheduled dates have accurate zero/undated results', () => {
  assert.equal(buildRmpTttView([], filters).matches.length, 0)
  const view = buildRmpTttView([item(1, { scheduledDate: null }), item(2, { scheduledDate: 'invalid' })], { ...filters, month: 'undated' })
  assert.equal(view.matches.length, 2)
  assert.equal(view.groups[0].label, 'Undated')
})