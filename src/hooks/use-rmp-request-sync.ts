import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/components/AuthProvider'
import { getRmpSyncStatus } from '@/lib/rmpSync'

/** Fail closed while loading: paused import buttons must not briefly appear. */
export function useRmpRequestSyncEnabled() {
  const { isAuthorized } = useAuth()
  const status = useQuery({
    queryKey: ['rmp-sync-status'],
    queryFn: getRmpSyncStatus,
    enabled: isAuthorized,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  return status.data?.requestSyncEnabled === true
}