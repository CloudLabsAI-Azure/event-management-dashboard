import type { RmpScheduledRange } from '@/types/rmpEvents'

export const CUSTOM_TECH_REFRESH_MS = 5 * 60_000

/** Account + timeframe isolation; no durable query cache or background polling. */
export function customTechQueryOptions(identity: string, range: RmpScheduledRange | null, enabled: boolean) {
  return {
    queryKey: ['rmp-custom-tech', identity, range?.from || 'all', range?.to || 'all'] as const,
    enabled,
    staleTime: CUSTOM_TECH_REFRESH_MS,
    gcTime: 0,
    retry: false as const,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: enabled ? CUSTOM_TECH_REFRESH_MS : false as const,
  }
}

export function customTechError(error: unknown) {
  const failure = error as { message?: string; requiresReauth?: boolean; response?: { status?: number; data?: { error?: string } } } | null
  return {
    message: failure?.response?.data?.error || failure?.message || 'Custom Tech could not sync. Retry or choose a narrower scheduled timeframe.',
    accessDenied: failure?.requiresReauth === true || failure?.response?.status === 401 || failure?.response?.status === 403,
  }
}