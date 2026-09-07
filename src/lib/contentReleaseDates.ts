import type { ContentReleaseRange } from '@/types/rmpCatalogue'

const localDate = (date: Date): string => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

/** Recent releases by default: start of last month through today (calendar dates). */
export function defaultContentReleaseRange(now = new Date()): ContentReleaseRange {
  return { from: localDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: localDate(now) }
}

export function contentReleaseRangeError(range: ContentReleaseRange): string | null {
  const isDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  if (!isDate(range.from) || !isDate(range.to)) return 'Choose both a valid start date and end date.'
  if (range.from > range.to) return 'Start date must be on or before end date.'
  return null
}