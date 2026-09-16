import type { IPublicClientApplication } from '@azure/msal-browser'
import api from './api'
import { acquireB2CIdToken } from './rmpSync'
import type { RmpTttRange, RmpTttScanResult } from '@/types/rmpTtt'

/** Explicit read-only scan: never use the paused bulk-import endpoint. */
export async function scanRmpTtt(instance: IPublicClientApplication, range: RmpTttRange | null, signal: AbortSignal): Promise<RmpTttScanResult> {
  const b2cToken = await acquireB2CIdToken(instance)
  signal.throwIfAborted()
  if (!b2cToken) throw new Error('Sign in with your RMP-enabled account to scan TTT. Another user’s cached token cannot be used for this view.')
  const response = await api.post<RmpTttScanResult>('/api/rmp/ttt/scan', { b2cToken, ...range }, { signal, timeout: 100_000 })
  return response.data
}