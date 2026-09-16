import type { IPublicClientApplication } from '@azure/msal-browser'
import api from './api'
import { acquireB2CIdToken } from './rmpSync'
import type { RmpEventScanResult, RmpScheduledRange } from '@/types/rmpEvents'

/** Source-only sync. Does not call the paused importer or mutate local roadmap. */
export async function syncRmpCustomTech(instance: IPublicClientApplication, range: RmpScheduledRange | null, signal: AbortSignal) {
  const b2cToken = await acquireB2CIdToken(instance)
  signal.throwIfAborted()
  if (!b2cToken) throw Object.assign(new Error('Sign in again with your RMP-enabled account to sync Custom Tech. Another user’s token is never borrowed.'), { requiresReauth: true })
  return (await api.post<RmpEventScanResult<'Custom Tech Event'>>('/api/rmp/custom-tech/sync', { b2cToken, ...range }, { signal, timeout: 100_000 })).data
}