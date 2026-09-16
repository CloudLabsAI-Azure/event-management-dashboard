import { announcementMonth, formatAnnouncementMonth, matchesAnnouncementSearch } from './announcements'
import type { RmpEventRequest } from '@/types/rmpEvents'

export interface RmpEventFilters {
  month: string
  status: string
  query: string
}

export function buildRmpEventView(items: readonly RmpEventRequest[], filters: RmpEventFilters) {
  const matches = items.filter(item => (filters.month === 'all' || announcementMonth(item.scheduledDate) === filters.month)
    && (filters.status === 'all' || item.status === filters.status)
    && matchesAnnouncementSearch(filters.query, item.title, item.requestCode, item.requestId, item.status,
      item.templateName, item.timeZone, item.language, item.eventFormat, item.scheduledDate,
      ...item.sessions.flatMap(session => [session.title, session.date, session.startTime, session.endTime])))
  const byMonth = new Map<string, RmpEventRequest[]>()
  for (const item of matches) {
    const month = announcementMonth(item.scheduledDate)
    byMonth.set(month, [...(byMonth.get(month) || []), item])
  }
  const monthSort = (a: string, b: string) => a === b ? 0 : a === 'undated' ? 1 : b === 'undated' ? -1 : b.localeCompare(a)
  return {
    matches,
    groups: [...byMonth.entries()].sort(([a], [b]) => monthSort(a, b)).map(([month, entries]) => ({
      month, label: formatAnnouncementMonth(month),
      items: [...entries].sort((a, b) => (b.scheduledDate || '').localeCompare(a.scheduledDate || '') || a.title.localeCompare(b.title)),
    })),
    months: [...new Set(items.map(item => announcementMonth(item.scheduledDate)))].sort(monthSort),
    statuses: [...new Set(items.map(item => item.status))].sort(),
    completed: matches.filter(item => item.status.toLowerCase() === 'completed').length,
    cancelled: matches.filter(item => ['canceled', 'cancelled', 'rejected'].includes(item.status.toLowerCase())).length,
  }
}