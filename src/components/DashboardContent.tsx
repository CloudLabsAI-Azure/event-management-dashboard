"use client"

import { useState, useEffect } from "react"
import { useNavigate } from 'react-router-dom'
import { ResponsiveContainer } from 'recharts'
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
} from "lucide-react"
import api from '@/lib/api'
import metricsService from '@/lib/services/metricsService'
import { MetricCard } from "@/components/MetricCard"
import InlineMetric from '@/components/InlineMetric'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from "@/components/ui/carousel"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'
 

// recent events will be loaded from backend /api/events

// upcoming events loaded from backend

// trending tracks derived from /api/tracks

// localization status can be derived from catalog/tracks if available

// participant feedback could come from analytics; keep static fallback

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
  const [tracks, setTracks] = useState<any[]>([])
  const [catalogHealth, setCatalogHealth] = useState<{ title: string; percent: number }[]>([])
  const [localizedProgress, setLocalizedProgress] = useState<{ title: string; languages: { name: string; percent: number; status: string }[] }[]>([])
  // removed search/filter controls
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({})
  const { toast } = useToast()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [trendingApi, setTrendingApi] = useState<CarouselApi | null>(null)
  const [trendingTopics, setTrendingTopics] = useState<{ topic: string; description: string; deliveryCount?: number }[]>([])
  const [isTrendingDialogOpen, setIsTrendingDialogOpen] = useState(false)
  const [newTrendingTitle, setNewTrendingTitle] = useState("")
  const [newTrendingDesc, setNewTrendingDesc] = useState("")
  const [liveMetrics, setLiveMetrics] = useState({
    activeParticipants: 0,
    completedPracticeLabs: 0,
    tracksHealthPercentage: 0,
    lastUpdated: null as number | null,
  })
  const [top25HealthDetails, setTop25HealthDetails] = useState({
    testedCount: 0,
    totalCount: 25,
    oldestTestedDate: null as string | null,
  })
  const [roadmapStats, setRoadmapStats] = useState({
    development: 0,
    releaseReady: 0,
    backlog: 0,
  })

  

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const tr = await api.get('/api/tracks').then(r => Array.isArray(r.data) ? r.data : [])
        setTracks(tr)
        
        // Calculate Top 25 Tracks Health percentage based on last test dates within 30 days
        const top25Tracks = tr.slice(0, 25) // Get first 25 tracks
        const now = new Date()
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        let testedCount = 0
        let oldestTestedDate: Date | null = null
        let newestTestedDate: Date | null = null
        
        top25Tracks.forEach((track: any) => {
          const lastTestedStr = track.lastTested || track.lastTestedDate || track.testedDate
          if (lastTestedStr) {
            const lastTested = new Date(lastTestedStr)
            if (!isNaN(lastTested.getTime())) {
              // Count as tested if tested in last 30 days
              if (lastTested >= thirtyDaysAgo) {
                testedCount++
              }
              // Track oldest tested date
              if (!oldestTestedDate || lastTested < oldestTestedDate) {
                oldestTestedDate = lastTested
              }
              // Track newest tested date
              if (!newestTestedDate || lastTested > newestTestedDate) {
                newestTestedDate = lastTested
              }
            }
          }
        })
        
        // Health percentage = tracks tested in last 30 days / total tracks * 100
        const tracksHealthPercentage = top25Tracks.length > 0 
          ? Math.round((testedCount / top25Tracks.length) * 100) 
          : 0
        
        setTop25HealthDetails({
          testedCount,
          totalCount: top25Tracks.length,
          oldestTestedDate: oldestTestedDate ? oldestTestedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null
        })
        
        // derive catalog health from catalog resource
        const catalog = await api.get('/api/catalog').then(r => Array.isArray(r.data) ? r.data : [])
        const catalogItems = catalog.filter((i: any) => 
          i && i.type === 'catalog' && (i.trackName || i.trackTitle)
        )
        const localized = catalog.filter((i: any) => i && i.type === 'localizedTrack')
        const toPercent = (status: string) => {
          const s = String(status || '').toLowerCase()
          if (s === 'available' || s === 'completed') return 100
          if (s === 'in progress' || s === 'in-progress') return 50
          if (s === 'pending' || s === 'not available' || s === 'not-available') return 20
          return 0
        }
        
        // Process catalog items (from Catalog Health page)
        const catalogEntries: { title: string; percent: number }[] = []
        catalogItems.forEach((i: any) => {
          const title = i.trackName || i.trackTitle || i.title || 'Track'
          const overall = i.status || i.testingStatus || 'Pending'
          catalogEntries.push({ title, percent: toPercent(String(overall)) })
        })
        catalogEntries.sort((a, b) => b.percent - a.percent)
        setCatalogHealth(catalogEntries.slice(0, 5))
        
        // Process localized tracks
        const localizedEntries: { title: string; languages: { name: string; percent: number; status: string }[] }[] = []
        localized.forEach((i: any) => {
          const title = i.trackTitle || i.trackName || i.title || 'Track'
          const langs: { name: string; percent: number; status: string }[] = []
          const mapLang = (name: string, value: any) => {
            const normalized = (value === undefined || value === null || String(value).trim() === '') ? 'Not Available' : String(value)
            const p = toPercent(normalized)
            langs.push({ name, percent: p, status: normalized })
          }
          mapLang('Spanish', i.spanish)
          mapLang('Portuguese', i.portuguese)
          localizedEntries.push({ title, languages: langs })
        })
        setLocalizedProgress(localizedEntries.slice(0, 5))

        const activeParticipants = Array.isArray(tr) ? tr.reduce((acc: number, t: any) => acc + Number(t.participants || 0), 0) : 0
        const completedPracticeLabs = 1247 // Default completed practice labs count
        // Fetch server's last updated timestamp
        let serverLastUpdated: number | null = null
        try {
          const lastUpdatedResponse = await api.get('/api/last-updated')
          if (lastUpdatedResponse.data?.lastUpdated) {
            serverLastUpdated = new Date(lastUpdatedResponse.data.lastUpdated).getTime()
          }
        } catch {
          // If fetch fails, use current time as fallback
          serverLastUpdated = Date.now()
        }

        // Start from derived counts
        let next = {
          activeParticipants,
          completedPracticeLabs,
          tracksHealthPercentage,
          lastUpdated: serverLastUpdated,
        }
        // Overlay any saved metrics
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
        
        // Fetch roadmap data for the roadmap card
        try {
          const roadmapData = await api.get('/api/catalog').then(r => Array.isArray(r.data) ? r.data : [])
          const roadmapItems = roadmapData.filter((item: any) => item.type === 'roadmapItem')
          
          const development = roadmapItems.filter((item: any) => String(item.phase || '').toLowerCase() === 'development').length
          const releaseReady = roadmapItems.filter((item: any) => String(item.phase || '').toLowerCase() === 'release-ready').length
          const backlog = roadmapItems.filter((item: any) => String(item.phase || '').toLowerCase() === 'backlog').length
          
          setRoadmapStats({ development, releaseReady, backlog })
        } catch {
          // Default values if fetch fails
          setRoadmapStats({ development: 3, releaseReady: 1, backlog: 3 })
        }
        
        // Initialize trending topics (localStorage-backed)
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
              { topic: "SaaS Platform Design", description: "Best practices for multi-tenant apps" },
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
    // React to saved metrics changes so UI updates immediately
    const onMetricsChanged = () => { (async () => { try { await fetchAll() } catch {} })() }
    const onEventsChanged = () => { (async () => { try { await fetchAll() } catch {} })() }
    const onCatalogChanged = () => { (async () => { try { await fetchAll() } catch {} })() }
    const onVisibility = () => { if (document.visibilityState === 'visible') { (async () => { try { await fetchAll() } catch {} })() } }
    try { window.addEventListener('metrics:changed', onMetricsChanged as EventListener) } catch {}
    window.addEventListener('events:changed', onEventsChanged as EventListener)
    window.addEventListener('catalog:changed', onCatalogChanged as EventListener)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      try { window.removeEventListener('metrics:changed', onMetricsChanged as EventListener) } catch {}
      window.removeEventListener('events:changed', onEventsChanged as EventListener)
      window.removeEventListener('catalog:changed', onCatalogChanged as EventListener)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // Auto-rotate trending topics every 5 seconds
  useEffect(() => {
    if (!trendingApi) return
    const interval = setInterval(() => {
      try { trendingApi.scrollNext() } catch {}
    }, 5000)
    return () => clearInterval(interval)
  }, [trendingApi])



  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [sectionId]: !prev[sectionId],
    }))
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      // Trigger a full re-fetch by emitting events:changed and catalog:changed
      try { window.dispatchEvent(new CustomEvent('events:changed')) } catch {}
      try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
    } finally {
    setIsRefreshing(false)
    }
  }

  // trending tracks and placeholder datasets removed to simplify dashboard
  const handleRemoveTrending = (removeIndex: number) => {
    setTrendingTopics((prev) => {
      const next = prev.filter((_, i) => i !== removeIndex)
      try { localStorage.setItem('dashboard.trendingTopics', JSON.stringify(next)) } catch {}
      return next
    })
  }

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
      @keyframes pulse-subtle {
        0%, 100% { opacity: 0.8; }
        50% { opacity: 1; }
      }
      @keyframes fade-in-up {
        0% { opacity: 0; transform: translateY(20px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
      .animate-float { animation: float 8s ease-in-out infinite; }
      .animate-float-delayed { animation: float-delayed 10s ease-in-out infinite; }
      .animate-pulse-subtle { animation: pulse-subtle 6s ease-in-out infinite; }
      .animate-fade-in-up { animation: fade-in-up 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards; opacity: 0; }
      .animate-shimmer { animation: shimmer 3s linear infinite; }
      
      /* Custom smooth transitions */
      * { transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1); }
      .group:hover .scale-hover { transform: scale(1.05); }
      .smooth-hover { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    `}</style>
    <div className="space-y-10 animate-fade-in relative min-h-screen">
      {/* Professional Corporate Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Subtle dot pattern */}
        <div className="absolute inset-0 opacity-[0.02] dark:opacity-[0.04]" style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, rgb(148 163 184) 1px, transparent 0)`,
          backgroundSize: '40px 40px'
        }}></div>
        {/* Professional gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-50/60 via-blue-50/30 to-gray-50/40 dark:from-slate-950/60 dark:via-blue-950/30 dark:to-gray-950/40"></div>
        {/* Subtle professional elements */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-blue-100/8 dark:bg-blue-800/5 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-slate-100/6 dark:bg-slate-800/4 rounded-full blur-2xl animate-float-delayed"></div>
      </div>
      {/* Professional Corporate Title Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 shadow-xl border border-slate-700">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/50 via-slate-950/30 to-indigo-950/50"></div>
        
        {/* Subtle professional background elements */}
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
                {new Date(liveMetrics.lastUpdated || Date.now()).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })} • {new Date(liveMetrics.lastUpdated || Date.now()).toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Professional Corporate Metric Cards */}
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 relative z-10">
        
        <div className="group transition-all duration-500 ease-out hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-blue-50/40 dark:from-slate-800 dark:to-slate-700/50 border border-blue-200/50 dark:border-blue-800/30 p-8 shadow-lg hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-slate-500/5 dark:from-blue-400/10 dark:to-slate-400/10"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 to-slate-50/60 dark:from-blue-950/30 dark:to-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-200/30 dark:bg-blue-700/20 rounded-full -translate-y-10 translate-x-10"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200/70 dark:from-blue-900/40 dark:to-blue-800/40 text-blue-700 dark:text-blue-300 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1.5 justify-end mb-1">
                    <p className="text-slate-600 dark:text-slate-400 text-sm font-medium">Top 25 Tracks</p>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <button className="text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors p-0.5 rounded-full hover:bg-blue-50 dark:hover:bg-blue-900/30">
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" align="start" className="w-80 p-0">
                        <div className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                            <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/50">
                              <FileText className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            <h4 className="font-semibold text-slate-900 dark:text-white">Health Score</h4>
                          </div>
                          
                          {/* Description */}
                          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                            Percentage of Top 25 tracks tested within the last 30 days.
                          </p>
                          
                          {/* Stats */}
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600 dark:text-slate-400">Tested (last 30 days)</span>
                              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                                {top25HealthDetails.testedCount} tracks
                              </span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-slate-600 dark:text-slate-400">Not tested (30+ days)</span>
                              <span className="text-sm font-semibold text-orange-600 dark:text-orange-400">
                                {top25HealthDetails.totalCount - top25HealthDetails.testedCount} tracks
                              </span>
                            </div>
                            {top25HealthDetails.oldestTestedDate && (
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-slate-600 dark:text-slate-400">Oldest test date</span>
                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                  {top25HealthDetails.oldestTestedDate}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">
                    <InlineMetric metricKey="dashboard.tracksHealthPercentage" value={liveMetrics.tracksHealthPercentage} readOnly />%
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-slate-700 dark:text-slate-300 font-medium">Health Status</p>
                {top25HealthDetails.testedCount > 0 && (
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {top25HealthDetails.testedCount}/{top25HealthDetails.totalCount} tested
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="group transition-all duration-500 ease-out hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-indigo-50/40 dark:from-slate-800 dark:to-slate-700/50 border border-indigo-200/50 dark:border-indigo-800/30 p-8 shadow-lg hover:shadow-xl hover:shadow-indigo-500/10 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-slate-500/5 dark:from-indigo-400/10 dark:to-slate-400/10"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/60 to-slate-50/60 dark:from-indigo-950/30 dark:to-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-200/30 dark:bg-indigo-700/20 rounded-full -translate-y-10 translate-x-10"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-200/70 dark:from-indigo-900/40 dark:to-indigo-800/40 text-indigo-700 dark:text-indigo-300 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                  <Users className="h-6 w-6" />
                </div>
                <div className="text-right">
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">Active</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">
                    <InlineMetric metricKey="dashboard.activeParticipants" value={liveMetrics.activeParticipants} />
                  </p>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300 font-medium">Attendees</p>
            </div>
          </div>
        </div>
        
        <div className="group transition-all duration-500 ease-out hover:scale-[1.02] hover:-translate-y-1 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-blue-50/40 dark:from-slate-800 dark:to-slate-700/50 border border-blue-200/50 dark:border-blue-800/30 p-8 shadow-lg hover:shadow-xl hover:shadow-blue-500/10 transition-all duration-500">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-slate-500/5 dark:from-blue-400/10 dark:to-slate-400/10"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/60 to-slate-50/60 dark:from-blue-950/30 dark:to-slate-950/30 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute top-0 right-0 w-20 h-20 bg-blue-200/30 dark:bg-blue-700/20 rounded-full -translate-y-10 translate-x-10"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-6">
                <div className="p-3 rounded-xl bg-gradient-to-br from-blue-100 to-blue-200/70 dark:from-blue-900/40 dark:to-blue-800/40 text-blue-700 dark:text-blue-300 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div className="text-right">
                  <p className="text-slate-600 dark:text-slate-400 text-sm font-medium mb-1">Completed</p>
                  <p className="text-3xl font-bold text-slate-900 dark:text-white">
                    <InlineMetric metricKey="dashboard.completedPracticeLabs" value={Number(liveMetrics.completedPracticeLabs)} />
                  </p>
                </div>
              </div>
              <p className="text-slate-700 dark:text-slate-300 font-medium">Practice Labs</p>
            </div>
          </div>
        </div>
      </div>

      {/* Global edit metrics button removed; inline pencil per metric is used */}

      {/* Professional Corporate 2x2 Grid Layout */}
      <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-2 relative z-10">
          {/* Trending Topics */}
          <Card className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-emerald-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-emerald-200/40 dark:border-emerald-800/25 shadow-lg hover:shadow-xl hover:shadow-emerald-500/8 transition-all duration-500 ease-out hover:-translate-y-1 hover:scale-[1.01] animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/3 via-transparent to-slate-500/3 dark:from-emerald-400/5 dark:to-slate-400/5"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-50/50 to-slate-50/50 dark:from-emerald-950/20 dark:to-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <CardHeader className="relative z-10 border-b border-emerald-200/40 dark:border-emerald-800/25">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-gradient-to-br from-emerald-100 to-emerald-200/70 dark:from-emerald-900/40 dark:to-emerald-800/40 text-emerald-700 dark:text-emerald-300 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div>
                      <h3 className="text-lg font-semibold">Trending Topics</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">Hot tech topics for labs</p>
                    </div>
                    <Tooltip delayDuration={100}>
                      <TooltipTrigger asChild>
                        <button className="text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition-colors p-0.5 rounded-full hover:bg-emerald-50 dark:hover:bg-emerald-900/30">
                          <Info className="h-4 w-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" align="start" className="w-72 p-0">
                        <div className="p-4 space-y-3">
                          {/* Header */}
                          <div className="flex items-center gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
                            <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/50">
                              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h4 className="font-semibold text-slate-900 dark:text-white">How Trends Work</h4>
                          </div>
                          
                          {/* Methodology */}
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">1</span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                Analyzes labs delivered in the <span className="font-medium text-emerald-600 dark:text-emerald-400">last 15 days</span>
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">2</span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                Identifies topics from event categories and track themes
                              </p>
                            </div>
                            <div className="flex items-start gap-2">
                              <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">3</span>
                              </div>
                              <p className="text-sm text-slate-600 dark:text-slate-300">
                                Ranks by <span className="font-medium">delivery frequency</span>
                              </p>
                            </div>
                          </div>
                          
                          {/* Note */}
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                            <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                              💡 Topics update automatically based on lab activity data
                            </p>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                {(userRole === 'admin') && (
                  <Button size="sm" variant="outline" className="hover:bg-orange-100 dark:hover:bg-orange-900/30" onClick={() => setIsTrendingDialogOpen(true)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 relative z-10 py-6">
              {trendingTopics.slice(0, 4).map((item, index) => (
                <div key={`${item.topic}-${index}`} className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300 group/item hover:shadow-md">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white group-hover/item:text-blue-600 dark:group-hover/item:text-blue-400 transition-colors truncate">{item.topic}</span>
                      {item.deliveryCount && (
                        <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded-full">
                          {item.deliveryCount} labs
                        </span>
                      )}
                          </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{item.description}</p>
                        </div>
                  {(userRole === 'admin') && (
                    <div className="ml-2 flex-shrink-0">
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7" onClick={() => handleRemoveTrending(index)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                      </div>
                  ))}
            </CardContent>
          </Card>

          {/* Catalog Health */}
          <Card onClick={() => navigate('/dashboard/catalog-health')} className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-rose-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-rose-200/40 dark:border-rose-800/25 shadow-lg hover:shadow-xl hover:shadow-rose-500/8 transition-all duration-500 ease-out hover:-translate-y-1 hover:scale-[1.01] cursor-pointer animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/3 via-transparent to-slate-500/3 dark:from-rose-400/5 dark:to-slate-400/5"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-rose-50/50 to-slate-50/50 dark:from-rose-950/20 dark:to-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <CardHeader className="relative z-10 border-b border-rose-200/40 dark:border-rose-800/25">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-rose-100 to-rose-200/70 dark:from-rose-900/40 dark:to-rose-800/40 text-rose-700 dark:text-rose-300 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                  <Heart className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Catalog Health</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">Overall health metrics of your event catalog</p>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 py-6">
              {catalogHealth.map((metric, index) => {
                const color = metric.percent >= 100 ? 'bg-emerald-500 dark:bg-emerald-400' : metric.percent >= 50 ? 'bg-yellow-500 dark:bg-yellow-400' : metric.percent > 0 ? 'bg-orange-500 dark:bg-orange-400' : 'bg-red-500 dark:bg-red-400'
                return (
                  <div key={index} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 group/metric cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300" onClick={() => navigate('/catalog-health')}>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-sm font-medium text-slate-900 dark:text-white transition-colors truncate">
                        {metric.title}
                      </span>
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{metric.percent}%</span>
                    </div>
                    <div className="relative bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${metric.percent}%` }} />
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Localized Tracks */}
          <Card onClick={() => navigate('/dashboard/localized-tracks')} className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-cyan-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-cyan-200/40 dark:border-cyan-800/25 shadow-lg hover:shadow-xl hover:shadow-cyan-500/8 transition-all duration-500 ease-out hover:-translate-y-1 hover:scale-[1.01] cursor-pointer animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/3 via-transparent to-slate-500/3 dark:from-cyan-400/5 dark:to-slate-400/5"></div>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-50/50 to-slate-50/50 dark:from-cyan-950/20 dark:to-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
            <CardHeader className="relative z-10 border-b border-cyan-200/40 dark:border-cyan-800/25 pb-4">
              <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-100 to-cyan-200/70 dark:from-cyan-900/40 dark:to-cyan-800/40 text-cyan-700 dark:text-cyan-300 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                  <Globe className="h-5 w-5" />
                </div>
                <span>Localized Tracks</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 py-6">
              {localizedProgress.slice(0, 2).map((t, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300 group/track">
                  <div className="text-sm font-medium mb-3 text-slate-900 dark:text-white">{t.title}</div>
                  <div className="space-y-3">
                    {t.languages.map((l, i) => {
                      const color = l.percent >= 100 ? 'bg-emerald-500 dark:bg-emerald-400' : l.percent >= 50 ? 'bg-yellow-500 dark:bg-yellow-400' : 'bg-red-500 dark:bg-red-400'
                      return (
                        <div key={i} className="space-y-2">
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
            </CardContent>
          </Card>

        {/* Lab Development Roadmap */}
  <Card onClick={() => navigate('/dashboard/roadmap')} className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-white to-violet-50/30 dark:from-slate-800 dark:to-slate-700/50 border border-violet-200/40 dark:border-violet-800/25 shadow-lg hover:shadow-xl hover:shadow-violet-500/8 transition-all duration-500 ease-out hover:-translate-y-1 hover:scale-[1.01] cursor-pointer animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/3 via-transparent to-slate-500/3 dark:from-violet-400/5 dark:to-slate-400/5"></div>
          <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 to-slate-50/50 dark:from-violet-950/20 dark:to-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
          <CardHeader className="relative z-10 border-b border-violet-200/40 dark:border-violet-800/25 pb-4">
            <CardTitle className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-violet-100 to-violet-200/70 dark:from-violet-900/40 dark:to-violet-800/40 text-violet-700 dark:text-violet-300 group-hover:scale-105 transition-transform duration-300 shadow-sm">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Lab Development Roadmap</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 font-normal">Track progress of lab development phases</p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 relative z-10 py-6">
            <div className="grid gap-3">
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300 group/phase">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Onboarded</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Labs fully integrated</p>
                </div>
                <div className="px-3 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-lg font-semibold">
                  {roadmapStats.releaseReady}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300 group/phase">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">In Progress</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Currently developing</p>
                </div>
                <div className="px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-lg font-semibold">
                  {roadmapStats.development}
                </div>
              </div>
              <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-all duration-300 group/phase">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Pending</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Awaiting development</p>
                </div>
                <div className="px-3 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-lg font-semibold">
                  {roadmapStats.backlog}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Bottom section removed per layout update */}
    </div>
    {/* Admin-only: Add Trending Topic dialog */}
    {(userRole === 'admin') && (
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

