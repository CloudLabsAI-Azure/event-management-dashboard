import React from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  title: string
  saving?: boolean
  onSave: () => Promise<void>
  children: React.ReactNode
  saveLabel?: string
}

export default function EntityEditDialog({ open, onOpenChange, title, saving, onSave, children, saveLabel = 'Save' }: Props) {
  const { toast } = useToast()
  const [busy, setBusy] = React.useState(false)

  const handleSave = async () => {
    setBusy(true)
    try {
      await onSave()
      toast({ title: `${title} saved`, description: 'Changes were saved successfully.' })
      onOpenChange(false)
    } catch (err: any) {
      toast({ title: 'Save failed', description: String(err?.message || err), variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="py-2">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSave} disabled={busy || saving}>{busy || saving ? 'Saving...' : saveLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
