import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Archive, Bell, BookOpen, CalendarClock, ClipboardList,
  ExternalLink, FileText, Loader2, Megaphone, Pencil, Plus, RefreshCw, Rocket,
  Search, ShieldCheck, Sparkles, Trash2,
} from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { useAuth } from '@/components/AuthProvider'
import { AnnouncementEditor, type AnnouncementEditorTarget } from '@/components/announcements/AnnouncementEditor'
import { CatalogueLabCard } from '@/components/announcements/CatalogueLabCard'
import { labUpdateStyles } from '@/components/announcements/labUpdateStyles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { retirements } from '@/data/fy27Readout'
import { buildAnnouncementData, filterLabUpdates, groupLabUpdatesByMonth, formatAnnouncementDate, safeResourceUrl, type EditableAnnouncement, type LabUpdateFilterKind } from '@/lib/announcements'
import { defaultContentReleaseRange, contentReleaseRangeError } from '@/lib/contentReleaseDates'
import type { ContentReleaseRange } from '@/types/rmpCatalogue'
import { getRmpSyncStatus, getRmpCatalogue, refreshRmpCatalogue } from '@/lib/rmpSync'
import api from '@/lib/api'

const CATALOG_KEY = ['announcements', 'catalog']
const RMP_KEY = ['rmp-sync-status']
const RMP_CATALOGUE_KEY = ['rmp-catalogue']

