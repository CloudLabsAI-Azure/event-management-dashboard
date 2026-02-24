import { useEffect, useState, useCallback } from "react"
import { Bell, AlertTriangle, Clock, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { useNavigate } from "react-router-dom"

interface StaleItem {
  sr: number
  trackTitle: string
  type: string
  phase?: string
  status?: string
  lastCommentDate: string | null
  daysSinceComment: number
}

const STALE_THRESHOLD_DAYS = 7
const POLL_INTERVAL_MS = 5 * 60 * 1000 // refresh every 5 minutes

/** Humanize a type string for display */
function typeLabel(type: string) {
  switch (type) {
    case "roadmapItem": return "Roadmap"
    case "customLabRequest": return "Custom Lab"
    case "labsBacklog": return "Backlog"
    default: return type
  }
}

/** Color for the type badge */
function typeBadgeClass(type: string) {
  switch (type) {
    case "roadmapItem": return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
    case "customLabRequest": return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
    case "labsBacklog": return "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"
  }
}

/** Route path for each type */
function routeForType(type: string) {
  switch (type) {
    case "roadmapItem": return "/roadmap"
    case "customLabRequest": return "/custom-lab-request"
    case "labsBacklog": return "/labs-backlog"
    default: return "/dashboard"
  }
}

export function StaleItemsBell() {
  const [staleItems, setStaleItems] = useState<StaleItem[]>([])
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const fetchStaleItems = useCallback(async () => {
    try {
      const res = await fetch("/api/catalog")
      if (!res.ok) return
      const items = await res.json()

      const now = Date.now()
      const stale: StaleItem[] = []

      for (const item of items) {
        // Only check actionable types
        if (!["roadmapItem", "customLabRequest"].includes(item.type)) continue

        // Skip released / completed items
        const phase = (item.phase || "").toLowerCase()
        const status = (item.status || "").toLowerCase()
        if (phase === "released" || phase === "completed" || status === "completed" || status === "rejected") continue

        // Find most recent activity log date
        let lastDate: Date | null = null
        if (Array.isArray(item.activityLog) && item.activityLog.length > 0) {
          // activityLog is sorted newest-first
          const newest = item.activityLog[0]
          if (newest?.date) lastDate = new Date(newest.date)
        }

        // Fall back to notes date pattern "YYYY/MM/DD" at the start of notes
        if (!lastDate && item.notes) {
          const match = item.notes.match(/^(\d{4}\/\d{2}\/\d{2})/)
          if (match) lastDate = new Date(match[1].replace(/\//g, "-"))
        }

        const daysSince = lastDate
          ? Math.floor((now - lastDate.getTime()) / (1000 * 60 * 60 * 24))
          : 999 // no comment ever = definitely stale

        if (daysSince >= STALE_THRESHOLD_DAYS) {
          stale.push({
            sr: item.sr,
            trackTitle: item.trackTitle || item.trackName || `SR ${item.sr}`,
            type: item.type,
            phase: item.phase,
            status: item.status,
            lastCommentDate: lastDate ? lastDate.toISOString().split("T")[0] : null,
            daysSinceComment: daysSince,
          })
        }
      }

      // Sort: most stale first
      stale.sort((a, b) => b.daysSinceComment - a.daysSinceComment)
      setStaleItems(stale)
    } catch {
      // silently fail – don't break the header
    }
  }, [])

  useEffect(() => {
    fetchStaleItems()
    const id = setInterval(fetchStaleItems, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchStaleItems])

  const count = staleItems.length

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9"
          aria-label={`${count} stale items need attention`}
        >
          <Bell className={`h-5 w-5 ${count > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[380px] p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-semibold">Stale Items</span>
            {count > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {count}
              </Badge>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">No comment in 7+ days</span>
        </div>

        {/* Items list */}
        {count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
            <Bell className="h-8 w-8 opacity-30" />
            <p className="text-sm">All items are up to date</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="divide-y">
              {staleItems.map((item) => (
                <button
                  key={`${item.type}-${item.sr}`}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => {
                    setOpen(false)
                    navigate(routeForType(item.type))
                  }}
                >
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-tight truncate">
                      {item.trackTitle}
                    </p>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${typeBadgeClass(item.type)}`}>
                        {typeLabel(item.type)}
                      </span>
                      {item.phase && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {item.phase}
                        </span>
                      )}
                      {item.status && !item.phase && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {item.status}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {item.lastCommentDate
                        ? `Last comment: ${item.lastCommentDate} (${item.daysSinceComment}d ago)`
                        : "No comments yet"}
                    </p>
                  </div>
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-50" />
                </button>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
