/** Read-only announcement projections. Opening the feed never creates catalog rows. */
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
export type LabUpdateKind = 'onboarding' | 'retired' | 'planned-retirement'

export interface LabUpdate {
  id: string
  kind: LabUpdateKind
  title: string
  description: string
  status: string
  source: 'RMP' | 'Lab Development' | 'Manual update' | 'FY27 review'
  date: string | null
  dateLabel: string
  eventId?: string
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
  return /^\d{4}-\d{2}-\d{2}(T.+)?$/.test(date) && Number.isFinite(Date.parse(date)) ? date : null
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
 * Onboarding requests are not necessarily released labs. Only explicit manual
 * retirement records / confirmed readout entries indicate retirement. Missing
 * RMP records, cancelled requests and pending removals never imply retirement.
 */
export function buildAnnouncementData(catalog: unknown, retirements: readonly RetirementSource[] = []) {
  const rows: Record<string, unknown>[] = Array.isArray(catalog)
    ? catalog.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : []
  const pdfCatalogs: PdfCatalog[] = []
  const announcements: GeneralAnnouncement[] = []
  const trackChanges: TrackChange[] = []
  const onboarding: LabUpdate[] = []

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
    } else if (row.type === 'roadmapItem' && normalized(text(row.labType)) === 'new lab onboarding' && row.isUpgrade !== true && row.isUpgrade !== 'true') {
      const excludedStatuses = new Set(['draft', 'cancelled', 'canceled', 'rejected', 'retired'])
      if (excludedStatuses.has(normalized(text(row.rmpStatus))) || excludedStatuses.has(normalized(text(row.phase)))) continue
      const title = text(row.finalizedTrackName) || text(row.trackTitle) || text(row.trackName)
      if (!title) continue
      const createdAt = validDate(row.createdAt)
      const requestDate = validDate(row.rmpRequestDate)
      const phase = text(row.phase) || 'Under assessment'
      onboarding.push({
        id: `onboarding:${text(row.rmpRequestUniqueName) || identity.id || identity.sr || normalized(title)}`,
        kind: 'onboarding', title,
        description: row.source === 'rmp'
          ? `Onboarding request synced from RMP${text(row.rmpStatus) ? ` · RMP status: ${text(row.rmpStatus)}` : ''}. See Lab Development for release readiness.`
          : 'New lab onboarding tracked in Lab Development. See the source record for release readiness.',
        status: phase, source: row.source === 'rmp' ? 'RMP' : 'Lab Development',
        date: createdAt || requestDate,
        dateLabel: createdAt ? 'Added to roadmap' : 'Requested',
        eventId: text(row.eventId),
        href: identity.sr > 0 ? `/dashboard/roadmap?sr=${identity.sr}` : '/dashboard/roadmap',
      })
    }
  }

  // Prefer explicit, dated announcements over matching automatic projections.
  // All deduplication is in-memory, so source records remain untouched.
  const updates: LabUpdate[] = []
  const manualNames = new Set<string>()
  const seenIds = new Set<string>()
  trackChanges.sort((a, b) => dateValue(b.changeDate) - dateValue(a.changeDate))
  for (const record of trackChanges) {
    if (!record.trackName) continue
    const kind = record.changeType === 'added' ? 'onboarding' : 'retired'
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
  onboarding.sort((a, b) => dateValue(b.date) - dateValue(a.date))
  for (const update of onboarding) {
    const key = `onboarding:${normalized(update.title)}`
    if (manualNames.has(key) || seenIds.has(update.id)) continue
    seenIds.add(update.id)
    updates.push(update)
  }
  for (const retirement of retirements) {
    if (!retirement.title) continue
    const kind = retirement.bucket === 'FY26 — already removed' ? 'retired'
      : retirement.bucket === 'FY27 — pending removal' ? 'planned-retirement' : null
    if (!kind) continue
    const name = normalized(retirement.title)
    const key = `${kind}:${name}`
    const id = `readout:${key}`
    if (seenIds.has(id) || manualNames.has(key) || (kind === 'planned-retirement' && manualNames.has(`retired:${name}`))) continue
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