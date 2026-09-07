import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMsal } from '@azure/msal-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Archive, Bell, BookOpen, CalendarClock, CheckCircle2, ClipboardList,
  ExternalLink, FileText, Loader2, Megaphone, Pencil, Plus, RefreshCw, Rocket,
  Search, ShieldCheck, Sparkles, Trash2,
} from 'lucide-react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { useAuth } from '@/components/AuthProvider'
import { AnnouncementEditor, type AnnouncementEditorTarget } from '@/components/announcements/AnnouncementEditor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import { retirements } from '@/data/fy27Readout'
import { buildAnnouncementData, formatAnnouncementDate, safeResourceUrl, type EditableAnnouncement, type LabUpdateKind } from '@/lib/announcements'
import { getRmpSyncStatus, triggerRmpSync } from '@/lib/rmpSync'
import api from '@/lib/api'

const CATALOG_KEY = ['announcements', 'catalog']
const RMP_KEY = ['rmp-sync-status']
const updateStyles = {
  onboarding: { icon: Rocket, label: 'Onboarding', color: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', border: 'border-l-emerald-500' },
  retired: { icon: Archive, label: 'Retired', color: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', border: 'border-l-rose-500' },
  'planned-retirement': { icon: CalendarClock, label: 'Planned retirement', color: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', border: 'border-l-amber-500' },
}

export default function Announcements() {
  const { userRole, isAuthorized } = useAuth()
  const { instance } = useMsal()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<LabUpdateKind | 'all'>('all')
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

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CATALOG_KEY }),
      queryClient.invalidateQueries({ queryKey: RMP_KEY }),
    ])
  }, [queryClient])

  useEffect(() => {
    const onChanged = () => { void refresh() }
    window.addEventListener('catalog:changed', onChanged)
    window.addEventListener('rmp:synced', onChanged)
    return () => {
      window.removeEventListener('catalog:changed', onChanged)
      window.removeEventListener('rmp:synced', onChanged)
    }
  }, [refresh])

  const data = useMemo(() => buildAnnouncementData(catalog.data, retirements), [catalog.data])
  const query = search.trim().toLowerCase()
  const matches = (...values: string[]) => !query || values.some(value => value.toLowerCase().includes(query))
  const updates = data.labUpdates.filter(item => (filter === 'all' || item.kind === filter) && matches(item.title, item.description, item.eventId || '', item.replacement || '', item.source))
  const notices = data.announcements.filter(item => matches(item.title, item.message))
  const pdfs = data.pdfCatalogs.filter(item => matches(item.title, item.description))
  const counts = {
    onboarding: data.labUpdates.filter(item => item.kind === 'onboarding').length,
    retired: data.labUpdates.filter(item => item.kind === 'retired').length,
    planned: data.labUpdates.filter(item => item.kind === 'planned-retirement').length,
  }

  const syncRmp = async () => {
    setSyncing(true)
    try {
      const result = await triggerRmpSync(instance)
      toast({
        title: result.skipped ? 'Sync already in progress' : 'RMP sync complete',
        description: result.skipped ? 'Refresh shortly to see the results.'
          : result.baselined ? 'Baseline recorded. Only new requests will be imported on future syncs.'
          : `${result.imported || 0} imported · ${result.updated || 0} updated. Announcements now reflect the latest catalog.`,
      })
    } catch (error: unknown) {
      const response = (error as { response?: { data?: { error?: string } } })?.response?.data
      toast({ title: 'RMP sync unavailable', description: response?.error || 'Could not refresh from RMP. Existing announcements are still available.', variant: 'destructive' })
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
      <p className="mt-1 text-sm text-muted-foreground">{query ? 'Try another search or clear the filters.' : 'New updates will appear here automatically.'}</p>
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
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">New lab onboarding, confirmed retirements, and everything the team needs to know — collected in one place.</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/70 px-2.5 py-1"><RefreshCw className={`h-3 w-3 ${catalog.isFetching ? 'animate-spin' : ''}`} /> Auto-refreshes every minute</span>
                {catalog.dataUpdatedAt > 0 && <span>Checked {new Date(catalog.dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="outline" disabled={catalog.isFetching || rmp.isFetching} onClick={() => { void refresh() }}><RefreshCw className="mr-2 h-4 w-4" /> Refresh</Button>
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
            { label: 'Lab onboarding', value: counts.onboarding, icon: Rocket, color: updateStyles.onboarding.color, kind: 'onboarding' as const },
            { label: 'Confirmed retirements', value: counts.retired, icon: Archive, color: updateStyles.retired.color, kind: 'retired' as const },
            { label: 'Planned retirements', value: counts.planned, icon: CalendarClock, color: updateStyles['planned-retirement'].color, kind: 'planned-retirement' as const },
            { label: 'PDF resources', value: data.pdfCatalogs.length, icon: BookOpen, color: 'bg-primary/10 text-primary', kind: null },
          ].map(stat => (
            <button key={stat.label} type="button" onClick={() => { setSearch(''); if (stat.kind) { setTab('labs'); setFilter(stat.kind) } else setTab('resources') }} className="flex items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'onboarding', 'retired', 'planned-retirement'] as const).map(kind => (
                  <Button key={kind} size="sm" variant={filter === kind ? 'secondary' : 'ghost'} aria-pressed={filter === kind} className="h-8 rounded-full text-xs" onClick={() => setFilter(kind)}>{kind === 'all' ? 'All updates' : updateStyles[kind].label}</Button>
                ))}
                {isAdmin && <Button size="sm" variant="outline" className="ml-auto h-8 text-xs" onClick={() => setEditor({ type: 'trackChange' })}><Plus className="mr-1.5 h-3.5 w-3.5" /> Add confirmed update</Button>}
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">Onboarding is read automatically from Lab Development, including RMP imports. Retirement notices use explicit records; pending removals are not yet retired.</p>
              {catalog.isPending ? <div className="space-y-4" aria-label="Loading announcements">{[1, 2, 3].map(key => <Skeleton key={key} className="h-40 w-full rounded-xl" />)}</div>
                : updates.length === 0 ? emptyState('No matching lab updates')
                : updates.map(update => {
                  const style = updateStyles[update.kind]
                  return (
                    <article key={update.id} className={`rounded-xl border border-l-[3px] bg-card p-5 transition-colors hover:bg-accent/20 ${style.border}`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 hidden rounded-lg p-2 sm:block ${style.color}`}><style.icon className="h-4 w-4" /></div>
                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className={`border-0 text-[11px] ${style.color}`}>{style.label}</Badge>
                            <span className="text-xs text-muted-foreground">{update.source}</span>
                            {!update.manualRecord && <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="h-3 w-3" /> Automatic</span>}
                          </div>
                          <h2 className="break-words text-base font-semibold leading-snug">{update.title}</h2>
                          {update.description && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">{update.description}</p>}
                          {update.replacement && <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm"><span className="font-medium">Suggested replacement:</span> {update.replacement}</div>}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> {update.status}</span>
                            {update.eventId && <span className="font-mono">{update.eventId}</span>}
                            <span>{update.date ? `${update.dateLabel} ${formatAnnouncementDate(update.date)}` : update.source === 'FY27 review' ? update.dateLabel : 'Date not recorded'}</span>
                            {update.href && <Link to={update.href} className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">View source <ArrowRight className="h-3.5 w-3.5" /></Link>}
                          </div>
                        </div>
                        {update.manualRecord && recordActions(update.manualRecord)}
                      </div>
                    </article>
                  )
                })}
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
              <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-primary" /> RMP connection</div>
              <div className="flex items-center gap-2 text-sm"><span className={`h-2 w-2 rounded-full ${rmp.data?.tokenAvailable && !rmp.isError ? 'bg-emerald-500' : 'bg-amber-500'}`} /><span>{rmp.isError ? 'Status unavailable' : rmp.isPending ? 'Checking connection…' : rmp.data?.tokenAvailable ? 'Verified token available' : 'Waiting for verified access'}</span></div>
              <p className="text-xs leading-relaxed text-muted-foreground">Only tokens verified by RMP are kept for background sync. They expire naturally and are never saved to the catalog.</p>
              <div className="space-y-1 text-xs text-muted-foreground"><p>Last sync: {rmp.data?.lastSync ? formatAnnouncementDate(rmp.data.lastSync) : 'Not recorded'}</p>{rmp.data?.tokenExpiresAt && !rmp.isError && <p>Token expires: {new Date(rmp.data.tokenExpiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>}</div>
              {isAdmin && <Button variant="outline" size="sm" className="w-full" disabled={syncing} onClick={() => { void syncRmp() }}><RefreshCw className={`mr-2 h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />{syncing ? 'Syncing from RMP…' : 'Sync from RMP'}</Button>}
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