export default function Announcements() {
  const { userRole, isAuthorized } = useAuth()
  const { instance } = useMsal()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<LabUpdateFilterKind>('releases')
  const [dateRange, setDateRange] = useState<ContentReleaseRange | null>(() => defaultContentReleaseRange())
  const [draftRange, setDraftRange] = useState<ContentReleaseRange>(() => defaultContentReleaseRange())
  const [dateError, setDateError] = useState<string | null>(null)
  const [month, setMonth] = useState('all')
  const [eventType, setEventType] = useState('all')
  const [level, setLevel] = useState('all')
  const [tab, setTab] = useState('labs')
  const [editor, setEditor] = useState<AnnouncementEditorTarget | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const isAdmin = userRole === 'admin'

  const catalog = useQuery({
    queryKey: CATALOG_KEY,
    queryFn: async ({ signal }) => (await api.get<unknown>('/api/catalog', { signal })).data,
    enabled: isAuthorized,
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
  const rmp = useQuery({
    queryKey: RMP_KEY,
    queryFn: getRmpSyncStatus,
    enabled: isAuthorized,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const rmpCatalogue = useQuery({
    queryKey: [...RMP_CATALOGUE_KEY, dateRange?.from || 'all', dateRange?.to || 'all'],
    queryFn: ({ signal }) => getRmpCatalogue(dateRange, signal),
    enabled: isAuthorized,
    staleTime: 30_000,
    refetchInterval: query => query.state.data?.refreshing ? 2_000 : 60_000,
    refetchOnWindowFocus: true,
  })

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
      queryClient.invalidateQueries({ queryKey: RMP_KEY }),
      queryClient.invalidateQueries({ queryKey: RMP_CATALOGUE_KEY }),
    ])
  }, [queryClient])

  useEffect(() => {
    const onChanged = () => { void refresh() }
    window.addEventListener('catalog:changed', onChanged)
    window.addEventListener('rmp:synced', onChanged)
    window.addEventListener('rmp:catalogue-changed', onChanged)
    return () => {
      window.removeEventListener('catalog:changed', onChanged)
      window.removeEventListener('rmp:synced', onChanged)
      window.removeEventListener('rmp:catalogue-changed', onChanged)
    }
  }, [refresh])

  const data = useMemo(() => buildAnnouncementData(catalog.data, retirements, rmpCatalogue.data?.items), [catalog.data, rmpCatalogue.data?.items])
  const query = search.trim().toLowerCase()
  const matches = (...values: string[]) => !query || values.some(value => value.toLowerCase().includes(query))
  const updates = filterLabUpdates(data.labUpdates, { kind: filter, month, eventType, level, query: search })
  const monthGroups = groupLabUpdatesByMonth(updates)
  const filterOptions = useMemo(() => {
    const kindItems = filterLabUpdates(data.labUpdates, { kind: filter })
    return {
      months: groupLabUpdatesByMonth(kindItems),
      eventTypes: [...new Set(kindItems.map(item => item.eventType).filter(Boolean))].sort(),
      levels: [...new Set(kindItems.map(item => item.level).filter(Boolean))].sort(),
    }
  }, [data.labUpdates, filter])
  const clearFilters = () => { setSearch(''); setMonth('all'); setEventType('all'); setLevel('all') }
  const changeKind = (kind: LabUpdateFilterKind) => { setFilter(kind); clearFilters() }
  const applyDateRange = (event: React.FormEvent) => {
    event.preventDefault()
    const error = contentReleaseRangeError(draftRange)
    setDateError(error)
    if (error) return
    clearFilters()
    setDateRange({ ...draftRange })
  }
  const fetchingCatalogue = syncing || rmpCatalogue.data?.refreshing
  const notices = data.announcements.filter(item => matches(item.title, item.message))
  const pdfs = data.pdfCatalogs.filter(item => matches(item.title, item.description))
  const counts = {
    releases: filterLabUpdates(data.labUpdates, { kind: 'releases' }).length,
    retired: data.labUpdates.filter(item => item.kind === 'retired').length,
    planned: data.labUpdates.filter(item => item.kind === 'planned-retirement').length,
  }

  const syncRmp = async () => {
    setSyncing(true)
    try {
      const result = await refreshRmpCatalogue(instance, dateRange)
      toast({
        title: result.refreshing ? 'Catalogue refresh started' : 'Catalogue recently checked',
        description: result.refreshing ? 'Applying the Content Release Date filter in RMP and reading catalogue details. This page will update automatically.' : 'The last snapshot for this date range is shown. A short cooldown prevents repeated upstream requests.',
      })
    } catch (error: unknown) {
      const response = (error as { response?: { data?: { error?: string } } })?.response?.data
      toast({ title: 'Catalogue sync unavailable', description: response?.error || 'Could not refresh the RMP catalogue. Existing announcements are still available.', variant: 'destructive' })
    } finally {
      await refresh()
      setSyncing(false)
    }
  }

  const remove = async (record: EditableAnnouncement) => {
    const title = record.type === 'trackChange' ? record.trackName : record.title
    if (!window.confirm(`Delete "${title}"? This only removes the manual announcement, not the source lab.`)) return
    const key = `${record.type}:${record.sr}`
    setDeleting(key)
    try {
      if (record.sr <= 0) throw new Error('Invalid catalog identifier')
      await api.delete(`/api/catalog/${record.sr}`)
      window.dispatchEvent(new CustomEvent('catalog:changed'))
      await refresh()
      toast({ title: 'Announcement removed' })
    } catch {
      toast({ title: 'Delete failed', description: 'The announcement could not be removed. Please retry.', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  const recordActions = (record: EditableAnnouncement) => {
    if (!isAdmin || record.sr <= 0) return null
    const title = record.type === 'trackChange' ? record.trackName : record.title
    return (
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${title}`} onClick={() => setEditor({ type: record.type, record })}><Pencil className="h-3.5 w-3.5" /></Button>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Delete ${title}`} disabled={deleting !== null} onClick={() => { void remove(record) }}>
          {deleting === `${record.type}:${record.sr}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        </Button>
      </div>
    )
  }

  const emptyState = (message: string) => (
    <div className="rounded-xl border border-dashed p-12 text-center">
      <Search className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-sm text-muted-foreground">{query || dateRange || month !== 'all' ? 'Try another content release timeframe or clear the view filters.' : 'New updates will appear here automatically.'}</p>
    </div>
  )

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-indigo-500/5 p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-12 -top-16 h-64 w-64 rounded-full bg-primary/10 blur-3xl" aria-hidden="true" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-2xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Sparkles className="h-4 w-4" /> Catalog updates</div>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Announcements</h1>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">Discover labs from the RMP Catalog using Content Release Date — choose your timeframe and browse the results month by month.</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1"><RefreshCw className={`h-3 w-3 ${catalog.isFetching ? 'animate-spin' : ''}`} /> Auto-refreshes every minute</span>
                {catalog.dataUpdatedAt > 0 && <span>Checked {new Date(catalog.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" disabled={catalog.isFetching || rmpCatalogue.isFetching} onClick={() => { void refresh() }}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
              {isAdmin && <Button onClick={() => setEditor({ type: 'generalAnnouncement' })}><Plus className="mr-2 h-4 w-4" /> Post notice</Button>}
            </div>
          </div>
        </section>

        {catalog.isError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <span>Could not fetch the latest announcements. {catalog.data ? 'Showing the last loaded catalog.' : 'Only the published FY27 retirement reference is available.'}</span>
            <Button variant="outline" size="sm" onClick={() => { void catalog.refetch() }}>Retry</Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: 'Content releases in range', value: rmpCatalogue.data?.lastSyncedAt ? counts.releases : '—', icon: Rocket, color: labUpdateStyles['new-release'].color, kind: 'releases' as const },
            { label: 'Retirement notices', value: counts.retired, icon: Archive, color: labUpdateStyles.retired.color, kind: 'retired' as const },
            { label: 'Planned retirements', value: counts.planned, icon: CalendarClock, color: labUpdateStyles['planned-retirement'].color, kind: 'planned-retirement' as const },
            { label: 'PDF resources', value: data.pdfCatalogs.length, icon: BookOpen, color: 'bg-primary/10 text-primary', kind: null },
          ].map(stat => (
            <button key={stat.label} type="button" onClick={() => { clearFilters(); if (stat.kind) { setTab('labs'); changeKind(stat.kind) } else setTab('resources') }} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className={`rounded-lg p-2.5 ${stat.color}`}><stat.icon className="h-5 w-5" /></div>
              <div><div className="text-2xl font-semibold tabular-nums">{catalog.isPending ? '—' : stat.value}</div><div className="text-xs text-muted-foreground">{stat.label}</div></div>
            </button>
          ))}
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
          <Tabs value={tab} onValueChange={setTab} className="min-w-0 space-y-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row">
              <TabsList className="h-auto flex-wrap justify-start">
                <TabsTrigger value="labs"><Rocket className="mr-1.5 h-3.5 w-3.5" /> Lab updates</TabsTrigger>
                <TabsTrigger value="notices"><Bell className="mr-1.5 h-3.5 w-3.5" /> Team notices</TabsTrigger>
                <TabsTrigger value="resources"><FileText className="mr-1.5 h-3.5 w-3.5" /> Resources</TabsTrigger>
              </TabsList>
              <div className="relative sm:max-w-[240px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input aria-label="Search announcements" placeholder="Search updates…" value={search} onChange={event => setSearch(event.target.value)} className="pl-9" />
              </div>
            </div>

            <TabsContent value="labs" className="space-y-4">
              <form onSubmit={applyDateRange} className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Content Release Date</div>
                <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="content-release-from" className="text-xs">From</Label><Input id="content-release-from" type="date" value={draftRange.from} onChange={event => { setDraftRange({ ...draftRange, from: event.target.value }); setDateError(null) }} aria-invalid={!!dateError} aria-describedby={dateError ? 'content-date-error' : undefined} /></div>
                  <div className="min-w-0 flex-1 space-y-1.5"><Label htmlFor="content-release-to" className="text-xs">To</Label><Input id="content-release-to" type="date" value={draftRange.to} onChange={event => { setDraftRange({ ...draftRange, to: event.target.value }); setDateError(null) }} aria-invalid={!!dateError} aria-describedby={dateError ? 'content-date-error' : undefined} /></div>
                  <Button type="submit">Apply dates</Button>
                  <Button type="button" variant="outline" onClick={() => { setDateRange(null); setDraftRange({ from: '', to: '' }); setDateError(null); clearFilters() }}>All dates</Button>
                </div>
                {dateError && <p id="content-date-error" role="alert" className="text-sm text-destructive">{dateError}</p>}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{dateRange ? `Applied: ${formatAnnouncementDate(dateRange.from)} – ${formatAnnouncementDate(dateRange.to)}` : 'Applied: all content release dates'}</span><span>Filtered by RMP · Not request/import dates</span></div>
              </form>
              <div className="flex flex-wrap items-center gap-2">
                {(['releases', 'new-release', 'all', 'retired', 'planned-retirement', 'manual-update'] as const).map(kind => (
                  <Button key={kind} size="sm" variant={filter === kind ? 'secondary' : 'ghost'} aria-pressed={filter === kind} className="h-8 rounded-full text-xs" onClick={() => changeKind(kind)}>{kind === 'all' ? 'All updates' : kind === 'releases' ? 'Content releases' : labUpdateStyles[kind].label}</Button>
                ))}
                {isAdmin && <Button size="sm" variant="outline" className="ml-auto h-8 text-xs" onClick={() => setEditor({ type: 'trackChange' })}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add confirmed update</Button>}
              </div>
              <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
                <div className="space-y-1.5"><Label htmlFor="release-month" className="text-xs">Month / year</Label><Select value={month} onValueChange={setMonth}><SelectTrigger id="release-month"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All months</SelectItem>{filterOptions.months.map(group => <SelectItem key={group.month} value={group.month}>{group.label} ({group.updates.length})</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="release-type" className="text-xs">Event type</Label><Select value={eventType} onValueChange={setEventType}><SelectTrigger id="release-type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All event types</SelectItem>{filterOptions.eventTypes.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><Label htmlFor="release-level" className="text-xs">Level</Label><Select value={level} onValueChange={setLevel}><SelectTrigger id="release-level"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All levels</SelectItem>{filterOptions.levels.map(value => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{updates.length} matching updates · Grouped by source date</span>{(month !== 'all' || eventType !== 'all' || level !== 'all' || search) && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearFilters}>Clear filters</Button>}</div>
              <p className="text-xs leading-relaxed text-muted-foreground">The timeframe is sent to the Catalog’s Content Release Date filter. New Release narrows to that highlight; older releases remain available under Content releases. Manual notices and FY27 plans are separate from this upstream date filter.</p>
              {filter === 'retired' && <p className="text-xs text-muted-foreground">For RMP-retired labs, the timeframe filters their original content release date, not when they were retired. Retirement dates are not supplied by RMP.</p>}
              {(rmpCatalogue.isError || rmpCatalogue.data?.error) && <div role="alert" className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">{rmpCatalogue.data?.error || 'Could not load the RMP catalogue.'} {rmpCatalogue.data?.lastSyncedAt ? 'Showing the last successful snapshot.' : 'No catalogue releases have been loaded yet.'}</div>}
              {rmpCatalogue.data?.detailErrors > 0 && <p className="text-xs text-amber-700 dark:text-amber-400">{rmpCatalogue.data.detailErrors} catalogue details could not be fetched; affected dates remain undated until a successful retry.</p>}
              {rmpCatalogue.isPending || (!rmpCatalogue.data?.lastSyncedAt && fetchingCatalogue)
                ? <div className="space-y-4" aria-label="Loading catalogue releases"><p className="text-sm text-muted-foreground">Fetching catalogue releases and content dates…</p>{[1, 2, 3].map(key => <Skeleton key={key} className="h-40 w-full rounded-xl" />)}</div>
                : updates.length === 0 ? emptyState(!rmpCatalogue.data?.lastSyncedAt && (filter === 'new-release' || filter === 'releases') ? 'Waiting for an RMP catalogue sync' : 'No matching lab updates in this timeframe')
                : monthGroups.map(group => (
                  <section key={group.month} aria-label={group.label} className="space-y-3">
                    <div className="flex items-center gap-3 pt-3"><CalendarClock className="h-4 w-4 text-primary" /><h2 className="font-semibold">{group.label}</h2><Badge variant="secondary" className="text-xs">{group.updates.length}</Badge><div className="h-px flex-1 bg-border" /></div>
                    {group.month === 'undated' && <p className="text-xs text-muted-foreground">The source does not provide an effective date for these entries. Sync time is not used as a release or retirement date.</p>}
                    {group.updates.map(update => <CatalogueLabCard key={update.id} update={update} actions={update.manualRecord && recordActions(update.manualRecord)} />)}
                  </section>
                ))}
            </TabsContent>

            <TabsContent value="notices" className="space-y-4">
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">From the team</h2>{isAdmin && <Button variant="outline" size="sm" onClick={() => setEditor({ type: 'generalAnnouncement' })}><Plus className="mr-1.5 h-4 w-4" /> Add notice</Button>}</div>
              {catalog.isPending ? <Skeleton className="h-40 rounded-xl" /> : notices.length === 0 ? emptyState('No team notices to show') : notices.map(notice => (
                <Card key={notice.id || notice.sr} className="shadow-sm"><CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3"><div className="flex items-start gap-3"><Megaphone className="mt-1 h-5 w-5 shrink-0 text-primary" /><h3 className="break-words font-semibold">{notice.title}</h3></div>{recordActions(notice)}</div>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{notice.message}</p>
                  <p className="mt-4 text-xs text-muted-foreground">{formatAnnouncementDate(notice.announcementDate)}</p>
                </CardContent></Card>
              ))}
            </TabsContent>

            <TabsContent value="resources" className="space-y-4">
              <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Catalog library</h2>{isAdmin && <Button variant="outline" size="sm" onClick={() => setEditor({ type: 'pdfCatalog' })}><Plus className="mr-1.5 h-4 w-4" /> Add PDF</Button>}</div>
              {catalog.isPending ? <Skeleton className="h-40 rounded-xl" /> : pdfs.length === 0 ? emptyState('No PDF resources to show') : <div className="grid gap-4 md:grid-cols-2">{pdfs.map(pdf => {
                const url = safeResourceUrl(pdf.pdfUrl)
                return (
                  <Card key={pdf.id || pdf.sr} className="shadow-sm"><CardContent className="flex h-full flex-col p-5">
                    <div className="mb-4 flex items-center justify-between"><div className="rounded-lg bg-primary/10 p-3 text-primary"><FileText className="h-6 w-6" /></div>{recordActions(pdf)}</div>
                    <h3 className="break-words font-semibold">{pdf.title}</h3>
                    <p className="mb-4 mt-2 flex-1 break-words text-sm text-muted-foreground">{pdf.description || 'Downloadable catalog resource.'}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><span className="text-xs text-muted-foreground">{formatAnnouncementDate(pdf.uploadDate)}</span>{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">Open PDF <ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-xs text-muted-foreground">Resource link unavailable</span>}</div>
                  </CardContent></Card>
                )
              })}</div>}
            </TabsContent>
          </Tabs>

          <aside className="space-y-4">
            <Card className="bg-muted/20 shadow-none"><CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> RMP Catalog</div>
              <div className="flex items-center gap-2 text-sm"><span className={`h-2 w-2 rounded-full ${rmp.data?.tokenAvailable && !rmp.isError ? 'bg-emerald-500' : 'bg-amber-500'}`} /><span>{rmp.isError ? 'Status unavailable' : rmp.isPending ? 'Checking connection…' : rmp.data?.tokenAvailable ? 'Verified token available' : 'Waiting for verified access'}</span></div>
              <p className="text-xs leading-relaxed text-muted-foreground">Reads the Admin Center’s Content Release Date results—not event requests. Each timeframe has its own 15-minute cache, refreshed while active and a verified token is available.</p>
              <div className="space-y-1 text-xs text-muted-foreground"><p>Catalogue sync: {rmpCatalogue.data?.lastSyncedAt ? new Date(rmpCatalogue.data.lastSyncedAt).toLocaleString() : 'Not synced yet'}</p>{rmpCatalogue.data?.stale && rmpCatalogue.data.lastSyncedAt && <p className="text-amber-700 dark:text-amber-400">Saved snapshot · refresh needed</p>}{rmp.data?.tokenExpiresAt && !rmp.isError && <p>Token expires: {new Date(rmp.data.tokenExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</div>
              {isAdmin && <Button variant="outline" size="sm" className="w-full" disabled={fetchingCatalogue} onClick={() => { void syncRmp() }}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${fetchingCatalogue ? 'animate-spin' : ''}`} />{fetchingCatalogue ? 'Syncing catalogue…' : 'Sync catalog'}</Button>}
              <a href={dateRange ? `https://admin.cloudevents.ai/catalogue?content_release_datefrom=${dateRange.from}&content_release_dateto=${dateRange.to}&pagenumber=1&pagesize=10` : 'https://admin.cloudevents.ai/catalogue'} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">Same timeframe in RMP <ExternalLink className="h-3.5 w-3.5" /></a>
            </CardContent></Card>
            <Link to="/dashboard/catalog-readout" className="block rounded-xl border border-primary/20 bg-primary/5 p-5 transition-colors hover:bg-primary/10">
              <ClipboardList className="mb-3 h-6 w-6 text-primary" /><h2 className="font-semibold">Catalog Review FY27</h2>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">The published reference for confirmed retirements, planned removals, replacements, and new proposals.</p>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">Explore the review <ArrowRight className="h-3.5 w-3.5" /></span>
            </Link>
            <p className="px-1 text-xs leading-relaxed text-muted-foreground">Automatic entries are read-only. Update their source record to change them. Manual notices and PDF resources remain editable by admins.</p>
          </aside>
        </div>
        {editor && <AnnouncementEditor target={editor} onClose={() => setEditor(null)} onSaved={refresh} />}
      </div>
    </DashboardLayout>
  )
}