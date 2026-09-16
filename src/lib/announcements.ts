/** Read-only announcement projections. Opening the feed never creates catalog rows. */
import type { ContentReleaseRange, RmpCatalogueItem } from '@/types/rmpCatalogue'
import { contentReleaseRangeError } from '@/lib/contentReleaseDates'

interface RecordIdentity {
  id: string
  sr: number
}

export interface PdfCatalog extends RecordIdentity {
  type: 'pdfCatalog'
  title: string
  description: string
  pdfUrl: string
  uploadDate: string
}

export interface TrackChange extends RecordIdentity {
  type: 'trackChange'
  trackName: string
  changeType: 'added' | 'removed'
  changeDate: string
  notes: string
}

export interface GeneralAnnouncement extends RecordIdentity {
  type: 'generalAnnouncement'
  title: string
  message: string
  announcementDate: string
}

export type EditableAnnouncement = PdfCatalog | TrackChange | GeneralAnnouncement
export type LabUpdateKind = 'new-release' | 'catalogue-release' | 'retired' | 'planned-retirement' | 'manual-update'
export type LabUpdateFilterKind = LabUpdateKind | 'all' | 'releases' | 'recently-updated' | 'upgraded' | 'trending' | 'more-languages'

export const LAB_UPDATE_FILTERS = [
  { value: 'all', label: 'All updates' },
  { value: 'releases', label: 'Content releases' },
  { value: 'new-release', label: 'New Release' },
  { value: 'recently-updated', label: 'Recently Updated' },
  { value: 'upgraded', label: 'Upgraded' },
  { value: 'trending', label: 'Trending' },
  { value: 'more-languages', label: 'More Languages Available' },
  { value: 'retired', label: 'Retired' },
  { value: 'planned-retirement', label: 'Planned retirement' },
  { value: 'manual-update', label: 'Manual update' },
] as const satisfies readonly { value: LabUpdateFilterKind; label: string }[]

export interface LabUpdate {
  id: string
  kind: LabUpdateKind
  title: string
  description: string
  status: string
  source: 'RMP Catalog' | 'Manual update' | 'FY27 review'
  date: string | null
  dateLabel: string
  /** Source LaunchDate applies to every RMP category; it is never a retirement date. */
  contentReleaseDate?: string | null
  lastContentModifiedDate?: string | null
  level?: string
  eventType?: string
  topic?: string
  labLanguages?: string
  registrationLanguages?: string
  highlights?: string[]
  releaseNotesUrl?: string | null
  detailAvailable?: boolean
  replacement?: string
  href?: string
  manualRecord?: TrackChange
}

interface RetirementSource {
  title: string
  reason: string
  bucket: string
  replacement?: string
}

const text = (value: unknown): string => typeof value === 'string' ? value.trim() : ''
// Normalize whitespace/dashes, but preserve meaningful symbols (e.g. C# vs C++).
const normalized = (value: string): string => value.normalize('NFKC').toLowerCase().replace(/[\s\u2010-\u2015-]+/g, ' ').trim()

function validDate(value: unknown): string | null {
  const date = text(value)
  if (!/^\d{4}-\d{2}-\d{2}(T.+)?$/.test(date) || !Number.isFinite(Date.parse(date))) return null
  const calendar = new Date(`${date.slice(0, 10)}T00:00:00Z`)
  return calendar.toISOString().slice(0, 10) === date.slice(0, 10) ? date : null
}

function dateValue(value: string | null): number {
  return value ? Date.parse(value) : 0
}

