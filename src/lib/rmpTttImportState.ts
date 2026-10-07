import type { RmpTttRequest, SavedTttSessionIdentity } from '../types/rmpTtt'

const key = (value?: string) => (value || '').trim().toUpperCase()

/** UI hint only: the server repeats identity and duplicate checks under its lock. */
export function savedTttRequestIds(requests: readonly RmpTttRequest[], sessions: readonly SavedTttSessionIdentity[]): Set<string> {
  return new Set(requests.filter(request => sessions.some(session => {
    const sourceId = key(session.rmpRequestUniqueName)
    if (sourceId) return sourceId === key(request.requestId)
    const code = key(request.requestCode)
    return code !== '' && code !== 'TBD' && code === key(session.eventId)
  })).map(request => key(request.requestId)))
}