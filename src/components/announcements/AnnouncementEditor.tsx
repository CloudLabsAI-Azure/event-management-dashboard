import { useState } from 'react'
import EntityEditDialog from '@/components/EntityEditDialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { safeResourceUrl, type EditableAnnouncement } from '@/lib/announcements'
import api from '@/lib/api'

export interface AnnouncementEditorTarget {
  type: EditableAnnouncement['type']
  record?: EditableAnnouncement
}

interface Draft {
  title: string
  body: string
  url: string
  date: string
  changeType: 'added' | 'removed'
}

function initialDraft(record?: EditableAnnouncement): Draft {
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (!record) return { title: '', body: '', url: '', date: today, changeType: 'added' }
  if (record.type === 'pdfCatalog') return { title: record.title, body: record.description, url: record.pdfUrl, date: record.uploadDate.slice(0, 10), changeType: 'added' }
  if (record.type === 'trackChange') return { title: record.trackName, body: record.notes, url: '', date: record.changeDate.slice(0, 10), changeType: record.changeType }
  return { title: record.title, body: record.message, url: '', date: record.announcementDate.slice(0, 10), changeType: 'added' }
}

function toPayload(type: EditableAnnouncement['type'], draft: Draft): Record<string, string> {
  if (type === 'pdfCatalog') return { title: draft.title.trim(), description: draft.body.trim(), pdfUrl: draft.url.trim(), uploadDate: draft.date }
  if (type === 'trackChange') return { trackName: draft.title.trim(), notes: draft.body.trim(), changeType: draft.changeType, changeDate: draft.date }
  return { title: draft.title.trim(), message: draft.body.trim(), announcementDate: draft.date }
}

/** Mounted afresh for each edit; a previous record's dirty fields cannot leak into a new post. */
export function AnnouncementEditor({ target, onClose, onSaved }: {
  target: AnnouncementEditorTarget
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const [draft, setDraft] = useState(() => initialDraft(target.record))
  const isPdf = target.type === 'pdfCatalog'
  const isLab = target.type === 'trackChange'
  const label = isPdf ? 'PDF resource' : isLab ? 'Lab update' : 'Team notice'

  const save = async () => {
    if (draft.title.trim().length < 3) throw new Error('Enter a title with at least 3 characters.')
    if (!draft.date || !Number.isFinite(Date.parse(draft.date))) throw new Error('Choose a valid date.')
    if (isPdf && !safeResourceUrl(draft.url.trim())) throw new Error('Enter an http:// or https:// resource URL.')
    if (!isPdf && !isLab && draft.body.trim().length < 5) throw new Error('Enter a message with at least 5 characters.')

    const fields = toPayload(target.type, draft)
    if (target.record) {
      if (target.record.sr <= 0) throw new Error('This record has no valid catalog identifier. Refresh and try again.')
      const original = toPayload(target.type, initialDraft(target.record))
      const changes = Object.fromEntries(Object.entries(fields).filter(([key, value]) => value !== original[key]))
      // The existing catalog API ignores empty updates. Do not report a cleared
      // field as saved when the server would silently retain its old value.
      if (Object.values(changes).some(value => value === '')) throw new Error('Existing fields cannot be cleared by the catalog API. Enter a replacement value instead.')
      if (Object.keys(changes).length > 0) await api.put(`/api/catalog/${target.record.sr}`, changes)
    } else {
      await api.post('/api/catalog', { ...fields, type: target.type })
    }
    window.dispatchEvent(new CustomEvent('catalog:changed'))
    await onSaved()
  }

  return (
    <EntityEditDialog open onOpenChange={open => { if (!open) onClose() }} title={`${target.record ? 'Edit' : 'Add'} ${label.toLowerCase()}`} onSave={save} saveLabel={target.record ? 'Save changes' : 'Publish'}>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="announcement-title">{isLab ? 'Lab name' : 'Title'}</Label>
          <Input id="announcement-title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} placeholder={isLab ? 'Name of the lab' : 'A clear, descriptive title'} maxLength={500} />
        </div>
        {isLab && (
          <div className="space-y-2">
            <Label htmlFor="announcement-kind">Confirmed change</Label>
            <select id="announcement-kind" value={draft.changeType} onChange={e => setDraft({ ...draft, changeType: e.target.value as Draft['changeType'] })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              <option value="added">Added to catalog</option>
              <option value="removed">Retired from catalog</option>
            </select>
            <p className="text-xs text-muted-foreground">Only publish a retirement once removal is confirmed. Cancelling an event is not a lab retirement.</p>
          </div>
        )}
        {isPdf && (
          <div className="space-y-2">
            <Label htmlFor="announcement-url">PDF URL</Label>
            <Input id="announcement-url" type="url" value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })} placeholder="https://…" />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="announcement-body">{isPdf ? 'Description' : isLab ? 'Notes / replacement lab' : 'Message'}</Label>
          <Textarea id="announcement-body" value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} rows={4} maxLength={5000} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="announcement-date">{isLab ? 'Effective date' : 'Publication date'}</Label>
          <Input id="announcement-date" type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} />
        </div>
      </div>
    </EntityEditDialog>
  )
}