export function formatAnnouncementDate(value: string | null): string {
  if (!value || !validDate(value)) return 'Date not recorded'
  // Date-only fields are calendar dates, not midnight UTC instants.
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function safeResourceUrl(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}

/**
 * New releases come ONLY from the Admin Center's catalogue snapshot. Roadmap
 * requests (including budget/milestone requests) are never catalogue releases.
 * IsRetired is explicit upstream state; absence/cancellation is not retirement.
 */
export function buildAnnouncementData(catalog: unknown, retirements: readonly RetirementSource[] = [], catalogueItems: readonly RmpCatalogueItem[] = []) {
  const rows: Record<string, unknown>[] = Array.isArray(catalog)
    ? catalog.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : []
  const pdfCatalogs: PdfCatalog[] = []
  const announcements: GeneralAnnouncement[] = []
  const trackChanges: TrackChange[] = []

  for (const row of rows) {
    const identity = { id: text(row.id) || text(row._id), sr: Number(row.sr) || 0 }
    if (row.type === 'pdfCatalog') {
      pdfCatalogs.push({
        ...identity, type: 'pdfCatalog', title: text(row.title), description: text(row.description),
        pdfUrl: text(row.pdfUrl), uploadDate: validDate(row.uploadDate) || '',
      })
    } else if (row.type === 'generalAnnouncement') {
      announcements.push({
        ...identity, type: 'generalAnnouncement', title: text(row.title), message: text(row.message),
        announcementDate: validDate(row.announcementDate) || '',
      })
    } else if (row.type === 'trackChange' && (row.changeType === 'added' || row.changeType === 'removed')) {
      trackChanges.push({
        ...identity, type: 'trackChange', trackName: text(row.trackName), changeType: row.changeType,
        changeDate: validDate(row.changeDate) || '', notes: text(row.notes),
      })
    }
  }

  // Prefer explicit, dated announcements over matching automatic projections.
  // All deduplication is in-memory, so source records remain untouched.
  const updates: LabUpdate[] = []
  const manualNames = new Set<string>()
  const catalogueRetiredNames = new Set<string>()
  const seenIds = new Set<string>()
  for (const item of catalogueItems) {
    if (!item.id || !item.title || !['new-release', 'catalogue-release', 'retired'].includes(item.kind)) continue
    const id = `catalogue:${item.id.toUpperCase()}`
    if (seenIds.has(id)) continue
    seenIds.add(id)
    if (item.kind === 'retired') catalogueRetiredNames.add(normalized(item.title))
    updates.push({
      id, kind: item.kind, title: item.title, description: item.description,
      source: 'RMP Catalog', status: item.kind === 'retired' ? 'Retired in RMP' : item.kind === 'new-release' ? 'New Release' : 'Catalog release',
      date: validDate(item.kind === 'retired' ? item.retirementDate : item.releaseDate),
      dateLabel: item.kind === 'retired' ? 'Retired on' : 'Content released',
      contentReleaseDate: validDate(item.releaseDate),
      lastContentModifiedDate: validDate(item.lastContentModifiedDate),
      href: safeResourceUrl(item.detailsUrl) || undefined,
      level: item.level, eventType: item.eventType, topic: item.topic,
      labLanguages: item.labLanguages, registrationLanguages: item.registrationLanguages,
      highlights: item.highlights, releaseNotesUrl: safeResourceUrl(item.releaseNotesUrl || ''),
      detailAvailable: item.detailAvailable,
    })
  }
  trackChanges.sort((a, b) => dateValue(b.changeDate) - dateValue(a.changeDate))
  for (const record of trackChanges) {
    if (!record.trackName) continue
    const kind = record.changeType === 'added' ? 'manual-update' : 'retired'
    const key = `${kind}:${normalized(record.trackName)}`
    const id = `manual:${record.id || record.sr || key}`
    if (seenIds.has(id)) continue
    seenIds.add(id)
    manualNames.add(key)
    // Keep distinct manual records accessible, including repeated lifecycle
    // changes for a lab. Deduplication must not hide editable history.
    updates.push({
      id, kind, title: record.trackName,
      description: record.notes, status: kind === 'retired' ? 'Retired' : 'Added to catalog',
      source: 'Manual update', date: record.changeDate || null,
      dateLabel: kind === 'retired' ? 'Retired on' : 'Added on', manualRecord: record,
    })
  }
  for (const retirement of retirements) {
    if (!retirement.title) continue
    const kind = retirement.bucket === 'FY26 — already removed' ? 'retired'
      : retirement.bucket === 'FY27 — pending removal' ? 'planned-retirement' : null
    if (!kind) continue
    const name = normalized(retirement.title)
    const key = `${kind}:${name}`
    const id = `readout:${key}`
    if (seenIds.has(id) || catalogueRetiredNames.has(name) || manualNames.has(key) || (kind === 'planned-retirement' && manualNames.has(`retired:${name}`))) continue
    seenIds.add(id)
    updates.push({
      id, kind, title: retirement.title, description: retirement.reason,
      status: kind === 'retired' ? 'Confirmed retirement' : 'Pending removal', source: 'FY27 review',
      date: null, dateLabel: retirement.bucket, replacement: retirement.replacement,
      href: '/dashboard/catalog-readout',
    })
  }

  return {
    pdfCatalogs: pdfCatalogs.sort((a, b) => dateValue(b.uploadDate) - dateValue(a.uploadDate)),
    announcements: announcements.sort((a, b) => dateValue(b.announcementDate) - dateValue(a.announcementDate)),
    labUpdates: updates.sort((a, b) => dateValue(b.date) - dateValue(a.date) || a.title.localeCompare(b.title)),
  }
}

/** Month keys include year, so May 2025 and May 2026 never collapse together. */
export function announcementMonth(date: string | null): string {
  return validDate(date)?.slice(0, 7) || 'undated'
}

export function formatAnnouncementMonth(month: string): string {
  if (month === 'undated') return 'Undated'
  return new Date(`${month}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

export interface LabUpdateFilters {
  kind?: LabUpdateFilterKind
  month?: string
  eventType?: string
  level?: string
  query?: string
}

/** Search all display metadata, including lifecycle status and every highlight. */
export function matchesAnnouncementSearch(query: string | undefined, ...values: (string | null | undefined)[]): boolean {
  const terms = (query || '').normalize('NFKC').trim().toLowerCase().split(/\s+/).filter(Boolean)
  const haystack = values.filter(Boolean).join(' ').normalize('NFKC').toLowerCase()
  return terms.every(term => haystack.includes(term))
}

/** Category filters are independent: a New Release can also be Recently Updated. */
export function matchesLabUpdateCategory(item: LabUpdate, kind: LabUpdateFilterKind = 'all'): boolean {
  const highlight = {
    'new-release': 'new release',
    'recently-updated': 'recently updated',
    upgraded: 'upgraded',
    trending: 'trending',
    'more-languages': 'more languages available',
  }[kind] as string | undefined
  if (highlight) return item.source === 'RMP Catalog' && (
    (kind === 'new-release' && item.kind === 'new-release')
    || item.highlights?.some(tag => tag.trim().toLowerCase() === highlight) === true
  )
  if (kind === 'all') return true
  if (kind === 'releases') return item.kind === 'new-release' || item.kind === 'catalogue-release'
  return item.kind === kind
}

export function labUpdateFilterDate(item: LabUpdate): string | null {
  return item.source === 'RMP Catalog' ? item.contentReleaseDate ?? null : item.date
}

export function filterLabUpdates(items: readonly LabUpdate[], filters: LabUpdateFilters): LabUpdate[] {
  return items.filter(item => matchesLabUpdateCategory(item, filters.kind)
    && (!filters.month || filters.month === 'all' || announcementMonth(labUpdateFilterDate(item)) === filters.month)
    && (!filters.eventType || filters.eventType === 'all' || item.eventType === filters.eventType)
    && (!filters.level || filters.level === 'all' || item.level === filters.level)
    && matchesAnnouncementSearch(filters.query, item.title, item.description, item.topic, item.eventType,
      item.level, item.labLanguages, item.registrationLanguages, item.replacement, item.source,
      item.status, item.id, item.date, item.contentReleaseDate, item.lastContentModifiedDate, ...(item.highlights || [])))
}

export function groupLabUpdatesByMonth(items: readonly LabUpdate[]) {
  const groups = new Map<string, LabUpdate[]>()
  for (const item of items) {
    const key = announcementMonth(labUpdateFilterDate(item))
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return [...groups.entries()].sort(([a], [b]) => a === b ? 0 : a === 'undated' ? 1 : b === 'undated' ? -1 : b.localeCompare(a))
    .map(([month, updates]) => ({ month, label: formatAnnouncementMonth(month), updates: [...updates].sort((a, b) => dateValue(labUpdateFilterDate(b)) - dateValue(labUpdateFilterDate(a)) || a.title.localeCompare(b.title)) }))
}

export type AnnouncementData = ReturnType<typeof buildAnnouncementData>

/**
 * A single applied dataset for every category/tab. RMP is already range-filtered
 * upstream; unknown detail dates still belong to that source response. Local
 * notices have no upstream filter, so their recorded dates must be scoped here.
 * Undated local/FY27 history is visible only with All dates, never invented dates.
 */
export function scopeAnnouncementData(data: AnnouncementData, range: ContentReleaseRange | null): AnnouncementData {
  if (!range) return data
  const error = contentReleaseRangeError(range)
  if (error) throw new Error(error)
  const within = (value: string | null) => {
    const date = validDate(value)?.slice(0, 10)
    return !!date && date >= range.from && date <= range.to
  }
  return {
    labUpdates: data.labUpdates.filter(item => item.source === 'RMP Catalog'
      ? !validDate(item.contentReleaseDate) || within(item.contentReleaseDate || null)
      : within(item.date)),
    announcements: data.announcements.filter(item => within(item.announcementDate)),
    pdfCatalogs: data.pdfCatalogs.filter(item => within(item.uploadDate)),
  }
}

/** Rows, counts and options all derive from the same complete applied dataset. */
export function buildAnnouncementView(data: AnnouncementData, filters: LabUpdateFilters, range: ContentReleaseRange | null) {
  const scoped = scopeAnnouncementData(data, range)
  const matchingAllCategories = filterLabUpdates(scoped.labUpdates, { ...filters, kind: 'all' })
  const kinds: LabUpdateFilterKind[] = [...LAB_UPDATE_FILTERS.map(option => option.value), 'catalogue-release']
  const categoryCounts = Object.fromEntries(kinds.map(kind => [kind, matchingAllCategories.filter(item => matchesLabUpdateCategory(item, kind)).length])) as Record<LabUpdateFilterKind, number>
  const updates = matchingAllCategories.filter(item => matchesLabUpdateCategory(item, filters.kind))
  const monthMatches = (date: string) => !filters.month || filters.month === 'all' || announcementMonth(date) === filters.month
  const announcements = scoped.announcements.filter(item => monthMatches(item.announcementDate)
    && matchesAnnouncementSearch(filters.query, item.title, item.message, item.announcementDate))
  const pdfCatalogs = scoped.pdfCatalogs.filter(item => monthMatches(item.uploadDate)
    && matchesAnnouncementSearch(filters.query, item.title, item.description, item.uploadDate))
  // Options stay stable across categories. Do not remove a user's current
  // selection merely because the next category has zero matches for it.
  const months = [...new Set([
    ...scoped.labUpdates.map(item => announcementMonth(labUpdateFilterDate(item))),
    ...scoped.announcements.map(item => announcementMonth(item.announcementDate)),
    ...scoped.pdfCatalogs.map(item => announcementMonth(item.uploadDate)),
  ])].sort((a, b) => a === b ? 0 : a === 'undated' ? 1 : b === 'undated' ? -1 : b.localeCompare(a))
  return {
    updates, categoryCounts, announcements, pdfCatalogs,
    monthGroups: groupLabUpdatesByMonth(updates),
    options: {
      months,
      eventTypes: [...new Set(scoped.labUpdates.map(item => item.eventType).filter((value): value is string => !!value))].sort(),
      levels: [...new Set(scoped.labUpdates.map(item => item.level).filter((value): value is string => !!value))].sort(),
    },
    undatedLocalCount: range ? data.labUpdates.filter(item => item.source !== 'RMP Catalog' && !validDate(item.date)).length
      + data.announcements.filter(item => !validDate(item.announcementDate)).length
      + data.pdfCatalogs.filter(item => !validDate(item.uploadDate)).length : 0,
  }
}