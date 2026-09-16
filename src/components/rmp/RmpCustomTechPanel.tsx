import { useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useQuery } from '@tanstack/react-query'
import { Code2, ExternalLink, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RmpEventResults } from './RmpEventResults'
import { formatAnnouncementDate, formatAnnouncementMonth } from '@/lib/announcements'
import { contentReleaseRangeError } from '@/lib/contentReleaseDates'
import { buildRmpEventView } from '@/lib/rmpEventFilters'
import { syncRmpCustomTech } from '@/lib/rmpCustomTech'
import { customTechError, customTechQueryOptions } from '@/lib/rmpCustomTechQuery'
import type { RmpScheduledRange } from '@/types/rmpEvents'

export function RmpCustomTechPanel({ active }: { active: boolean }) {
  const { instance, accounts } = useMsal()
  const { isAuthorized, user } = useAuth()
  const identity = `${user?.id || ''}:${accounts[0]?.homeAccountId || ''}`
  const canSync = isAuthorized && accounts.length > 0
  const [range, setRange] = useState<RmpScheduledRange | null>(null)
  const [draft, setDraft] = useState<RmpScheduledRange>({ from: '', to: '' })
  const [dateError, setDateError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('all')
  const [status, setStatus] = useState('all')
  const source = useQuery({
    ...customTechQueryOptions(identity, range, active && canSync),
    queryFn: ({ signal }) => syncRmpCustomTech(instance, range, signal),
  })
  const failure = customTechError(source.error)
  // Do not keep displaying source requests after actual permission rejection.
  // Other transient failures may retain only this account + range's snapshot.
  const data = canSync && !failure.accessDenied ? source.data : undefined
  const view = useMemo(() => buildRmpEventView(data?.items || [], { query: search, month, status }), [data, search, month, status])

  useEffect(() => {
    setSearch(''); setMonth('all'); setStatus('all'); setDateError(null)
  }, [identity, isAuthorized])

  const applyDates = (event: React.FormEvent) => {
    event.preventDefault()
    const error = contentReleaseRangeError(draft)
    setDateError(error)
    if (!error) setRange({ ...draft })
  }

  return <div className="space-y-5">
    <Card className="border-primary/25 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg"><Code2 className="h-5 w-5 text-primary" />Custom Tech<Badge variant="outline">Auto-sync from RMP</Badge></CardTitle>
        <CardDescription>My Events → Custom Tech Event. Automatically loads all visible Custom Tech requests, including upcoming events, then checks every five minutes while this view is open.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={applyDates} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
            <div className="space-y-1.5"><Label htmlFor="custom-tech-from">Scheduled from</Label><Input id="custom-tech-from" type="date" value={draft.from} disabled={source.isFetching} onChange={event => { setDraft({ ...draft, from: event.target.value }); setDateError(null) }} aria-invalid={!!dateError} /></div>
            <div className="space-y-1.5"><Label htmlFor="custom-tech-to">Scheduled to</Label><Input id="custom-tech-to" type="date" value={draft.to} disabled={source.isFetching} onChange={event => { setDraft({ ...draft, to: event.target.value }); setDateError(null) }} aria-invalid={!!dateError} /></div>
            <Button type="submit" disabled={source.isFetching}>Apply dates</Button>
            <Button type="button" variant="outline" disabled={source.isFetching} onClick={() => { setRange(null); setDraft({ from: '', to: '' }); setDateError(null) }}>All dates</Button>
          </div>
          {dateError && <p role="alert" className="text-sm text-destructive">{dateError}</p>}
          <p className="text-xs text-muted-foreground">Applied: {range ? `${formatAnnouncementDate(range.from)} – ${formatAnnouncementDate(range.to)}` : 'All scheduled dates'}. Dates and month groups use the request’s scheduled start date, not a lab release date.</p>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-muted-foreground"><p>{data ? `Last synced: ${new Date(data.scannedAt).toLocaleString()}` : 'No source snapshot loaded yet'}</p><p>{active ? 'Automatic checks: every 5 minutes while open' : 'Automatic checks paused while this view is closed'}</p></div>
          <Button variant="outline" size="sm" disabled={!canSync || source.isFetching} onClick={() => { void source.refetch() }}>{source.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}{source.isFetching ? 'Syncing Custom Tech…' : 'Sync now'}</Button>
        </div>
        <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" /><span>Source-only sync using your signed-in RMP account. Custom Non-Tech events and onboarding imports stay excluded. Saved roadmap titles, phases, sponsors and notes are not overwritten. An event marked Completed does not mean its lab is Released.</span></p>
        <a href="https://admin.cloudevents.ai/events" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Open My Events in RMP<ExternalLink className="h-3.5 w-3.5" /></a>
        {!canSync && <p role="status" className="rounded-lg border p-3 text-sm">Sign in to the dashboard with your RMP-enabled B2C account to start automatic Custom Tech sync. Cached tokens from other users are not used.</p>}
        {source.isError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">{failure.message}{data ? ' Showing this account’s last successful snapshot for the applied timeframe.' : ''}</p>}
      </CardContent>
    </Card>
    {source.isFetching && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Reading every Custom Tech page and its session details…</p>}
    {data && <>
      <div className="grid gap-3 sm:grid-cols-3">{[['Matching Custom Tech requests', view.matches.length], ['Completed in RMP', view.completed], ['Cancelled / rejected', view.cancelled]].map(([label, value]) => <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></CardContent></Card>)}</div>
      <div className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3">
        <div className="space-y-1.5"><Label htmlFor="custom-tech-month">Scheduled month</Label><Select value={month} onValueChange={setMonth}><SelectTrigger id="custom-tech-month"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{view.months.map(value => <SelectItem key={value} value={value}>{formatAnnouncementMonth(value)}</SelectItem>)}{month !== 'all' && !view.months.includes(month) && <SelectItem value={month}>{formatAnnouncementMonth(month)} (0 matches)</SelectItem>}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="custom-tech-status">RMP status</Label><Select value={status} onValueChange={setStatus}><SelectTrigger id="custom-tech-status"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{view.statuses.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}{status !== 'all' && !view.statuses.includes(status) && <SelectItem value={status}>{status} (0 matches)</SelectItem>}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label htmlFor="custom-tech-search">Search synced data</Label><Input id="custom-tech-search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Title, request code, session…" /></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{view.matches.length} matching · {data.items.length} Custom Tech requests in the applied data</span>{(search || month !== 'all' || status !== 'all') && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => { setSearch(''); setMonth('all'); setStatus('all') }}>Clear Custom Tech filters</Button>}</div>
      {data.detailErrors > 0 && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">{data.detailErrors} requests have unavailable session details. The list is complete; the next sync retries those details.</p>}
      {view.matches.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center"><p className="font-medium">No matching Custom Tech requests</p><p className="mt-1 text-sm text-muted-foreground">Change the timeframe or clear the filters. Results reflect only your account’s RMP visibility.</p></div>}
      <RmpEventResults groups={view.groups} label="Custom Tech" />
    </>}
  </div>
}