export type RmpEventFormat = 'Train-The-Trainer' | 'Custom Tech Event'

export interface RmpScheduledRange {
  from: string
  to: string
}

export interface RmpEventSessionDetail {
  title: string
  date: string | null
  endDate: string | null
  startTime: string | null
  endTime: string | null
}

export interface RmpEventRequest<Format extends RmpEventFormat = RmpEventFormat> {
  requestId: string
  requestCode: string
  title: string
  eventFormat: Format
  status: string
  scheduledDate: string | null
  templateName: string
  timeZone: string
  language: string
  adminUrl: string | null
  sessions: RmpEventSessionDetail[]
  detailsAvailable: boolean
}

export interface RmpEventScanResult<Format extends RmpEventFormat = RmpEventFormat> {
  range: RmpScheduledRange | null
  scannedAt: string
  items: RmpEventRequest<Format>[]
  scannedRequests: number
  detailErrors: number
  readOnly: true
  scope: 'current-account'
}