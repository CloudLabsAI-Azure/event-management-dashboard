import { DashboardLayout } from "@/components/DashboardLayout"
import { useAuth } from '@/components/AuthProvider'
import { useState, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Plus, X, ChevronLeft, ChevronRight, Trash2, Eye, Filter } from "lucide-react"
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
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [filterEvent, setFilterEvent] = useState<string>('all')
  const [availableEvents, setAvailableEvents] = useState<string[]>([])
  const itemsPerPage = 12

  // Helper to get full image URL
  const getImageUrl = (path: string) => {
    if (!path) return ''
    // If path already has http/https, return as-is
    if (path.startsWith('http')) return path
    // Otherwise prepend API base URL
    const base = getApiBase()
    return base ? `${base}${path}` : path
  }

  // Filter only image items, apply event filter, and deduplicate by path
  const allImageItems = items
    .filter(item => String(item.mime || '').startsWith('image/'))
    .sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0)) // Sort by upload time, newest first
    .reduce((acc: any[], item) => {
      // Deduplicate by path to avoid showing same image multiple times
      if (!acc.find(i => i.path === item.path)) {
        acc.push(item)
      }
      return acc
    }, [])
  
  // Apply event filter
  const filteredImageItems = filterEvent === 'all' 
    ? allImageItems 
    : allImageItems.filter(item => item.eventName === filterEvent)
  
  // Pagination
  const totalPages = Math.ceil(filteredImageItems.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const imageItems = filteredImageItems.slice(startIndex, endIndex)

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
      )].sort()
      setAvailableEvents(events)
    } catch (e) {
      console.error('Failed to load reviews:', e)
    }
  }

  useEffect(() => {
    loadReviews()
    
    const onChanged = (e: any) => {
      if (e && e.detail) {
        setItems(e.detail)
        // Update available events
        const events = [...new Set(e.detail
          .filter((item: any) => String(item.mime || '').startsWith('image/'))
          .map((item: any) => item.eventName)
          .filter(Boolean)
        )].sort()
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

  const openModal = (imagePath: string, index: number) => {
    setSelectedImage(imagePath)
    setSelectedIndex(index)
    setIsModalOpen(true)
  }

  const navigateImage = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' 
      ? (selectedIndex - 1 + imageItems.length) % imageItems.length
      : (selectedIndex + 1) % imageItems.length
    
    setSelectedIndex(newIndex)
    setSelectedImage(imageItems[newIndex].path)
  }

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
        if (isModalOpen && imageItems[selectedIndex]?.id === itemId) {
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
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Feedback Gallery</h1>
            <p className="text-muted-foreground">
              Feedback from participants (Showing {imageItems.length} of {filteredImageItems.length} images{filterEvent !== 'all' ? ` • Filtered by: ${filterEvent}` : ''})
            </p>
          </div>
          <div className="flex items-center gap-2">
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
            )}
          </div>
        </div>

        {/* Empty state */}
        {imageItems.length === 0 && (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
          {imageItems.map((item, index) => (
            <div 
              key={`${item.id}-${item.path}`}
              className="relative group cursor-pointer overflow-hidden rounded-lg bg-white dark:bg-gray-900 shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-200 dark:border-gray-700"
              onClick={() => openModal(item.path, index)}
            >
              {/* Event title at the top */}
              <div className="p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {item.eventName || `Feedback ${index + 1}`}
                </h3>
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
                      openModal(item.path, index)
                    }}
                  >
                    <Eye className="h-4 w-4 text-gray-700" />
                  </Button>
                  <Button
                    size="icon"
                    variant="destructive"
                    className="h-8 w-8 bg-red-500 hover:bg-red-600 backdrop-blur-sm shadow-md"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(item.id, item.eventName || `Feedback ${index + 1}`)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-white" />
                  </Button>
                </div>
              )}
            </div>
          ))}
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
        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="max-w-5xl max-h-[95vh] p-0 bg-black/95">
            <DialogHeader className="p-4 pb-2 bg-black/50 backdrop-blur-sm">
              <DialogTitle className="flex items-center justify-between text-white">
                <span>Feedback Gallery</span>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-300">
                    {selectedIndex + 1} of {imageItems.length}
                  </span>
                  {role === 'admin' && selectedImage && (
                    <Button
                      size="sm"
                      variant="destructive"
                      className="bg-red-600/80 hover:bg-red-700/90"
                      onClick={() => {
                        const currentItem = imageItems[selectedIndex]
                        if (currentItem) {
                          handleDelete(currentItem.id, currentItem.eventName || `Feedback ${selectedIndex + 1}`)
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
            <div className="relative flex-1 p-4">
              {selectedImage && (
                <div className="flex items-center justify-center h-full">
                  <img 
                    src={getImageUrl(selectedImage)} 
                    alt={`Feedback ${selectedIndex + 1}`}
                    className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
                  />
                </div>
              )}
              
              {/* Enhanced Navigation buttons */}
              {imageItems.length > 1 && (
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
              
              {/* Image info */}
              {imageItems[selectedIndex] && (
                <div className="absolute bottom-4 left-4 right-4 bg-black/60 backdrop-blur-sm rounded-lg p-3">
                  <p className="text-white font-medium">
                    {imageItems[selectedIndex].eventName || `Feedback ${selectedIndex + 1}`}
                  </p>
                  <p className="text-gray-300 text-sm mt-1">
                    Click and drag to pan • Use arrow buttons to navigate
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}