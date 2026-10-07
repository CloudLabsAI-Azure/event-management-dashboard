import type { IPublicClientApplication } from '@azure/msal-browser'
import api from './api'
import { acquireB2CIdToken } from './rmpSync'
import type { RmpTttImportResult, RmpTttRange, RmpTttScanResult } from '@/types/rmpTtt'

/** Explicit read-only scan: never use the paused bulk-import endpoint. */
export async function scanRmpTtt(instance: IPublicClientApplication, range: RmpTttRange | null, signal: AbortSignal): Promise<RmpTttScanResult> {
  const b2cToken = await acquireB2CIdToken(instance)
  signal.throwIfAborted()
  if (!b2cToken) throw new Error('Sign in with your RMP-enabled account to scan TTT. Another user’s cached token cannot be used for this view.')
  const response = await api.post<RmpTttScanResult>('/api/rmp/ttt/scan', { b2cToken, ...range }, { signal, timeout: 100_000 })
  return response.data
}

/** Explicit local save; the server re-reads the selected IDs using this account. */
export async function importRmpTtt(instance: IPublicClientApplication, requestIds: string[], range: RmpTttRange | null, signal: AbortSignal): Promise<RmpTttImportResult> {
  const b2cToken = await acquireB2CIdToken(instance)
  signal.throwIfAborted()
  if (!b2cToken) throw new Error('Sign in with your RMP-enabled account to save TTT sessions.')
  const response = await api.post<RmpTttImportResult>('/api/rmp/ttt/import', { b2cToken, requestIds, ...range }, { signal, timeout: 130_000 })
  if (!response.data.success) throw new Error('Saving could not be confirmed. Refresh Dashboard sessions before retrying.')
  window.dispatchEvent(new CustomEvent('catalog:changed'))
  return response.data
}