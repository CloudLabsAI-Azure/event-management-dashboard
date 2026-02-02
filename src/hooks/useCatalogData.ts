import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'

export interface CatalogItemBase {
  id?: string
  sr: number
  type?: string
  eventId?: string
  trackName?: string
  trackTitle?: string
  eventDate?: string | null
  sessionDate?: string | null
  status?: string
  notes?: string
  notesETA?: string
  lastTestDate?: string | null
  releaseNotesUrl?: string
}

export interface UseCatalogDataOptions {
  /** Filter by specific types. If empty, returns all items */
  types?: string[]
  /** Auto-reload data on mount */
  autoLoad?: boolean
  /** Filter callback for custom filtering */
  filterFn?: (item: CatalogItemBase) => boolean
  /** Transform callback for mapping items */
  transformFn?: (item: any) => CatalogItemBase
}

export interface UseCatalogDataResult<T = CatalogItemBase> {
  data: T[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

/**
 * Shared hook for loading catalog data with filtering and transformation
 */
export function useCatalogData<T = CatalogItemBase>(
  options: UseCatalogDataOptions = {}
): UseCatalogDataResult<T> {
  const { types, autoLoad = true, filterFn, transformFn } = options
  
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    try {
      const res = await api.get('/api/catalog')
      let items = Array.isArray(res.data) ? res.data : []
      
      // Filter by types if specified
      if (types && types.length > 0) {
        items = items.filter((item: any) => types.includes(item.type))
      }
      
      // Apply custom filter if provided
      if (filterFn) {
        items = items.filter(filterFn)
      }
      
      // Apply transformation if provided
      if (transformFn) {
        items = items.map(transformFn)
      }
      
      setData(items as T[])
    } catch (err: any) {
      console.error('Error loading catalog data:', err)
      setError(err.message || 'Failed to load data')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [types, filterFn, transformFn])

  useEffect(() => {
    if (autoLoad) {
      reload()
    }
  }, [autoLoad, reload])

  // Listen for catalog changes
  useEffect(() => {
    const handleChange = () => {
      reload()
    }
    
    window.addEventListener('catalog:changed', handleChange)
    return () => window.removeEventListener('catalog:changed', handleChange)
  }, [reload])

  return { data, loading, error, reload }
}

/**
 * Hook specifically for TTT sessions
 */
export function useTTTSessions() {
  return useCatalogData({
    types: ['tttSession'],
    transformFn: (item) => ({
      id: String(item.id || item._id || ''),
      sr: Number(item.sr || 0),
      type: 'tttSession',
      eventId: String(item.eventId || ''),
      trackName: item.trackName || item.courseName || '',
      sessionDate: item.sessionDate || null,
      status: item.status || 'Scheduled',
      notes: item.notes || ''
    })
  })
}

/**
 * Hook specifically for roadmap items
 */
export function useRoadmapItems() {
  return useCatalogData({
    types: ['roadmapItem'],
    transformFn: (item) => ({
      id: String(item.id || item._id || ''),
      sr: Number(item.sr || 0),
      type: 'roadmapItem',
      eventId: String(item.eventId || ''),
      trackTitle: item.trackTitle || '',
      phase: item.phase || '',
      eta: item.eta || '',
      programType: item.programType || '',
      approvalDate: item.approvalDate || null,
      notes: item.notes || '',
      activityLog: item.activityLog || [],
      isUpgrade: item.isUpgrade || false
    })
  })
}

/**
 * Hook specifically for custom lab requests
 */
export function useCustomLabRequests() {
  return useCatalogData({
    types: ['customLabRequest'],
    transformFn: (item) => ({
      id: String(item.id || item._id || ''),
      sr: Number(item.sr || 0),
      type: 'customLabRequest',
      eventId: String(item.eventId || ''),
      trackTitle: item.trackTitle || '',
      eventDate: item.eventDate || null,
      status: item.status || 'Pending',
      sponsorDetails: item.sponsorDetails || '',
      notes: item.notes || ''
    })
  })
}

export default useCatalogData
