import { useEffect, useMemo, useRef, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { Check, Download, ExternalLink, Loader2, Search, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
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
import { importRmpTtt, scanRmpTtt } from '@/lib/rmpTtt'
import { buildRmpTttView } from '@/lib/rmpTttFilters'
import { savedTttRequestIds } from '@/lib/rmpTttImportState'
import type { RmpTttImportResult, RmpTttScanResult, SavedTttSessionIdentity } from '@/types/rmpTtt'

export function RmpTttScanPanel({ savedSessions, onSaved, onViewDashboard }: {
  savedSessions: readonly SavedTttSessionIdentity[]
  onSaved: () => Promise<boolean>
  onViewDashboard: () => void
}) {
  const { instance, accounts } = useMsal()
  const { isAuthorized, user, userRole } = useAuth()
  const [draftRange, setDraftRange] = useState(() => defaultContentReleaseRange())
  const [allDates, setAllDates] = useState(false)
  const [snapshot, setSnapshot] = useState<{ identity: string; data: RmpTttScanResult } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [month, setMonth] = useState('all')
  const [status, setStatus] = useState('all')
  const [pendingIds, setPendingIds] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<RmpTttImportResult | null>(null)
  const [refreshFailed, setRefreshFailed] = useState(false)
  const activeRequest = useRef<AbortController | null>(null)
  const activeSave = useRef<AbortController | null>(null)
  const identity = `${user?.id || ''}:${accounts[0]?.homeAccountId || ''}`
  const result = isAuthorized && snapshot?.identity === identity ? snapshot.data : null
  const canSave = isAuthorized && userRole === 'admin'
  const busy = scanning || saving

  useEffect(() => {
    // Never retain another account's read-only result after sign-out/account switch.
    activeRequest.current?.abort()
    activeRequest.current = null
    activeSave.current?.abort()
    activeSave.current = null
    setSnapshot(null)
    setError(null)
    setScanning(false)
    setQuery('')
    setMonth('all')
    setStatus('all')
    setPendingIds(null)
    setSaving(false)
    setSaveError(null)
    setSaveResult(null)
    setRefreshFailed(false)
    return () => { activeRequest.current?.abort(); activeSave.current?.abort() }
  }, [identity, isAuthorized, canSave])

  const view = useMemo(() => buildRmpTttView(result?.items || [], { query, month, status }), [result, query, month, status])
  const savedIds = useMemo(() => savedTttRequestIds(result?.items || [], savedSessions), [result, savedSessions])
  const unsavedMatches = view.matches.filter(item => !savedIds.has(item.requestId.toUpperCase()))
  const clearFilters = () => { setQuery(''); setMonth('all'); setStatus('all') }

  const scan = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy || !isAuthorized) return
    const validation = allDates ? null : contentReleaseRangeError(draftRange)
    if (validation) { setError(validation); return }
    const controller = new AbortController()
    activeRequest.current?.abort()
    activeRequest.current = controller
    setScanning(true)
    setError(null)
    setSnapshot(null)
    setPendingIds(null)
    setSaveError(null)
    setSaveResult(null)
    setRefreshFailed(false)
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

  const save = async () => {
    if (!canSave || busy || !result || !pendingIds?.length) return
    const controller = new AbortController()
    activeSave.current = controller
    setSaving(true)
    setSaveError(null)
    setSaveResult(null)
    setRefreshFailed(false)
    setPendingIds(null)
    try {
      // Use the APPLIED scan range, not date inputs edited after the scan.
      const saved = await importRmpTtt(instance, pendingIds, result.range, controller.signal)
      if (controller.signal.aborted) return
      setSaveResult(saved)
      const refreshed = await onSaved()
      if (!controller.signal.aborted) setRefreshFailed(!refreshed)
    } catch (failure: unknown) {
      if (!controller.signal.aborted) {
        const response = (failure as { response?: { status?: number; data?: { error?: string } } })?.response
        if (response?.status === 401 || response?.status === 403) setSnapshot(null)
        setSaveError(response?.data?.error || (failure instanceof Error ? failure.message : 'Saving could not be confirmed. Refresh Dashboard sessions before retrying.'))
      }
    } finally {
      if (activeSave.current === controller) {
        activeSave.current = null
        setSaving(false)
      }
    }
  }

  return (
    <div className="space-y-5">
      <Card className="border-primary/25 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg"><Search className="h-5 w-5 text-primary" />Scan Train-The-Trainer in RMP<Badge variant="outline">RMP read-only</Badge></CardTitle>
          <CardDescription>Source: My Events → Train-The-Trainer. Scan requests with that explicit event format, limited to your signed-in RMP account’s visibility.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={scan} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1.5"><Label htmlFor="ttt-scan-from">Scheduled from</Label><Input id="ttt-scan-from" type="date" value={draftRange.from} disabled={allDates || busy} onChange={event => setDraftRange({ ...draftRange, from: event.target.value })} /></div>
              <div className="space-y-1.5"><Label htmlFor="ttt-scan-to">Scheduled to</Label><Input id="ttt-scan-to" type="date" value={draftRange.to} disabled={allDates || busy} onChange={event => setDraftRange({ ...draftRange, to: event.target.value })} /></div>
              <Button type="submit" disabled={busy || !isAuthorized}>{scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}{scanning ? 'Scanning RMP…' : 'Scan RMP'}</Button>
            </div>
            <div className="flex items-center gap-2"><Checkbox id="ttt-scan-all-dates" checked={allDates} disabled={busy} onCheckedChange={value => setAllDates(value === true)} /><Label htmlFor="ttt-scan-all-dates" className="text-sm font-normal">All scheduled dates</Label></div>
            <p className="text-xs text-muted-foreground">Dates use each request’s scheduled start, not catalog Content Release Date. Scanning only reads RMP. Admins can then save individual requests or matching results to Dashboard sessions; the paused onboarding sync stays paused.</p>
          </form>
          <div className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span>Uses your own B2C sign-in—never another user’s cached token. Saving creates shared dashboard sessions, not changes in RMP. Existing sessions and notes are kept.</span></div>
          <a href="https://admin.cloudevents.ai/events" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open My Events in RMP<ExternalLink className="h-3.5 w-3.5" /></a>
          {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{error}</p>}
          {saveError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{saveError}</p>}
        </CardContent>
      </Card>

      {scanning && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Scanning the complete scheduled request range and TTT session details…</p>}
      {saving && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Verifying the selected requests in RMP and saving to the dashboard…</p>}
      {saveResult && <div role="status" className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
        <p className="font-medium">{saveResult.created} new sessions saved · {saveResult.restored} existing imports made visible · {saveResult.existing} already on the dashboard</p>
        {saveResult.conflicts.length > 0 && <p className="break-words text-amber-700 dark:text-amber-400">{saveResult.conflicts.length} requests were not saved because their IDs conflict with other records: {saveResult.conflicts.slice(0, 8).map(item => item.requestCode || item.requestId).join(', ')}{saveResult.conflicts.length > 8 ? '…' : ''}. No conflicting records were overwritten.</p>}
        {saveResult.detailErrors > 0 && <p className="text-muted-foreground">Session details were unavailable for {saveResult.detailErrors} verified requests. Missing times were not invented.</p>}
        {refreshFailed && <p className="text-amber-700 dark:text-amber-400">Saving succeeded, but the session list could not refresh. Reload the page to see the saved sessions.</p>}
        <Button variant="link" size="sm" className="h-auto p-0" onClick={onViewDashboard}>View Dashboard sessions</Button>
      </div>}
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
        {canSave && view.matches.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-4">
          <div><p className="text-sm font-medium">Save matching TTT requests</p><p className="mt-1 text-xs text-muted-foreground">{view.matches.length - unsavedMatches.length} already on the dashboard · Only results matching the current scan filters will be saved.</p>{unsavedMatches.length > 500 && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Refine the filters to save up to 500 requests at a time, or save individual rows.</p>}</div>
          <Button disabled={busy || unsavedMatches.length === 0 || unsavedMatches.length > 500} onClick={() => setPendingIds(unsavedMatches.map(item => item.requestId))}><Download className="mr-2 h-4 w-4" />{unsavedMatches.length === 0 ? 'All matching requests saved' : `Save ${unsavedMatches.length} to dashboard`}</Button>
        </div>}
        {result.detailErrors > 0 && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{result.detailErrors} requests have unavailable session details. The request list is complete; scan again to retry those details.</p>}
        {view.matches.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-medium">No matching TTT requests</p><p className="mt-1 text-sm text-muted-foreground">Change the scan timeframe or clear the filters. Results are limited to your RMP account’s visibility.</p></div>}
        <RmpEventResults groups={view.groups} label="TTT" renderAction={canSave ? item => savedIds.has(item.requestId.toUpperCase())
          ? <Badge variant="outline" className="gap-1 whitespace-nowrap text-green-700 dark:text-green-400"><Check className="h-3 w-3" />Saved</Badge>
          : <Button size="sm" variant="outline" disabled={busy} aria-label={`Save ${item.requestCode || item.title} to dashboard`} onClick={() => setPendingIds([item.requestId])}>Save</Button>
          : undefined} />
      </>}
      <AlertDialog open={canSave && pendingIds !== null} onOpenChange={open => { if (!open) setPendingIds(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save {pendingIds?.length || 0} TTT requests to the dashboard?</AlertDialogTitle>
            <AlertDialogDescription>These requests will be rechecked in RMP and saved as shared Dashboard sessions. Existing sessions and notes will not be overwritten. Selected older hidden TTT imports will become visible. RMP and the general onboarding sync will not be changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { void save() }} disabled={busy}>Save to dashboard</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}