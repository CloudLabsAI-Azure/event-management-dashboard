import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { ExternalLink, Loader2, Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RmpEventResults } from '@/components/rmp/RmpEventResults'
import { formatAnnouncementDate, formatAnnouncementMonth } from '@/lib/announcements'
import { contentReleaseRangeError, defaultContentReleaseRange } from '@/lib/contentReleaseDates'
import { scanRmpTtt } from '@/lib/rmpTtt'
import { buildRmpTttView } from '@/lib/rmpTttFilters'
import type { RmpTttScanResult } from '@/types/rmpTtt'

export function RmpTttScanPanel() {
  const { instance, accounts } = useMsal()
  const { isAuthorized, user } = useAuth()
  const [draftRange, setDraftRange] = useState(() => defaultContentReleaseRange())
  const [allDates, setAllDates] = useState(false)
  const [snapshot, setSnapshot] = useState<{ identity: string; data: RmpTttScanResult } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState('all')
  const [status, setStatus] = useState('all')
  const activeRequest = useRef<AbortController | null>(null)
  const identity = `${user?.id || ''}:${accounts[0]?.homeAccountId || ''}`
  const result = isAuthorized && snapshot?.identity === identity ? snapshot.data : null

  useEffect(() => {
    // Never retain another account's read-only result after sign-out/account switch.
    activeRequest.current?.abort()
    activeRequest.current = null
    setSnapshot(null)
    setError(null)
    setScanning(false)
    setQuery('')
    setMonth('all')
    setStatus('all')
    return () => { activeRequest.current?.abort() }
  }, [identity, isAuthorized])

  const view = useMemo(() => buildRmpTttView(result?.items || [], { query, month, status }), [result, query, month, status])
  const clearFilters = () => { setQuery(''); setMonth('all'); setStatus('all') }

  const scan = async (event: React.FormEvent) => {
    event.preventDefault()
    if (scanning || !isAuthorized) return
    const validation = allDates ? null : contentReleaseRangeError(draftRange)
    if (validation) { setError(validation); return }
    const controller = new AbortController()
    activeRequest.current?.abort()
    activeRequest.current = controller
    setScanning(true)
    setError(null)
    setSnapshot(null)
    try {
      const data = await scanRmpTtt(instance, allDates ? null : { ...draftRange }, controller.signal)
      if (!controller.signal.aborted) setSnapshot({ identity, data })
    } catch (failure: unknown) {
      if (!controller.signal.aborted) {
        const response = (failure as { response?: { data?: { error?: string } } })?.response?.data
        setError(response?.error || (failure instanceof Error ? failure.message : 'The RMP scan could not complete.'))
      }
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        setScanning(false)
      }
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg"><Search className="h-5 w-5 text-primary" />Scan Train-The-Trainer in RMP<Badge variant="outline">Read-only</Badge></CardTitle>
          <CardDescription>Source: My Events → Train-The-Trainer. Scan requests with that explicit event format, limited to your signed-in RMP account’s visibility.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={scan} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5"><Label htmlFor="ttt-scan-from">Scheduled from</Label><Input id="ttt-scan-from" type="date" value={draftRange.from} disabled={allDates || scanning} onChange={event => setDraftRange({ ...draftRange, from: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ttt-scan-to">Scheduled to</Label><Input id="ttt-scan-to" type="date" value={draftRange.to} disabled={allDates || scanning} onChange={event => setDraftRange({ ...draftRange, to: event.target.value })} /></div>
              <Button type="submit" disabled={scanning || !isAuthorized}>{scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}{scanning ? 'Scanning RMP…' : 'Scan RMP'}</Button>
            </div>
            <div className="flex items-center gap-2"><Checkbox id="ttt-scan-all-dates" checked={allDates} disabled={scanning} onCheckedChange={value => setAllDates(value === true)} /><Label htmlFor="ttt-scan-all-dates" className="text-sm font-normal">All scheduled dates</Label></div>
            <p className="text-xs text-muted-foreground">The timeframe and months use each request’s scheduled start date, not catalog Content Release Date. Scan runs only when requested; it does not import records, update statuses, or re-enable the paused onboarding sync.</p>
          </form>
          <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span>Uses your own B2C sign-in—never another user’s cached token. Local dashboard sessions remain separate and unchanged.</span></div>
          <a href="https://admin.cloudevents.ai/events" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open My Events in RMP<ExternalLink className="h-3.5 w-3.5" /></a>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p>}
        </CardContent>
      </Card>

      {scanning && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Scanning the complete scheduled request range and TTT session details…</p>}
      {!result && !scanning && !error && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Choose a timeframe and select Scan RMP to view Train-The-Trainer requests.</p>}
      {result && <>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Scanned: {result.range ? `${formatAnnouncementDate(result.range.from)} – ${formatAnnouncementDate(result.range.to)}` : 'All scheduled dates'} · {new Date(result.scannedAt).toLocaleString()}</span>
          <span>{result.items.length} TTT requests matched out of {result.scannedRequests} visible event requests checked</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {[['Matching TTT requests', view.matches.length], ['Completed', view.completed], ['Cancelled / rejected', view.cancelled]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}
        </div>
        <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
          <div className="space-y-1.5"><Label htmlFor="ttt-rmp-month">Scheduled month</Label><Select value={month} onValueChange={setMonth}><SelectTrigger id="ttt-rmp-month"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{view.months.map(value => <SelectItem key={value} value={value}>{formatAnnouncementMonth(value)}</SelectItem>)}{month !== 'all' && !view.months.includes(month) && <SelectItem value={month}>{formatAnnouncementMonth(month)} (0 matches)</SelectItem>}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="ttt-rmp-status">RMP status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger id="ttt-rmp-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{view.statuses.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}{status !== 'all' && !view.statuses.includes(status) && <SelectItem value={status}>{status} (0 matches)</SelectItem>}</SelectContent></Select></div>
          <div className="space-y-1.5"><Label htmlFor="ttt-rmp-search">Search scanned data</Label><Input id="ttt-rmp-search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, request code, language…" /></div>
        </div>
        {(month !== 'all' || status !== 'all' || query) && <Button variant="link" size="sm" className="h-auto p-0" onClick={clearFilters}>Clear scan filters</Button>}
        {result.detailErrors > 0 && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{result.detailErrors} requests have unavailable session details. The request list is complete; scan again to retry those details.</p>}
        {view.matches.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-medium">No matching TTT requests</p><p className="mt-1 text-sm text-muted-foreground">Change the scan timeframe or clear the filters. Results are limited to your RMP account’s visibility.</p></div>}
        <RmpEventResults groups={view.groups} label="TTT" />
      </>}
    </div>
  )
}