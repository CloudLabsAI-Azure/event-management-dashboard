/** Read-only announcement projections. Opening the feed never creates catalog rows. */
import type { RmpCatalogueItem } from '@/types/rmpCatalogue'

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
export type LabUpdateFilterKind = LabUpdateKind | 'all' | 'releases'

export interface LabUpdate {
  id: string
  kind: LabUpdateKind
  title: string
  description: string
  status: string
  source: 'RMP Catalog' | 'Manual update' | 'FY27 review'
  date: string | null
  dateLabel: string
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

export function filterLabUpdates(items: readonly LabUpdate[], filters: LabUpdateFilters): LabUpdate[] {
  const query = (filters.query || '').trim().toLowerCase()
  return items.filter(item => (!filters.kind || filters.kind === 'all' || item.kind === filters.kind || (filters.kind === 'releases' && (item.kind === 'new-release' || item.kind === 'catalogue-release')))
    && (!filters.month || filters.month === 'all' || announcementMonth(item.date) === filters.month)
    && (!filters.eventType || filters.eventType === 'all' || item.eventType === filters.eventType)
    && (!filters.level || filters.level === 'all' || item.level === filters.level)
    && (!query || [item.title, item.description, item.topic, item.eventType, item.level, item.labLanguages, item.registrationLanguages, item.replacement, item.source].some(value => value?.toLowerCase().includes(query))))
}

export function groupLabUpdatesByMonth(items: readonly LabUpdate[]) {
  const groups = new Map<string, LabUpdate[]>()
  for (const item of items) {
    const key = announcementMonth(item.date)
    groups.set(key, [...(groups.get(key) || []), item])
  }
  return [...groups.entries()].sort(([a], [b]) => a === b ? 0 : a === 'undated' ? 1 : b === 'undated' ? -1 : b.localeCompare(a))
    .map(([month, updates]) => ({ month, label: formatAnnouncementMonth(month), updates: [...updates].sort((a, b) => dateValue(b.date) - dateValue(a.date) || a.title.localeCompare(b.title)) }))
}