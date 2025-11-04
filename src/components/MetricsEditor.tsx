import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import metricsService from '@/lib/services/metricsService'
import { useToast } from '@/hooks/use-toast'

export default function MetricsEditor({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (v: boolean) => void; onSaved?: (m: any) => void }) {
  const { toast } = useToast()
  const [metrics, setMetrics] = useState<any>({ tracksDelivered: 0, techEvents: 0, nonTechEvents: 0, languagesCovered: 0 })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let mounted = true
    ;(async () => {
      try {
        const data = await metricsService.get()
        if (!mounted) return
        setMetrics(data || { tracksDelivered: 0, techEvents: 0, nonTechEvents: 0, languagesCovered: 0 })
      } catch (err) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [open])

  const save = async () => {
    setLoading(true)
    try {
      const payload = {
        tracksDelivered: Number(metrics.tracksDelivered) || 0,
        techEvents: Number(metrics.techEvents) || 0,
        nonTechEvents: Number(metrics.nonTechEvents) || 0,
        languagesCovered: Number(metrics.languagesCovered) || 0,
        topTracks: metrics.topTracks || []
      }
      await metricsService.update(payload)
      toast({ title: 'Saved', description: 'Metrics updated' })
      // notify other pages to refresh their metric displays
      try {
        window.dispatchEvent(new CustomEvent('metrics:changed', { detail: payload }))
      } catch (e) {
        // ignore in non-browser environments
      }
      onSaved && onSaved(payload)
      onOpenChange(false)
    } catch (err) {
      toast({ title: 'Save failed', description: 'Could not update metrics', variant: 'destructive' })
    }
    setLoading(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Metrics</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Tracks Delivered</Label>
            <Input value={metrics.tracksDelivered} onChange={(e: any) => setMetrics({ ...metrics, tracksDelivered: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Tech Events</Label>
            <Input value={metrics.techEvents} onChange={(e: any) => setMetrics({ ...metrics, techEvents: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Non-Tech Events</Label>
            <Input value={metrics.nonTechEvents} onChange={(e: any) => setMetrics({ ...metrics, nonTechEvents: e.target.value })} className="col-span-3" />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Languages Covered</Label>
            <Input value={metrics.languagesCovered} onChange={(e: any) => setMetrics({ ...metrics, languagesCovered: e.target.value })} className="col-span-3" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={loading}>{loading ? 'Saving...' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
