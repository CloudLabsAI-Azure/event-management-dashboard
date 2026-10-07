import type { RmpEventRequest, RmpEventScanResult } from './rmpEvents'
export type { RmpScheduledRange as RmpTttRange, RmpEventSessionDetail as RmpTttSessionDetail } from './rmpEvents'
export type RmpTttRequest = RmpEventRequest<'Train-The-Trainer'>
export type RmpTttScanResult = RmpEventScanResult<'Train-The-Trainer'>

export interface SavedTttSessionIdentity {
	eventId?: string
	rmpRequestUniqueName?: string
}

export interface RmpTttImportResult {
	success: true
	created: number
	restored: number
	existing: number
	savedRequestIds: string[]
	conflicts: { requestId: string; requestCode: string }[]
	detailErrors: number
}