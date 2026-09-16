import type { RmpEventRequest, RmpEventScanResult } from './rmpEvents'
export type { RmpScheduledRange as RmpTttRange, RmpEventSessionDetail as RmpTttSessionDetail } from './rmpEvents'
export type RmpTttRequest = RmpEventRequest<'Train-The-Trainer'>
export type RmpTttScanResult = RmpEventScanResult<'Train-The-Trainer'>