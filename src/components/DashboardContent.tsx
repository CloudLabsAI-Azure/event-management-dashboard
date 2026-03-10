"use client"

import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts'
import { useAuth } from './AuthProvider'
import {
  CheckCircle,
  Calendar,
  Heart,
  MapPin,
  Globe,
  MessageSquare,
  Users,
  Star,
  Edit,
  ChevronDown,
  ChevronUp,
  Filter,
  Search,
  RefreshCw,
  Eye,
  TrendingUp,
  Trash2,
  FileText,
  BookOpen,
  Info,
  ClipboardList,
  Beaker,
  ArrowRight,
  ExternalLink,
  Layers,
  AlertTriangle,
} from "lucide-react"
import api from '@/lib/api'
import metricsService from '@/lib/services/metricsService'
import InlineMetric from '@/components/InlineMetric'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'

const ADMIN_URL = "https://admin.cloudevents.ai"

// Recharts color palette
const CHART_COLORS = {
  blue: '#3b82f6',
  emerald: '#10b981',
  amber: '#f59e0b',
  purple: '#8b5cf6',
  rose: '#f43f5e',
  orange: '#f97316',
  cyan: '#06b6d4',
  slate: '#94a3b8',
}

const statusColors = {
  completed: "bg-green-500/20 text-green-400 border-green-500/50",
  confirmed: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  planning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  excellent: "bg-green-500",
  good: "bg-blue-500",
  fair: "bg-yellow-500",
  "needs-attention": "bg-red-500",
}

