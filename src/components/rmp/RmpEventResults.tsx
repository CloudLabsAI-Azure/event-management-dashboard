import { CalendarClock, ExternalLink } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatAnnouncementDate } from '@/lib/announcements'
import type { buildRmpEventView } from '@/lib/rmpEventFilters'

export function RmpEventResults({ groups, label }: { groups: ReturnType<typeof buildRmpEventView>['groups']; label: string }) {
  return <>{groups.map(group => <section key={group.month} aria-label={`RMP ${label} ${group.label}`} className="space-y-3">
    <h3 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-primary" />{group.label}<Badge variant="secondary">{group.items.length}</Badge></h3>
    <div className="max-w-full overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader><TableRow><TableHead>Request</TableHead><TableHead className="min-w-[240px]">{label} title</TableHead><TableHead>Scheduled date</TableHead><TableHead>RMP status</TableHead><TableHead className="min-w-[220px]">Session details (event local time)</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
        <TableBody>{group.items.map(item => <TableRow key={item.requestId}>
          <TableCell className="font-mono text-xs">{item.requestCode || 'Not provided'}</TableCell>
          <TableCell><p className="font-medium">{item.title}</p>{item.templateName && item.templateName !== item.title && <p className="mt-1 text-xs text-muted-foreground">{item.templateName}</p>}<Badge variant="outline" className="mt-2 text-[10px]">{item.eventFormat}</Badge></TableCell>
          <TableCell className="whitespace-nowrap">{formatAnnouncementDate(item.scheduledDate)}</TableCell>
          <TableCell><Badge variant="secondary">{item.status}</Badge></TableCell>
          <TableCell className="text-xs text-muted-foreground"><p>{item.timeZone || 'Timezone not supplied'}{item.language ? ` · ${item.language}` : ''}</p>{!item.detailsAvailable ? <p className="mt-1 text-amber-700 dark:text-amber-400">Details unavailable</p> : item.sessions.length === 0 ? <p className="mt-1">No session times supplied</p> : <ul className="mt-2 space-y-2">{item.sessions.map((session, index) => <li key={`${session.date}:${index}`}><p className="font-medium">{session.title || `Session ${index + 1}`}</p><p>{formatAnnouncementDate(session.date)} · {session.startTime || '—'}–{session.endTime || '—'}{session.endDate && session.endDate !== session.date ? ` (ends ${formatAnnouncementDate(session.endDate)})` : ''}</p></li>)}</ul>}</TableCell>
          <TableCell>{item.adminUrl ? <a href={item.adminUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-primary hover:underline">Open RMP<ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-xs text-muted-foreground">Link not supplied</span>}</TableCell>
        </TableRow>)}</TableBody>
      </Table>
    </div>
  </section>)}</>
}