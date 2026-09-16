import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarClock, ExternalLink, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatAnnouncementDate, type LabUpdate } from '@/lib/announcements'
import { labUpdateStyles } from './labUpdateStyles'

export function CatalogueLabCard({ update, actions }: { update: LabUpdate; actions?: ReactNode }) {
  const style = labUpdateStyles[update.kind]
  const [expanded, setExpanded] = useState(false)
  const fromRmp = update.source === 'RMP Catalog'
  return (
    <article className={`rounded-xl border border-l-[3px] bg-card p-5 transition-colors hover:bg-accent/20 ${style.border}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 hidden rounded-lg p-2 sm:block ${style.color}`}><style.icon className="h-4 w-4" /></div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className={`border-0 text-[11px] ${style.color}`}>{style.label}</Badge>
            <span className="text-xs text-muted-foreground">{update.source}</span>
            {update.highlights?.filter(tag => tag.toLowerCase() !== 'new release').map(tag => <Badge key={tag} variant="outline" className="text-[10px]">{tag}</Badge>)}
          </div>
          <h3 className="break-words text-base font-semibold leading-snug">{update.title}</h3>
          {update.description && (
            <div>
              <p className={`whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground ${expanded ? '' : 'line-clamp-3'}`}>{update.description}</p>
              {update.description.length > 240 && <Button variant="link" size="sm" className="h-auto px-0 pt-1 text-xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? 'Show less' : 'Read details'}</Button>}
            </div>
          )}
          {fromRmp && (
            <dl className="grid gap-x-4 gap-y-2 rounded-lg bg-muted/35 p-3 text-xs sm:grid-cols-2">
              {[
                ['Level', update.level], ['Event type', update.eventType], ['Topic', update.topic],
                ['Lab language', update.labLanguages], ['Registration page language', update.registrationLanguages],
                ['Content release date', update.contentReleaseDate ? formatAnnouncementDate(update.contentReleaseDate) : null],
                ['Content last updated', update.lastContentModifiedDate ? formatAnnouncementDate(update.lastContentModifiedDate) : null],
              ].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words font-medium">{value || 'Not provided'}</dd></div>)}
            </dl>
          )}
          {update.replacement && <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm"><span className="font-medium">Suggested replacement:</span> {update.replacement}</div>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{update.date ? `${update.dateLabel} ${formatAnnouncementDate(update.date)}` : update.source === 'FY27 review' ? update.dateLabel : update.kind === 'retired' ? 'Retirement date not provided' : 'Content release date not provided'}</span>
            {update.releaseNotesUrl && <a href={update.releaseNotesUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline"><FileText className="h-3.5 w-3.5" />Release notes</a>}
            {update.href && (fromRmp
              ? <a href={update.href} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">View in Catalog <ExternalLink className="h-3.5 w-3.5" /></a>
              : <Link to={update.href} className="ml-auto inline-flex items-center gap-1 font-medium text-primary hover:underline">View source <ArrowRight className="h-3.5 w-3.5" /></Link>)}
          </div>
          {fromRmp && update.detailAvailable === false && <p className="text-xs text-amber-700 dark:text-amber-400">Some catalogue details could not be fetched. The next sync will retry; no release date has been assumed.</p>}
        </div>
        {actions}
      </div>
    </article>
  )
}