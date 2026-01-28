import { DashboardLayout } from "@/components/DashboardLayout"
import { useAuth } from '@/components/AuthProvider'
import { useState, useEffect, useCallback } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Plus, X, ChevronLeft, ChevronRight, Trash2, Eye, Filter, Download, Loader2, Search, ArrowUpDown } from "lucide-react"
import { FileUploadModal } from "@/components/FileUploadModal"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import api from "@/lib/api"

// Helper to get API base URL for image paths
const getApiBase = () => {
  if (import.meta.env.VITE_API_BASE) return import.meta.env.VITE_API_BASE
  if (import.meta.env.PROD) return ''
  return 'http://localhost:4000'
}

// Simplified: upload-only screen for feedback screenshots

export default function ParticipantFeedbackPage() {
  const { userRole: role } = useAuth()
  const [items, setItems] = useState<any[]>([])
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number>(0)
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<number | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterEvent, setFilterEvent] = useState<string>('all')
  const [availableEvents, setAvailableEvents] = useState<string[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'>('date-desc')
  const itemsPerPage = 12

  // Helper to get full image URL
  const getImageUrl = (path: string) => {
    if (!path) return ''
    // If path already has http/https, return as-is (blob storage URLs)
    if (path.startsWith('http')) return path
    // Otherwise prepend API base URL
    const base = getApiBase()
    return base ? `${base}${path}` : path
  }

  // Filter only image items and deduplicate by path
  const allImageItems = items
    .filter(item => String(item.mime || '').startsWith('image/'))
    .reduce((acc: any[], item) => {
      // Deduplicate by path to avoid showing same image multiple times
      if (!acc.find(i => i.path === item.path)) {
        acc.push(item)
      }
      return acc
    }, [])
  
  // Apply event filter and search
  const filteredImageItems = allImageItems.filter(item => {
    // Event filter
    if (filterEvent !== 'all' && item.eventName !== filterEvent) return false
    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      const eventName = (item.eventName || '').toLowerCase()
      const eventId = (item.eventId || '').toLowerCase()
      const title = (item.workItemTitle || '').toLowerCase()
      if (!eventName.includes(query) && !eventId.includes(query) && !title.includes(query)) {
        return false
      }
    }
    return true
  })
  
  // Group images by work item for DevOps items, keep others as individual
  const groupedItems = (() => {
    const groups: { [key: string]: any[] } = {}
    const nonDevOps: any[] = []
    
    filteredImageItems.forEach(item => {
      if (item.source === 'devops' && item.workItemId) {
        const key = `wi-${item.workItemId}`
        if (!groups[key]) groups[key] = []
        groups[key].push(item)
      } else {
        nonDevOps.push(item)
      }
    })
    
    // Convert groups to display items (one per work item)
    const groupedDevOps = Object.entries(groups).map(([key, images]) => {
      // Sort images by imageIndex within the group
      const sortedImages = [...images].sort((a, b) => (a.imageIndex || 0) - (b.imageIndex || 0))
      return {
        ...sortedImages[0], // Use first image's data
        _groupKey: key,
        _allImages: sortedImages,
        _imageCount: sortedImages.length
      }
    })
    
    // Combine and sort based on sortBy setting
    const combined = [...groupedDevOps, ...nonDevOps]
    return combined.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return (a.uploadedAt || 0) - (b.uploadedAt || 0)
        case 'name-asc':
          return (a.eventName || '').localeCompare(b.eventName || '')
        case 'name-desc':
          return (b.eventName || '').localeCompare(a.eventName || '')
        case 'date-desc':
        default:
          return (b.uploadedAt || 0) - (a.uploadedAt || 0)
      }
    })
  })()
  
  // Pagination on grouped items
  const totalPages = Math.ceil(groupedItems.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const displayItems = groupedItems.slice(startIndex, endIndex)

  // Load reviews data
  const loadReviews = async () => {
    try {
      const res = await api.get('/api/data')
      const data = res.data || {}
      const reviews = Array.isArray(data.reviews) ? data.reviews : []
      setItems(reviews)
      
      // Extract unique event names for filter
      const events = [...new Set(reviews
        .filter((item: any) => String(item.mime || '').startsWith('image/'))
        .map((item: any) => item.eventName)
        .filter(Boolean)
      )].sort() as string[]
      setAvailableEvents(events)
    } catch (e) {
      console.error('Failed to load reviews:', e)
    }
  }

  // Load DevOps sync status
  const loadSyncStatus = async () => {
    try {
      const res = await api.get('/api/devops/sync-status')
      if (res.data && res.data.lastSync) {
        setLastSyncTime(res.data.lastSync)
      }
    } catch (e) {
      // Ignore - sync status is optional
    }
  }

  useEffect(() => {
    loadReviews()
    loadSyncStatus()
    
    const onChanged = (e: any) => {
      if (e && e.detail) {
        setItems(e.detail)
        // Update available events
        const events = [...new Set(e.detail
          .filter((item: any) => String(item.mime || '').startsWith('image/'))
          .map((item: any) => item.eventName)
          .filter(Boolean)
        )].sort() as string[]
        setAvailableEvents(events)
      }
    }
    
    // Listen for refresh events
    const onRefresh = () => {
      loadReviews()
    }
    
    window.addEventListener('reviews:changed', onChanged as EventListener)
    window.addEventListener('reviews:refresh', onRefresh as EventListener)
    return () => {
      window.removeEventListener('reviews:changed', onChanged as EventListener)
      window.removeEventListener('reviews:refresh', onRefresh as EventListener)
    }
  }, [])
  
  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filterEvent])

  // State for modal images (for grouped items)
  const [modalImages, setModalImages] = useState<any[]>([])
  const [modalIndex, setModalIndex] = useState(0)

  const openModal = (item: any) => {
    // If item has grouped images, use those; otherwise just the single item
    const images = item._allImages || [item]
    setModalImages(images)
    setModalIndex(0)
    setSelectedImage(images[0].path)
    setSelectedWorkItemId(item.source === 'devops' ? item.workItemId : null)
    setIsModalOpen(true)
  }

  // Get current modal images count
  const getModalImagesCount = () => modalImages.length

  const navigateImage = useCallback((direction: 'prev' | 'next') => {
    if (modalImages.length <= 1) return
    
    const newIndex = direction === 'prev' 
      ? (modalIndex - 1 + modalImages.length) % modalImages.length
      : (modalIndex + 1) % modalImages.length
    
    setModalIndex(newIndex)
    setSelectedImage(modalImages[newIndex].path)
  }, [modalImages, modalIndex])

  // Keyboard navigation for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isModalOpen) return
      
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        navigateImage('prev')
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        navigateImage('next')
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsModalOpen(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isModalOpen, navigateImage])

  const handleDelete = async (itemId: string, itemName: string) => {
    if (!window.confirm(`Are you sure you want to delete "${itemName}"?`)) {
      return
    }

    try {
      const response = await api.delete(`/api/reviews/${itemId}`)

      if (response.status === 200) {
        // Remove item from local state
        setItems(prev => prev.filter(item => item.id !== itemId))
        toast({
          title: "Success",
          description: "Feedback photo deleted successfully"
        })
        
        // Close modal if deleted item was being viewed
        if (isModalOpen && modalImages[modalIndex]?.id === itemId) {
          setIsModalOpen(false)
        }
      } else {
        throw new Error('Failed to delete')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete feedback photo",
        variant: "destructive"
      })
    }
  }

  // Bulk delete all images from an event (grouped item)
  const handleBulkDelete = async (item: any) => {
    const images = item._allImages || [item]
    const count = images.length
    const eventName = item.eventName || 'this event'
    
    if (!window.confirm(`Are you sure you want to delete all ${count} image${count !== 1 ? 's' : ''} from "${eventName}"?`)) {
      return
    }

    try {
      let deleted = 0
      for (const img of images) {
        try {
          const response = await api.delete(`/api/reviews/${img.id}`)
          if (response.status === 200) deleted++
        } catch (e) {
          console.error('Failed to delete image:', img.id)
        }
      }
      
      // Remove all deleted items from local state
      const deletedIds = new Set(images.map((img: any) => img.id))
      setItems(prev => prev.filter(item => !deletedIds.has(item.id)))
      
      toast({
        title: "Success",
        description: `Deleted ${deleted} of ${count} images from ${eventName}`
      })
      
      if (isModalOpen) {
        setIsModalOpen(false)
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete images",
        variant: "destructive"
      })
    }
  }

  // Import feedback images from Azure DevOps Event Summary Log work items
  const handleImportFromDevOps = async () => {
    setIsImporting(true)
    
    try {
      const response = await api.post('/api/devops/import-screenshots')
      
      if (response.data.success) {
        const { imported, processed, skipped, duplicates, downloadErrors, errors } = response.data
        
        if (imported === 0 && processed === 0) {
          toast({
            title: "No New Feedback Found",
            description: response.data.message || "No unprocessed events with feedback images found"
          })
        } else {
          // Build detailed message
          const parts = [`Imported ${imported} image${imported !== 1 ? 's' : ''}`]
          if (processed > 0) parts.push(`from ${processed} event${processed !== 1 ? 's' : ''}`)
          if (skipped > 0) parts.push(`(${skipped} items had no images)`)
          if (duplicates > 0) parts.push(`(${duplicates} duplicates skipped)`)
          if (downloadErrors > 0) parts.push(`(${downloadErrors} download errors)`)
          
          toast({
            title: "DevOps Import Complete",
            description: parts.join(' ')
          })
          
          // Show errors if any
          if (errors && errors.length > 0) {
            console.warn('DevOps import errors:', errors)
          }
          
          // Refresh the reviews list and sync status
          await loadReviews()
          await loadSyncStatus()
        }
      }
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || 'Failed to import from DevOps'
      const details = error.response?.data?.details || ''
      toast({
        title: "Import Failed",
        description: details ? `${errorMsg}: ${details}` : errorMsg,
        variant: "destructive"
      })
    } finally {
      setIsImporting(false)
    }
  }
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Feedback Gallery</h1>
            <p className="text-muted-foreground">
              {displayItems.length} Events ({filteredImageItems.length} total images){filterEvent !== 'all' ? ` • Filtered by: ${filterEvent}` : ''}{searchQuery ? ` • Search: "${searchQuery}"` : ''}
            </p>
            {lastSyncTime && (
              <p className="text-xs text-muted-foreground mt-1">
                Last synced: {new Date(lastSyncTime).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {/* Search box */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[180px]"
              />
            </div>
            
            {/* Sort dropdown */}
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-[140px]">
                <ArrowUpDown className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Newest First</SelectItem>
                <SelectItem value="date-asc">Oldest First</SelectItem>
                <SelectItem value="name-asc">Name A-Z</SelectItem>
                <SelectItem value="name-desc">Name Z-A</SelectItem>
              </SelectContent>
            </Select>
            
            {/* Event Filter */}
            {availableEvents.length > 0 && (
              <Select value={filterEvent} onValueChange={setFilterEvent}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by event" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Events</SelectItem>
                  {availableEvents.map(event => (
                    <SelectItem key={event} value={event}>
                      {event}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            
            {role === 'admin' && (
              <>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={handleImportFromDevOps}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4" />
                      Import from DevOps
                    </>
                  )}
                </Button>
                
                <FileUploadModal
                  trigger={
                    <Button size="sm" className="flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Upload Photo
                    </Button>
                  }
                  accept=".png,.jpg,.jpeg"
                  uploadTo="/api/upload-review"
                />
              </>
            )}
          </div>
        </div>

        {/* Empty state */}
        {displayItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-gray-100 dark:bg-gray-800 p-6 mb-4">
              {filterEvent === 'all' ? <Plus className="h-12 w-12 text-gray-400" /> : <Filter className="h-12 w-12 text-gray-400" />}
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
              {filterEvent === 'all' ? 'No feedback photos yet' : `No photos for "${filterEvent}"`}
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              {filterEvent === 'all' ? 'Upload photos to showcase participant feedback' : 'Try selecting a different event or clear the filter'}
            </p>
            {filterEvent !== 'all' && (
              <Button variant="outline" onClick={() => setFilterEvent('all')}>
                Clear Filter
              </Button>
            )}
          </div>
        )}

        {/* Gallery Grid - Paginated grid showing up to 12 items per page */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-w-7xl">
          {displayItems.map((item, index) => {
            // Parse eventName for DevOps items (format: "WI-{id} | {date} | {title}")
            const isDevOps = item.source === 'devops'
            let displayTitle = item.eventName || `Feedback ${index + 1}`
            let workItemId = ''
            let eventDate = ''
            let eventTitle = ''
            
            if (isDevOps && item.eventName) {
              const parts = item.eventName.split(' | ')
              workItemId = parts[0] || ''
              eventDate = parts[1] || ''
              eventTitle = parts.slice(2).join(' | ') || ''
            }
            
            // Get image count for grouped items
            const imageCount = item._imageCount || 1
            
            return (
              <div 
                key={item._groupKey || `${item.id}-${item.path}`}
                className="relative group cursor-pointer overflow-hidden rounded-lg bg-white dark:bg-gray-900 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-200 dark:border-gray-700"
                onClick={() => openModal(item)}
              >
                {/* Header with event info */}
                <div className="p-2.5 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  {isDevOps ? (
                    <div className="space-y-1">
                      {/* Work Item ID and Image count */}
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-xs font-mono bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800">
                          {workItemId}
                        </Badge>
                        {imageCount > 1 && (
                          <Badge variant="secondary" className="text-xs">
                            {imageCount} images
                          </Badge>
                        )}
                      </div>
                      {/* Event Date */}
                      {eventDate && (
                        <p className="text-xs text-muted-foreground">
                          {eventDate}
                        </p>
                      )}
                      {/* Event Title */}
                      {eventTitle && (
                        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 line-clamp-2" title={eventTitle}>
                          {eventTitle}
                        </h3>
                      )}
                    </div>
                  ) : (
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                      {displayTitle}
                    </h3>
                  )}
                </div>
                
                {/* Image container with fixed aspect ratio */}
                <div className="aspect-[4/3] overflow-hidden bg-gray-100 dark:bg-gray-800">
                  <img 
                    src={getImageUrl(item.path)} 
                    alt={item.eventName || `Feedback ${index + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                </div>
                
                {/* Source badge */}
                {isDevOps && (
                  <div className="absolute bottom-2 left-2">
                    <Badge className="text-[10px] bg-purple-600 hover:bg-purple-700">
                      DevOps
                    </Badge>
                  </div>
                )}
                
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300 pointer-events-none" />
                
                {/* Action buttons for admin */}
                {role === 'admin' && (
                  <div className="absolute top-14 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="h-8 w-8 bg-white/90 hover:bg-white backdrop-blur-sm shadow-md"
                      onClick={(e) => {
                        e.stopPropagation()
                        openModal(item)
                      }}
                    >
                      <Eye className="h-4 w-4 text-gray-700" />
                    </Button>
                    {/* Bulk delete for grouped items */}
                    {(item._imageCount || 1) > 1 && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="h-8 w-8 bg-red-100 hover:bg-red-200 backdrop-blur-sm shadow-md"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleBulkDelete(item)
                        }}
                        title={`Delete all ${item._imageCount} images`}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            
            <div className="flex items-center gap-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="w-10"
                >
                  {page}
                </Button>
              ))}
            </div>
            
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        )}

        {/* Enhanced Image Modal */}
        <Dialog open={isModalOpen} onOpenChange={(open) => {
          setIsModalOpen(open)
          if (!open) {
            setSelectedWorkItemId(null)
            setModalImages([])
            setModalIndex(0)
          }
        }}>
          <DialogContent className="max-w-5xl max-h-[95vh] p-0 bg-black/95">
            <DialogHeader className="p-4 pb-2 bg-black/50 backdrop-blur-sm">
              <DialogTitle className="flex items-center justify-between text-white">
                <span>
                  {selectedWorkItemId ? `Event Images` : 'Feedback Gallery'}
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-300">
                    {modalImages.length > 0 ? `${modalIndex + 1} of ${modalImages.length}` : ''}
                  </span>
                  {/* Download button */}
                  {modalImages[modalIndex] && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-white/10 hover:bg-white/20 text-white border-white/30"
                      onClick={() => {
                        const imageUrl = getImageUrl(modalImages[modalIndex].path)
                        const link = document.createElement('a')
                        link.href = imageUrl
                        link.download = modalImages[modalIndex].originalName || 'feedback-image.png'
                        link.target = '_blank'
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  )}
                  {role === 'admin' && modalImages[modalIndex] && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="bg-red-600/80 hover:bg-red-700/90"
                      onClick={() => {
                        const currentItem = modalImages[modalIndex]
                        if (currentItem) {
                          handleDelete(currentItem.id, currentItem.eventName || `Feedback`)
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col flex-1">
              {/* Image container */}
              <div className="relative flex-1 p-4 flex items-center justify-center min-h-0">
                {selectedImage && (
                  <img 
                    src={getImageUrl(selectedImage)} 
                    alt={`Feedback ${modalIndex + 1}`}
                    className="max-w-full max-h-[65vh] object-contain rounded-lg shadow-2xl"
                  />
                )}
                
                {/* Navigation buttons */}
                {modalImages.length > 1 && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm h-12 w-12"
                      onClick={() => navigateImage('prev')}
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm h-12 w-12"
                      onClick={() => navigateImage('next')}
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}
              </div>
              
              {/* Image info - below the image, not overlapping */}
              {modalImages[modalIndex] && (
                <div className="px-4 pb-4">
                  <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3">
                    <p className="text-white font-medium">
                      {modalImages[modalIndex].eventName || `Feedback`}
                    </p>
                    {modalImages.length > 1 && (
                      <p className="text-gray-300 text-sm mt-1">
                        Use arrow buttons or keyboard ← → to navigate ({modalIndex + 1}/{modalImages.length})
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}