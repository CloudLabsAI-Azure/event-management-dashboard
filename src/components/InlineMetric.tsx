import { useEffect, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { Pencil } from 'lucide-react'
import metricsService from '@/lib/services/metricsService'
import { Input } from '@/components/ui/input'

interface InlineMetricProps {
  metricKey: string
  value: string | number
  onValue?: (n: number) => void
  readOnly?: boolean
}

export default function InlineMetric({ metricKey, value, onValue, readOnly }: InlineMetricProps) {
  const { userRole: role } = useAuth()
  const [editing, setEditing] = useState(false)
  const [current, setCurrent] = useState(String(value ?? ''))
  const [draft, setDraft] = useState(String(value ?? ''))

  useEffect(() => { setDraft(String(value ?? '')); setCurrent(String(value ?? '')) }, [value])

  // Load persisted metric value and listen for global updates
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const saved = await metricsService.get()
        const savedVal = saved && Object.prototype.hasOwnProperty.call(saved, metricKey) ? saved[metricKey] : undefined
        if (mounted && savedVal !== undefined) {
          setCurrent(String(savedVal))
          setDraft(String(savedVal))
        }
      } catch {}
    })()
    const onChanged = (ev: any) => {
      const data = ev && ev.detail ? ev.detail : null
      if (data && Object.prototype.hasOwnProperty.call(data, metricKey)) {
        const v = data[metricKey]
        setCurrent(String(v))
        setDraft(String(v))
      }
    }
    try { window.addEventListener('metrics:changed', onChanged as EventListener) } catch {}
    return () => { mounted = false; try { window.removeEventListener('metrics:changed', onChanged as EventListener) } catch {} }
  }, [metricKey])

  const save = async () => {
    const num = Number(draft)
    if (Number.isNaN(num)) { setEditing(false); return }
    const aliasMap: Record<string, string[]> = {
      'completed.tracksDelivered': ['dashboard.completedEvents'],
      'dashboard.completedEvents': ['completed.tracksDelivered'],
      'upcoming.count': ['dashboard.upcomingEvents'],
      'dashboard.upcomingEvents': ['upcoming.count'],
    }
    const aliases = aliasMap[metricKey] || []
    const payload: Record<string, any> = { [metricKey]: num }
    aliases.forEach((k) => { payload[k] = num })
    await metricsService.savePartial({ metrics: payload })
    if (onValue) onValue(num)
    setCurrent(String(num))
    setEditing(false)
  }

  const forceReadOnly = readOnly || metricKey === 'dashboard.tracksHealthPercentage'

  if (role !== 'admin' || forceReadOnly) return <span>{current}</span>

  return (
    <span className="inline-flex items-center gap-2">
      {!editing ? (
        <>
          <span>{current}</span>
          <button aria-label="Edit metric" onClick={() => setEditing(true)} className="text-muted-foreground hover:text-primary">
            <Pencil className="h-4 w-4" />
          </button>
        </>
      ) : (
        <span className="inline-flex items-center gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-7 w-20" />
          <button onClick={save} className="text-primary text-sm">Save</button>
          <button onClick={() => { setEditing(false); setDraft(String(value ?? '')) }} className="text-muted-foreground text-sm">Cancel</button>
        </span>
      )}
    </span>
  )
}