export function DashboardContent() {
  const navigate = useNavigate()
  const { userRole } = useAuth()
  const { toast } = useToast()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Live metrics
  const [liveMetrics, setLiveMetrics] = useState({
    activeParticipants: 0,
    completedPracticeLabs: 0,
    tracksHealthPercentage: 0,
    lastUpdated: null as number | null,
  })

  // Roadmap data
  const [roadmapStats, setRoadmapStats] = useState({
    development: 0,
    released: 0,
    underAssessment: 0,
    releaseReady: 0,
    onHold: 0,
    blocked: 0,
    backlog: 0,
  })
  const [roadmapItems, setRoadmapItems] = useState<any[]>([])

  // Custom lab requests data
  const [customLabStats, setCustomLabStats] = useState({
    total: 0,
    oneTime: 0,
    recurring: 0,
    holRequested: 0,
    moveToCatalog: 0,
  })
  const [recentCustomLabs, setRecentCustomLabs] = useState<any[]>([])

  // Backlog data
  const [backlogStats, setBacklogStats] = useState({
    total: 0,
    byRequestType: [] as { name: string; count: number }[],
  })
  const [recentBacklogItems, setRecentBacklogItems] = useState<any[]>([])

  // Stale counts
  const [staleCounts, setStaleCounts] = useState({ roadmap: 0, customLab: 0 })

  // Localized tracks
  const [localizedCounts, setLocalizedCounts] = useState<{ total: number; byLanguage: { name: string; count: number }[] }>({
    total: 0, byLanguage: []
  })
  const [localizedProgress, setLocalizedProgress] = useState<{ title: string; languages: { name: string; percent: number; status: string }[] }[]>([])

  // Trending topics (kept for the topics card)
  const [trendingTopics, setTrendingTopics] = useState<{ topic: string; description: string; deliveryCount?: number }[]>([])
  const [isTrendingDialogOpen, setIsTrendingDialogOpen] = useState(false)
  const [newTrendingTitle, setNewTrendingTitle] = useState("")
  const [newTrendingDesc, setNewTrendingDesc] = useState("")

  // Trending health details
  const [trendingHealthDetails, setTrendingHealthDetails] = useState({
    testedCount: 0,
    totalCount: 0,
    oldestTestedDate: null as string | null,
  })

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // Fetch tracks for health metric
        const tr = await api.get('/api/tracks').then(r => Array.isArray(r.data) ? r.data : [])
        const now = new Date()
        const thresholdDaysAgo = new Date(now.getTime() - 32 * 24 * 60 * 60 * 1000)
        let testedCount = 0
        let oldestTestedDate: Date | null = null
        tr.forEach((track: any) => {
          const lastTestedStr = track.lastTestDate || track.lastTested || track.lastTestedDate
          if (lastTestedStr) {
            const lastTested = new Date(lastTestedStr)
            if (!isNaN(lastTested.getTime())) {
              if (lastTested >= thresholdDaysAgo) testedCount++
              if (!oldestTestedDate || lastTested < oldestTestedDate) oldestTestedDate = lastTested
            }
          }
        })
        const tracksHealthPercentage = tr.length > 0 ? Math.round((testedCount / tr.length) * 100) : 0
        setTrendingHealthDetails({
          testedCount,
          totalCount: tr.length,
          oldestTestedDate: oldestTestedDate ? oldestTestedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
        })

        // Fetch catalog data (roadmap, custom labs, localized)
        const catalog = await api.get('/api/catalog').then(r => Array.isArray(r.data) ? r.data : [])

        // === ROADMAP ===
        const roadmapItemsList = catalog.filter((item: any) => item.type === 'roadmapItem')
        setRoadmapItems(roadmapItemsList)
        const development = roadmapItemsList.filter((item: any) => String(item.phase || '').toLowerCase() === 'in-development').length
        const released = roadmapItemsList.filter((item: any) => String(item.phase || '').toLowerCase() === 'released').length
        const underAssessment = roadmapItemsList.filter((item: any) => String(item.phase || '').toLowerCase() === 'under assessment').length
        const releaseReady = roadmapItemsList.filter((item: any) => String(item.phase || '').toLowerCase() === 'release-ready').length
        const onHold = roadmapItemsList.filter((item: any) => String(item.phase || '').toLowerCase() === 'on-hold').length
        const blocked = roadmapItemsList.filter((item: any) => String(item.phase || '').toLowerCase() === 'blocked').length
        const backlog = roadmapItemsList.filter((item: any) => String(item.phase || '').toLowerCase() === 'backlog').length
        setRoadmapStats({ development, released, underAssessment, releaseReady, onHold, blocked, backlog })

        // === CUSTOM LAB REQUESTS ===
        const customLabs = catalog.filter((item: any) => item.type === 'customLabRequest')
        const oneTime = customLabs.filter((i: any) => String(i.frequency || '').toLowerCase() === 'one time').length
        const recurring = customLabs.filter((i: any) => String(i.frequency || '').toLowerCase() === 'recurring').length
        const holRequested = customLabs.filter((i: any) => String(i.holLabRequested || '').toLowerCase() === 'yes').length
        const moveToCatalog = customLabs.filter((i: any) => String(i.moveToRegularCatalog || '').toLowerCase() === 'yes').length
        setCustomLabStats({ total: customLabs.length, oneTime, recurring, holRequested, moveToCatalog })
        setRecentCustomLabs(customLabs.slice(0, 5))

        // === STALE COUNTS ===
        const STALE_DAYS = 7
        const computeStale = (items: any[]) => {
          return items.filter((item: any) => {
            const phase = (item.phase || '').toLowerCase()
            if (phase === 'released' || phase === 'completed') return false
            let lastDate: Date | null = null
            if (Array.isArray(item.activityLog) && item.activityLog.length > 0) {
              const newest = item.activityLog[0]
              if (newest?.date) lastDate = new Date(newest.date)
            }
            if (!lastDate && item.notes) {
              const m = item.notes.match(/^(\d{4}\/\d{2}\/\d{2})/)
              if (m) lastDate = new Date(m[1].replace(/\//g, '-'))
            }
            const daysSince = lastDate ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 999
            return daysSince >= STALE_DAYS
          }).length
        }
        setStaleCounts({ roadmap: computeStale(roadmapItemsList), customLab: computeStale(customLabs) })

        // === LABS BACKLOG ===
        const backlogItems = catalog.filter((item: any) => item.type === 'labsBacklog')
        const requestTypeCounts: Record<string, number> = {}
        backlogItems.forEach((item: any) => {
          const rt = item.requestType || 'Other'
          requestTypeCounts[rt] = (requestTypeCounts[rt] || 0) + 1
        })
        const byRequestType = Object.entries(requestTypeCounts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count)
        setBacklogStats({ total: backlogItems.length, byRequestType })
        setRecentBacklogItems(backlogItems.slice(0, 5))

        // === LOCALIZED TRACKS ===
        const localized = catalog.filter((i: any) => i && i.type === 'localizedTrack')
        const toPercent = (status: string) => {
          const s = String(status || '').toLowerCase()
          if (s === 'available' || s === 'completed') return 100
          if (s === 'in progress' || s === 'in-progress') return 50
          if (s === 'pending' || s === 'not available' || s === 'not-available') return 20
          return 0
        }
        const localizedEntries: { title: string; languages: { name: string; percent: number; status: string }[] }[] = []
        const langCounts: Record<string, number> = {}
        localized.forEach((i: any) => {
          const title = i.trackTitle || i.trackName || i.title || 'Track'
          const langs: { name: string; percent: number; status: string }[] = []
          const mapLang = (name: string, value: any) => {
            const normalized = (value === undefined || value === null || String(value).trim() === '') ? 'Not Available' : String(value)
            const p = toPercent(normalized)
            langs.push({ name, percent: p, status: normalized })
            if (normalized.toLowerCase() !== 'not available' && normalized.toLowerCase() !== 'not-available') {
              langCounts[name] = (langCounts[name] || 0) + 1
            }
          }
          mapLang('Spanish', i.spanish)
          mapLang('Portuguese', i.portuguese)
          localizedEntries.push({ title, languages: langs })
        })
        setLocalizedProgress(localizedEntries.slice(0, 5))
        const byLanguage = Object.entries(langCounts).map(([name, count]) => ({ name, count }))
        setLocalizedCounts({ total: localized.length, byLanguage })

        // === LIVE METRICS ===
        const activeParticipants = Array.isArray(tr) ? tr.reduce((acc: number, t: any) => acc + Number(t.participants || 0), 0) : 0
        const completedPracticeLabs = 1247
        let serverLastUpdated: number | null = null
        try {
          const lastUpdatedResponse = await api.get('/api/last-updated')
          if (lastUpdatedResponse.data?.lastUpdated) {
            serverLastUpdated = new Date(lastUpdatedResponse.data.lastUpdated).getTime()
          }
        } catch { serverLastUpdated = null }

        let next = { activeParticipants, completedPracticeLabs, tracksHealthPercentage, lastUpdated: serverLastUpdated }
        try {
          const saved = await metricsService.get()
          if (saved) {
            next = {
              activeParticipants: Number(saved['dashboard.activeParticipants'] ?? next.activeParticipants) || 0,
              completedPracticeLabs: Number(saved['dashboard.completedPracticeLabs'] ?? next.completedPracticeLabs) || 0,
              tracksHealthPercentage: Number(saved['dashboard.tracksHealthPercentage'] ?? next.tracksHealthPercentage) || next.tracksHealthPercentage,
              lastUpdated: serverLastUpdated,
            }
          }
        } catch {}
        setLiveMetrics(next)

        // === TRENDING TOPICS ===
        try {
          const saved = typeof window !== 'undefined' ? localStorage.getItem('dashboard.trendingTopics') : null
          if (saved) {
            const parsed = JSON.parse(saved)
            if (Array.isArray(parsed)) setTrendingTopics(parsed.slice(0, 6))
          } else {
            const defaults = [
              { topic: "Generative AI & LLMs", description: "Perfect for AI labs" },
              { topic: "Cloud-Native Apps", description: "Modern development" },
              { topic: "Edge Computing & IoT", description: "Practical implementation" },
              { topic: "Cybersecurity & Zero Trust", description: "Security-focused labs" },
              { topic: "DevOps & GitOps", description: "Automation labs" },
              { topic: "Data Analytics & ML Ops", description: "Data science labs" },
            ]
            setTrendingTopics(defaults)
            try { localStorage.setItem('dashboard.trendingTopics', JSON.stringify(defaults)) } catch {}
          }
        } catch {}
      } catch (err) {
        // swallow errors; UI shows whatever data available
      }
    }
    fetchAll()
    const onChanged = () => { (async () => { try { await fetchAll() } catch {} })() }
    const onVisibility = () => { if (document.visibilityState === 'visible') onChanged() }
    window.addEventListener('metrics:changed', onChanged)
    window.addEventListener('events:changed', onChanged)
    window.addEventListener('catalog:changed', onChanged)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('metrics:changed', onChanged)
      window.removeEventListener('events:changed', onChanged)
      window.removeEventListener('catalog:changed', onChanged)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const handleRemoveTrending = (removeIndex: number) => {
    setTrendingTopics((prev) => {
      const next = prev.filter((_, i) => i !== removeIndex)
      try { localStorage.setItem('dashboard.trendingTopics', JSON.stringify(next)) } catch {}
      return next
    })
  }

  // Roadmap pie chart data
  const roadmapChartData = [
    { name: 'Released', value: roadmapStats.released, color: CHART_COLORS.emerald },
    { name: 'Release-Ready', value: roadmapStats.releaseReady, color: CHART_COLORS.cyan },
    { name: 'In-Development', value: roadmapStats.development, color: CHART_COLORS.blue },
    { name: 'Under Assessment', value: roadmapStats.underAssessment, color: CHART_COLORS.amber },
    { name: 'Backlog', value: roadmapStats.backlog, color: CHART_COLORS.slate },
    { name: 'On-Hold', value: roadmapStats.onHold, color: CHART_COLORS.orange },
    { name: 'Blocked', value: roadmapStats.blocked, color: CHART_COLORS.rose },
  ].filter(d => d.value > 0)

  const totalRoadmapItems = roadmapChartData.reduce((sum, d) => sum + d.value, 0)

  // Custom lab bar chart data
  const customLabChartData = [
    { name: 'One Time', value: customLabStats.oneTime, fill: CHART_COLORS.blue },
    { name: 'Recurring', value: customLabStats.recurring, fill: CHART_COLORS.purple },
    { name: 'HOL Requested', value: customLabStats.holRequested, fill: CHART_COLORS.amber },
    { name: 'To Catalog', value: customLabStats.moveToCatalog, fill: CHART_COLORS.emerald },
  ]

  // Backlog bar chart data
  const backlogChartData = backlogStats.byRequestType.slice(0, 6).map((item, i) => ({
    name: item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
    count: item.count,
    fill: Object.values(CHART_COLORS)[i % Object.values(CHART_COLORS).length],
  }))

  return (
    <>
    {/* Premium Smooth Animations */}
    <style>{`
      @keyframes float {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(-10px) rotate(2deg); }
      }
      @keyframes float-delayed {
        0%, 100% { transform: translateY(0px) rotate(0deg); }
        50% { transform: translateY(10px) rotate(-2deg); }
      }
      @keyframes fade-in-up {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .animate-float { animation: float 8s ease-in-out infinite; }
      .animate-float-delayed { animation: float-delayed 10s ease-in-out infinite; }
      .animate-fade-in-up { animation: fade-in-up 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards; opacity: 0; }
      * { transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
    `}</style>
    <div className="space-y-10 animate-fade-in relative min-h-screen">
      {/* Professional Corporate Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }}></div>
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50/60 via-blue-50/30 to-gray-50/40 dark:from-slate-950/60 dark:via-blue-950/30 dark:to-gray-950/40"></div>
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-100/8 dark:bg-blue-800/5 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-slate-100/6 dark:bg-slate-800/4 rounded-full blur-2xl animate-float-delayed"></div>
      </div>

      {/* Professional Corporate Title Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 shadow-xl border border-slate-700">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/50 via-slate-950/30 to-indigo-950/50"></div>
        <div className="absolute -top-6 -right-6 w-32 h-32 bg-blue-800/10 rounded-full blur-2xl animate-float"></div>
        <div className="absolute -bottom-4 -left-4 w-24 h-24 bg-slate-800/10 rounded-full blur-xl animate-float-delayed"></div>
        <div className="relative z-10 p-10 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-6 lg:space-y-0">
            <div className="flex-1">
              <h1 className="text-4xl lg:text-5xl font-semibold text-white leading-tight tracking-tight">
                MS Innovation Catalogue Management Dashboard
              </h1>
            </div>
            <div className="flex flex-col items-end space-y-2 lg:min-w-0 lg:flex-shrink-0">
              <div className="flex items-center gap-2 text-slate-300 bg-white/10 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/20">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                <span className="text-sm font-medium">Last Updated</span>
              </div>
              <div className="text-slate-200 text-base font-mono bg-black/20 backdrop-blur-sm rounded-lg px-3 py-1.5 border border-white/10">
                {liveMetrics.lastUpdated
                  ? `${new Date(liveMetrics.lastUpdated).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })} • ${new Date(liveMetrics.lastUpdated).toLocaleTimeString('en-US', {
                      hour: '2-digit', minute: '2-digit'
                    })}`
                  : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top Metric Cards - 4-column */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 relative z-10">
        {/* Custom Lab Requests */}
        <div className="group transition-all duration-500 ease-out hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up cursor-pointer" style={{ animationDelay: '0.1s' }} onClick={() => navigate('/dashboard/custom-lab-request')}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-orange-50/40 dark:from-slate-800 dark:to-slate-700/50 border border-orange-200/50 dark:border-orange-800/30 p-6 shadow-lg hover:shadow-xl transition-all duration-500">
            <div className="absolute top-0 right-0 w-16 h-16 bg-orange-200/30 dark:bg-orange-700/20 rounded-full -translate-y-8 translate-x-8"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200/70 dark:from-orange-900/40 dark:to-orange-800/40 text-orange-700 dark:text-orange-300 shadow-sm">
                  <Beaker className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-orange-500 transition-colors" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{customLabStats.total}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Custom Lab Requests</p>
            </div>
          </div>
        </div>

        {/* Attended Users */}
        <div className="group transition-all duration-500 ease-out hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-indigo-50/40 dark:from-slate-800 dark:to-slate-700/50 border border-indigo-200/50 dark:border-indigo-800/30 p-6 shadow-lg hover:shadow-xl transition-all duration-500">
            <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-200/30 dark:bg-indigo-700/20 rounded-full -translate-y-8 translate-x-8"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200/70 dark:from-indigo-900/40 dark:to-indigo-800/40 text-indigo-700 dark:text-indigo-300 shadow-sm">
                  <Users className="h-5 w-5" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                <InlineMetric metricKey="dashboard.activeParticipants" value={liveMetrics.activeParticipants} />
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Attended Users</p>
            </div>
          </div>
        </div>

        {/* Practice Labs */}
        <div className="group transition-all duration-500 ease-out hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-emerald-50/40 dark:from-slate-800 dark:to-slate-700/50 border border-emerald-200/50 dark:border-emerald-800/30 p-6 shadow-lg hover:shadow-xl transition-all duration-500">
            <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-200/30 dark:bg-emerald-700/20 rounded-full -translate-y-8 translate-x-8"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200/70 dark:from-emerald-900/40 dark:to-emerald-800/40 text-emerald-700 dark:text-emerald-300 shadow-sm">
                  <BookOpen className="h-5 w-5" />
                </div>
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">
                <InlineMetric metricKey="dashboard.completedPracticeLabs" value={Number(liveMetrics.completedPracticeLabs)} />
              </p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Practice Labs</p>
            </div>
          </div>
        </div>

        {/* Roadmap Total */}
        <div className="group transition-all duration-500 ease-out hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up cursor-pointer" style={{ animationDelay: '0.25s' }} onClick={() => navigate('/dashboard/roadmap')}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-violet-50/40 dark:from-slate-800 dark:to-slate-700/50 border border-violet-200/50 dark:border-violet-800/30 p-6 shadow-lg hover:shadow-xl transition-all duration-500">
            <div className="absolute top-0 right-0 w-16 h-16 bg-violet-200/30 dark:bg-violet-700/20 rounded-full -translate-y-8 translate-x-8"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200/70 dark:from-violet-900/40 dark:to-violet-800/40 text-violet-700 dark:text-violet-300 shadow-sm">
                  <MapPin className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-violet-500 transition-colors" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{totalRoadmapItems}</p>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Roadmap Items</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid - 2 columns */}
      <div className="grid gap-8 lg:grid-cols-2 relative z-10">

        {/* Roadmap Phases - Pie Chart */}
        <Card className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-violet-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-violet-200/40 dark:border-violet-800/25 shadow-lg hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <CardHeader className="relative z-10 border-b border-violet-200/40 dark:border-violet-800/25 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200/70 dark:from-violet-900/40 dark:to-violet-800/40 text-violet-700 dark:text-violet-300 shadow-sm">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Lab Development Roadmap</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">{totalRoadmapItems} items across all phases</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 py-6">
            <div className="flex flex-col lg:flex-row items-center gap-6">
              {/* Pie Chart */}
              <div className="w-full lg:w-1/2 h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={roadmapChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                    >
                      {roadmapChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                      formatter={(value: number, name: string) => [`${value} items`, name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="w-full lg:w-1/2 grid grid-cols-2 gap-2">
                {roadmapChartData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/dashboard/roadmap?phase=${encodeURIComponent(item.name)}`)}
                  >
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }}></div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{item.name}</p>
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
              <Button variant="outline" size="sm" className="w-full justify-center gap-2" onClick={() => navigate('/dashboard/roadmap')}>
                <MapPin className="h-4 w-4" />
                View Full Roadmap
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Custom Lab Requests - Bar Chart */}
        <Card className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-orange-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-orange-200/40 dark:border-orange-800/25 shadow-lg hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ animationDelay: '0.35s' }}>
          <CardHeader className="relative z-10 border-b border-orange-200/40 dark:border-orange-800/25 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-orange-100 to-orange-200/70 dark:from-orange-900/40 dark:to-orange-800/40 text-orange-700 dark:text-orange-300 shadow-sm">
                <Beaker className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Custom Lab Requests</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">{customLabStats.total} total requests</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 py-6">
            {customLabStats.total > 0 ? (
              <>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={customLabChartData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} />
                      <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                      />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {customLabChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200/40 dark:border-blue-800/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400">One Time</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{customLabStats.oneTime}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200/40 dark:border-purple-800/30">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Recurring</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{customLabStats.recurring}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-slate-400">No custom lab requests found</div>
            )}
            <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
              <Button variant="outline" size="sm" className="w-full justify-center gap-2" onClick={() => navigate('/dashboard/custom-lab-request')}>
                <Beaker className="h-4 w-4" />
                View Custom Lab Requests
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Labs Backlog - Horizontal Bar */}
        <Card className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-cyan-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-cyan-200/40 dark:border-cyan-800/25 shadow-lg hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <CardHeader className="relative z-10 border-b border-cyan-200/40 dark:border-cyan-800/25 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-100 to-cyan-200/70 dark:from-cyan-900/40 dark:to-cyan-800/40 text-cyan-700 dark:text-cyan-300 shadow-sm">
                <ClipboardList className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Labs Backlog</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">{backlogStats.total} pending requests</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 py-6">
            {backlogStats.total > 0 ? (
              <>
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={backlogChartData} layout="vertical" margin={{ top: 5, right: 20, left: 5, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: '#94a3b8' }} allowDecimals={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#94a3b8' }} width={100} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px' }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {backlogChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4">
                  {backlogStats.byRequestType.slice(0, 3).map((item, i) => (
                    <div key={item.name} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/40 dark:border-slate-700/40 text-center">
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{item.name}</p>
                      <p className="text-lg font-bold text-slate-900 dark:text-white">{item.count}</p>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-12 text-slate-400">No backlog items found</div>
            )}
            <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
              <Button variant="outline" size="sm" className="w-full justify-center gap-2" onClick={() => navigate('/dashboard/labs-backlog')}>
                <ClipboardList className="h-4 w-4" />
                View Full Backlog
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Localized Tracks */}
        <Card onClick={() => navigate('/dashboard/localized-tracks')} className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-emerald-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-emerald-200/40 dark:border-emerald-800/25 shadow-lg hover:shadow-xl transition-all duration-500 cursor-pointer animate-fade-in-up" style={{ animationDelay: '0.45s' }}>
          <CardHeader className="relative z-10 border-b border-emerald-200/40 dark:border-emerald-800/25 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200/70 dark:from-emerald-900/40 dark:to-emerald-800/40 text-emerald-700 dark:text-emerald-300 shadow-sm">
                <Globe className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Localized Tracks</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">
                  Total {localizedCounts.total}
                  {localizedCounts.byLanguage.length > 0 && (
                    <> ({localizedCounts.byLanguage.map((l, i) => (
                      <span key={l.name}>{l.name} {l.count}{i < localizedCounts.byLanguage.length - 1 ? ', ' : ''}</span>
                    ))})</>
                  )}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 py-6">
            {localizedProgress.slice(0, 3).map((t, idx) => (
              <div key={idx} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300">
                <div className="text-sm font-medium mb-3 text-slate-900 dark:text-white truncate">{t.title}</div>
                <div className="space-y-2.5">
                  {t.languages.map((l, i) => {
                    const color = l.percent >= 100 ? 'bg-emerald-500' : l.percent >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                    return (
                      <div key={i} className="space-y-1.5">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-600 dark:text-slate-400 font-medium">{l.name}</span>
                          <span className="font-semibold text-slate-900 dark:text-white">{l.percent}%</span>
                        </div>
                        <div className="relative bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${l.percent}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
            {localizedProgress.length === 0 && (
              <div className="flex items-center justify-center py-8 text-slate-400">No localized tracks found</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row - Trending Topics + Admin Center Quick Access */}
      <div className="grid gap-8 lg:grid-cols-2 relative z-10">
        {/* Trending Topics */}
        <Card className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-amber-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-amber-200/40 dark:border-amber-800/25 shadow-lg hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
          <CardHeader className="relative z-10 border-b border-amber-200/40 dark:border-amber-800/25">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200/70 dark:from-amber-900/40 dark:to-amber-800/40 text-amber-700 dark:text-amber-300 shadow-sm">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Trending Topics</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">Hot tech topics for labs</p>
                </div>
              </div>
              {userRole === 'admin' && (
                <Button size="sm" variant="outline" className="hover:bg-amber-100 dark:hover:bg-amber-900/30" onClick={() => setIsTrendingDialogOpen(true)}>
                  <Edit className="h-4 w-4" />
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 relative z-10 py-6">
            {trendingTopics.slice(0, 5).map((item, index) => (
              <div key={`${item.topic}-${index}`} className="flex items-center justify-between p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{item.topic}</span>
                    {item.deliveryCount && (
                      <span className="text-xs bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">
                        {item.deliveryCount} labs
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{item.description}</p>
                </div>
                {userRole === 'admin' && (
                  <Button type="button" size="icon" variant="outline" className="h-7 w-7 ml-2 flex-shrink-0" onClick={() => handleRemoveTrending(index)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Admin Center Quick Access */}
        <Card className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-rose-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-rose-200/40 dark:border-rose-800/25 shadow-lg hover:shadow-xl transition-all duration-500 animate-fade-in-up" style={{ animationDelay: '0.55s' }}>
          <CardHeader className="relative z-10 border-b border-rose-200/40 dark:border-rose-800/25">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-rose-100 to-rose-200/70 dark:from-rose-900/40 dark:to-rose-800/40 text-rose-700 dark:text-rose-300 shadow-sm">
                <ExternalLink className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Admin Center</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">Catalog & Trending reports moved to Admin Center</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10 py-6 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Catalog Health and Trending Tracks reports are now available in the <strong className="text-slate-900 dark:text-white">CloudEvents Admin Center</strong>. 
              Sign in with your work account and access <strong className="text-slate-900 dark:text-white">Catalog Mgmt Report</strong> under Reports.
            </p>
            <div className="grid grid-cols-1 gap-3">
              <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200/50 dark:border-blue-800/30 hover:shadow-md transition-all duration-300 group/link">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/40">
                    <Heart className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Catalog Health Report</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Track statuses, testing dates & release notes</p>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover/link:text-blue-500 transition-colors" />
              </a>
              <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between p-4 rounded-lg bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border border-purple-200/50 dark:border-purple-800/30 hover:shadow-md transition-all duration-300 group/link">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/40">
                    <TrendingUp className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Trending Tracks Report</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Testing status, release notes & validation</p>
                  </div>
                </div>
                <ExternalLink className="h-4 w-4 text-slate-400 group-hover/link:text-purple-500 transition-colors" />
              </a>
            </div>
            <Button className="w-full gap-2" asChild>
              <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer">
                Open Admin Center
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>

    {/* Admin-only: Add Trending Topic dialog */}
    {userRole === 'admin' && (
      <EntityEditDialog
        open={isTrendingDialogOpen}
        onOpenChange={(v) => { setIsTrendingDialogOpen(v) }}
        title={'Add Trending Topic'}
        saving={false}
        onSave={async () => {
          const title = String(newTrendingTitle || '').trim()
          const desc = String(newTrendingDesc || '').trim()
          if (!title || title.length < 3) throw new Error('Topic title is required (min 3 chars)')
          setTrendingTopics(prev => {
            const next = [{ topic: title, description: desc }, ...prev].slice(0, 6)
            try { localStorage.setItem('dashboard.trendingTopics', JSON.stringify(next)) } catch {}
            return next
          })
          setNewTrendingTitle('')
          setNewTrendingDesc('')
        }}
      >
        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right">Topic</label>
            <Input className="col-span-3" value={newTrendingTitle} onChange={(e) => setNewTrendingTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label className="text-right">Description</label>
            <Input className="col-span-3" value={newTrendingDesc} onChange={(e) => setNewTrendingDesc(e.target.value)} />
          </div>
        </div>
      </EntityEditDialog>
    )}
    </>
  )
}

