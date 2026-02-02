import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Calendar, TrendingUp, ChevronLeft, ChevronRight, Clock, Plus, Edit, Trash2, Wand2 } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { FileUploadModal } from "@/components/FileUploadModal"
import api from "@/lib/api"
import { useAuth } from '@/components/AuthProvider'
import { GitHubReleasePicker } from '@/components/GitHubReleasePicker'
import { findBestMatch, type MatchResult } from '@/lib/fuzzyMatch'
import { useToast } from '@/hooks/use-toast'
import { checkDuplicateEventId } from '@/lib/services/eventIdService'

interface CatalogItem {
  id?: string;
  sr: number;
  eventId?: string;
  trackName: string;
  eventDate: string;
  status: string;
  notesETA: string;
  lastTestDate?: string;
  releaseNotesUrl?: string;
  itemType?: string; // Track original type: 'catalog', 'tttSession', 'customLabRequest'
}

// Get type badge for different item sources
const getTypeBadge = (itemType?: string) => {
  if (itemType === 'tttSession') {
    return <Badge variant="outline" className="bg-purple-500/10 text-purple-600 border-purple-500 text-xs">TTT</Badge>
  } else if (itemType === 'customLabRequest') {
    return <Badge variant="outline" className="bg-orange-500/10 text-orange-600 border-orange-500 text-xs">Custom</Badge>
  }
  return null
}

const getStatusBadge = (status: string) => {
  if (status === "Completed") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Completed</Badge>
  } else if (status === "In-progress") {
    return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">In-progress</Badge>
  }
  return <Badge variant="outline">{status}</Badge>
}

export default function CatalogHealth() {
  const { userRole: role } = useAuth()
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catalogData, setCatalogData] = useState<CatalogItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<CatalogItem>({
    sr: 0,
    eventId: "",
    trackName: "",
    eventDate: "",
    status: "",
    notesETA: "",
    lastTestDate: "",
    releaseNotesUrl: ""
  })
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<CatalogItem>({ sr: catalogData.length + 1, trackName: "", eventDate: "", status: "", notesETA: "", lastTestDate: "", releaseNotesUrl: "" });
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  
  // Loading states for operations
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Status filter - default to hide completed (show only upcoming)
  const [statusFilter, setStatusFilter] = useState<string>("upcoming");
  
  // Pagination - items per page
  const [itemsPerPage, setItemsPerPage] = useState<number>(10);
  
  // Auto-match state
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [matchPreview, setMatchPreview] = useState<Array<{
    catalogItem: CatalogItem;
    match: MatchResult | null;
    selected: boolean;
  }>>([]);
  const [isMatchPreviewOpen, setIsMatchPreviewOpen] = useState(false);
  
  // Function to load catalog data from backend
  const loadCatalogData = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/api/catalog')
      const items = Array.isArray(res.data) ? res.data : []
      
      const today = new Date()
      today.setHours(0, 0, 0, 0) // Reset to start of day for accurate comparison
      
      // Calculate 2 weeks from today
      const twoWeeksFromNow = new Date(today)
      twoWeeksFromNow.setDate(twoWeeksFromNow.getDate() + 14)
      
      const mapped = items
        .filter((it: any) => {
          // Include catalog items, TTT sessions, and custom lab requests
          // Exclude other page types
          if (it.type === 'roadmapItem' || it.type === 'localizedTrack' || 
              it.type === 'pdfCatalog' || it.type === 'trackChange' || it.type === 'generalAnnouncement' ||
              it.type === 'labMaintenance') return false
          
          // For TTT sessions and custom lab requests, only include if within 2 weeks
          if (it.type === 'tttSession') {
            const sessionDate = it.sessionDate ? new Date(it.sessionDate) : null
            if (!sessionDate) return false
            sessionDate.setHours(0, 0, 0, 0)
            // Include if session date is between today and 2 weeks from now
            return sessionDate >= today && sessionDate <= twoWeeksFromNow
          }
          
          if (it.type === 'customLabRequest') {
            const eventDate = it.eventDate ? new Date(it.eventDate) : null
            if (!eventDate) return false
            eventDate.setHours(0, 0, 0, 0)
            // Include if event date is between today and 2 weeks from now
            return eventDate >= today && eventDate <= twoWeeksFromNow
          }
          
          // Include regular catalog items if they have track/event info
          return it && (it.trackName || it.trackTitle)
        })
        .map((it: any, idx: number) => {
          // Handle different item types with appropriate field mapping
          let trackName = '';
          let eventDate = '';
          let status = '';
          
          if (it.type === 'tttSession') {
            trackName = String(it.trackName || it.courseName || '');
            eventDate = String(it.sessionDate || '');
            status = String(it.status || 'Scheduled');
          } else if (it.type === 'customLabRequest') {
            trackName = `[Custom] ${String(it.trackTitle || it.sponsorDetails || '')}`;
            eventDate = String(it.eventDate || '');
            status = String(it.status || 'Pending');
          } else {
            trackName = String(it.trackName || it.trackTitle || '');
            eventDate = String(it.eventDate || '');
            status = String(it.status || it.testingStatus || 'Pending');
          }
          
          return {
            id: String(it.id || it._id || `temp_${idx}`),
            sr: String(it.sr || idx + 1),
            eventId: String(it.eventId || ''),
            trackName,
            eventDate,
            status,
            notesETA: String(it.notesETA || it.notes || ''),
            lastTestDate: String(it.lastTestDate || ''),
            releaseNotesUrl: String(it.releaseNotesUrl || ''),
            itemType: it.type || 'catalog' // Track original type for display
          };
        })
      
      // Auto-mark past events as completed (only for items with eventDate)
      const itemsToUpdate: CatalogItem[] = []
      const updatedMapped = mapped.map((item: any) => {
        if (item.eventDate && item.status !== 'Completed') {
          const eventDate = new Date(item.eventDate)
          eventDate.setHours(0, 0, 0, 0)
          
          if (eventDate < today) {
            // Mark as completed
            const autoNote = '[Auto] Event date passed - marked as completed'
            const updatedNotes = item.notesETA 
              ? `${item.notesETA} | ${autoNote}` 
              : autoNote
            
            const updatedItem = {
              ...item,
              status: 'Completed',
              notesETA: updatedNotes
            }
            itemsToUpdate.push(updatedItem)
            return updatedItem
          }
        }
        return item
      })
      
      // Update backend for auto-completed items
      if (itemsToUpdate.length > 0) {
        for (const item of itemsToUpdate) {
          try {
            // Determine the correct type for the update
            const itemType = (item as any).itemType || 'catalog'
            await api.put(`/api/catalog/${String(item.sr)}`, { ...item, type: itemType })
          } catch (err) {
            console.error('Error auto-updating catalog item:', item.sr, err)
          }
        }
        
        toast({
          title: 'Auto-Completed',
          description: `${itemsToUpdate.length} past event(s) marked as completed`
        })
        
        try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
      }
      
      setCatalogData(updatedMapped)
    } catch (e) { 
      console.error('Error loading catalog data:', e)
    } finally {
      setIsLoading(false);
    }
  }
  
  // Load catalog from backend on mount
  useEffect(() => {
    loadCatalogData()
  }, [])

  // Filter data based on status filter and sort by eventDate
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const filteredData = catalogData
    .filter(item => {
      // Check if event date is in the past
      const isPastEvent = item.eventDate ? new Date(item.eventDate) < today : false;
      
      if (statusFilter === "all") return true;
      if (statusFilter === "upcoming") return !isPastEvent; // Hide past events, show items without date
      if (statusFilter === "completed") return isPastEvent; // Show only past events
      return item.status === statusFilter;
    })
    .sort((a, b) => {
      // Sort by eventDate ascending (earliest first)
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : Infinity;
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : Infinity;
      return dateA - dateB;
    });

  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentData = filteredData.slice(startIndex, endIndex)
  
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  // Reset to page 1 when filter or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, itemsPerPage]);

  const handleEdit = (item: CatalogItem) => {
    setEditingItem(item)
    setEditForm({ ...item })
    setIsEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (editingItem && !isSaving) {
      setIsSaving(true);
      // Check for duplicate eventId
      if (editForm.eventId && editForm.eventId.trim() !== '') {
        // Use the actual item type for the exclude check
        const itemType = (editingItem as any).itemType || 'catalog';
        const { isDuplicate, existsIn } = await checkDuplicateEventId(
          editForm.eventId, 
          editingItem.sr, 
          itemType
        );
        if (isDuplicate) {
          toast({
            title: 'Duplicate Event ID',
            description: `Event ID "${editForm.eventId}" already exists in: ${existsIn.join(', ')}`,
            variant: 'destructive'
          });
          setIsSaving(false);
          return;
        }
      }
      
      try {
        await api.put(`/api/catalog/${String(editForm.sr)}`, { ...editForm, type: 'catalog' })
        try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
        // Reload data to get fresh sr values
        await loadCatalogData()
        toast({ title: 'Success', description: 'Item updated successfully' });
      } catch (e) { 
        console.error('Error saving catalog item:', e)
        toast({ title: 'Error', description: 'Failed to save item', variant: 'destructive' });
      } finally {
        setIsSaving(false);
      }
      setIsEditDialogOpen(false)
      setEditingItem(null)
    }
  }

  const handleCancelEdit = () => {
    setIsEditDialogOpen(false)
    setEditingItem(null)
    setEditForm({
      sr: 0,
      eventId: "",
      trackName: "",
      eventDate: "",
      status: "",
      notesETA: ""
    })
  }

  const handleDelete = async (item: CatalogItem) => {
    if (isDeleting) return;
    if (window.confirm(`Are you sure you want to delete "${item.trackName}"?`)) {
      setIsDeleting(true);
      try {
        await api.delete(`/api/catalog/${String(item.sr)}`)
        try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
        // Reload data to get fresh data
        await loadCatalogData()
        toast({ title: 'Deleted', description: 'Item deleted successfully' });
        
        // Adjust current page if necessary
        const newTotalPages = Math.ceil((catalogData.length - 1) / itemsPerPage)
        if (currentPage > newTotalPages && newTotalPages > 0) {
          setCurrentPage(newTotalPages)
        }
      } catch (e) {
        console.error('Error deleting catalog item:', e)
        toast({ title: 'Error', description: 'Failed to delete item', variant: 'destructive' });
      } finally {
        setIsDeleting(false);
      }
    }
  }

  // Add new catalog item
  const handleAddCatalog = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Don't send sr - let backend calculate the next available sr to avoid collisions
      const { sr, ...formWithoutSr } = addForm;
      const payload = { ...formWithoutSr, type: 'catalog' };
      await api.post(`/api/catalog`, payload);
      try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
      // Reload data to get the new item with correct sr
      await loadCatalogData();
      setIsAddDialogOpen(false);
      setAddForm({ sr: 0, trackName: "", eventDate: "", status: "", notesETA: "" });
      toast({ title: 'Success', description: 'Item added successfully' });
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to add item', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk CSV upload
  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError("");
    setCsvUploading(true);
    const file = e.target.files?.[0];
    if (!file) {
      setCsvUploading(false);
      return;
    }
    
    // Check file extension
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setCsvError("Please upload a CSV file");
      setCsvUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await api.post(`/api/upload-csv?resource=catalog`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      
      if (!res.data.success) {
        setCsvError(res.data.error || "Upload failed");
        return;
      }
      
      // Reload data from API to get the full merged dataset
      const catalogRes = await api.get('/api/catalog');
      const items = Array.isArray(catalogRes.data) ? catalogRes.data : [];
      const mapped = items
        .filter((it: any) => {
          if (it.type === 'roadmapItem' || it.type === 'localizedTrack' || it.type === 'tttSession' || 
              it.type === 'pdfCatalog' || it.type === 'trackChange' || it.type === 'generalAnnouncement') return false;
          return it && (it.trackName || it.trackTitle);
        })
        .map((it: any, idx: number) => ({
          id: String(it.id || it._id || `temp_${idx}`),
          sr: String(it.sr || idx + 1),
          trackName: String(it.trackName || it.trackTitle || ''),
          eventDate: String(it.eventDate || ''),
          status: String(it.status || it.testingStatus || 'Pending'),
          notesETA: String(it.notesETA || ''),
        }));
      
      setCatalogData(mapped);
      try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
      
      // Show success message
      alert(res.data.message || `Successfully uploaded ${res.data.uploaded || 0} items`);
    } catch (err: any) {
      console.error('CSV upload error:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || "Failed to upload CSV. Please check the file format.";
      setCsvError(errorMsg);
    } finally {
      setCsvUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Auto-match release notes
  const handleAutoMatch = async () => {
    setIsAutoMatching(true);
    try {
      // Fetch GitHub folders
      const githubResponse = await api.get('/api/github-release-notes');
      const githubFolders = githubResponse.data.folders || [];

      // Find items without release notes URLs
      const itemsToMatch = catalogData.filter(item => !item.releaseNotesUrl || item.releaseNotesUrl.trim() === '');

      if (itemsToMatch.length === 0) {
        toast({
          title: "No items to match",
          description: "All catalog items already have release notes URLs.",
        });
        return;
      }

      // Find matches for each item
      const matches = itemsToMatch.map(item => {
        const match = findBestMatch(item.trackName, githubFolders, 60);
        return {
          catalogItem: item,
          match,
          selected: match !== null // Auto-select if match found
        };
      });

      const foundMatches = matches.filter(m => m.match !== null).length;
      
      if (foundMatches === 0) {
        toast({
          title: "No matches found",
          description: "Could not find any matching GitHub folders for your catalog items.",
          variant: "destructive"
        });
        return;
      }

      setMatchPreview(matches);
      setIsMatchPreviewOpen(true);
      
      toast({
        title: `Found ${foundMatches} matches`,
        description: `Review and apply the suggested release notes URLs.`,
      });
    } catch (error) {
      console.error('Auto-match error:', error);
      toast({
        title: "Failed to auto-match",
        description: "Could not fetch GitHub release notes. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAutoMatching(false);
    }
  };

  // Apply selected matches
  const handleApplyMatches = async () => {
    const selectedMatches = matchPreview.filter(m => m.selected && m.match);
    
    if (selectedMatches.length === 0) {
      toast({
        title: "No matches selected",
        description: "Please select at least one match to apply.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Update catalog data
      const updatedData = catalogData.map(item => {
        const matchEntry = selectedMatches.find(m => m.catalogItem.sr === item.sr);
        if (matchEntry && matchEntry.match) {
          return { ...item, releaseNotesUrl: matchEntry.match.folderUrl };
        }
        return item;
      });

      setCatalogData(updatedData);

      // Save to backend
      for (const matchEntry of selectedMatches) {
        if (matchEntry.match) {
          await api.put(`/api/catalog/${matchEntry.catalogItem.sr}`, {
            ...matchEntry.catalogItem,
            releaseNotesUrl: matchEntry.match.folderUrl,
            type: 'catalog'
          });
        }
      }

      toast({
        title: "Success!",
        description: `Applied ${selectedMatches.length} release notes URLs.`,
      });

      setIsMatchPreviewOpen(false);
      setMatchPreview([]);
      
      try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
    } catch (error) {
      console.error('Apply matches error:', error);
      toast({
        title: "Failed to apply matches",
        description: "Some updates may not have been saved. Please try again.",
        variant: "destructive"
      });
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Catalog Health</h1>
            <p className="text-muted-foreground">
              Latest updated Tracks apart from Top 25 for the upcoming 2 Weeks
            </p>
          </div>
          <div className="flex gap-2">
            {role === 'admin' && (
              <>
                <Button size="sm" className="flex items-center gap-2" onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Add Track
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  className="flex items-center gap-2"
                  disabled={isAutoMatching}
                  onClick={handleAutoMatch}
                >
                  <Wand2 className="h-4 w-4" />
                  {isAutoMatching ? "Matching..." : "Auto-Match URLs"}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  disabled={csvUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {csvUploading ? "Uploading..." : "Bulk Upload (.csv)"}
                </Button>
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".csv" 
                  style={{ display: "none" }} 
                  onChange={handleCsvUpload} 
                />
              </>
            )}
          </div>
          {csvError && <div className="text-red-500 text-sm">{csvError}</div>}
        </div>

        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Catalog Health
                </CardTitle>
                <CardDescription>
                  Track updates and schedules with current status and ETAs
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Show:</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming Only</SelectItem>
                    <SelectItem value="all">All Events</SelectItem>
                    <SelectItem value="completed">Completed Only</SelectItem>
                    <SelectItem value="Pending">Pending Only</SelectItem>
                    <SelectItem value="In-progress">In Progress</SelectItem>
                  </SelectContent>
                </Select>
                <Badge variant="secondary" className="ml-2">
                  {filteredData.length} / {catalogData.length}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Scrollable Table Container */}
              <ScrollArea className="h-[600px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                    <TableHead className="w-24">Event ID</TableHead>
                      <TableHead className="min-w-[250px]">Track Name</TableHead>
                      <TableHead className="w-36">Event Date</TableHead>
                      <TableHead className="w-32">Testing Status</TableHead>
                      <TableHead className="w-36">Last Test Date</TableHead>
                      {/* <TableHead className="w-32">Notes/ETA</TableHead> */}
                      <TableHead className="w-36">Release Notes</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((track) => (
                      <TableRow key={track.id || track.sr}>
                        <TableCell className="font-medium">{track.eventId || '-'}</TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {track.trackName}
                            {getTypeBadge(track.itemType)}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{track.eventDate ? new Date(track.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}</TableCell>
                        <TableCell>{getStatusBadge(track.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.lastTestDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-blue-500" />
                              {new Date(track.lastTestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        {/* <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {track.notesETA}
                          </div>
                        </TableCell> */}
                        <TableCell className="text-muted-foreground">
                          {track.releaseNotesUrl ? (
                            <a href={track.releaseNotesUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 underline whitespace-nowrap">
                              View Release Notes
                            </a>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {role === 'admin' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(track)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(track)}
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              
              {/* Pagination Controls */}
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {filteredData.length > 0 ? startIndex + 1 : 0} to {Math.min(endIndex, filteredData.length)} of <strong>{filteredData.length}</strong> entries
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Show:</span>
                    <Select value={String(itemsPerPage)} onValueChange={(value) => setItemsPerPage(Number(value))}>
                      <SelectTrigger className="w-20 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {totalPages > 1 && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </Button>
                  
                  <div className="flex items-center space-x-1">
                    {totalPages <= 7 ? (
                      Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(page)}
                          className="w-8 h-8 p-0"
                        >
                          {page}
                        </Button>
                      ))
                    ) : (
                      <>
                        <Button
                          variant={currentPage === 1 ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(1)}
                          className="w-8 h-8 p-0"
                        >
                          1
                        </Button>
                        {currentPage > 3 && <span className="px-1">...</span>}
                        {Array.from({ length: 3 }, (_, i) => {
                          const page = Math.max(2, Math.min(currentPage - 1, totalPages - 3)) + i;
                          if (page >= totalPages) return null;
                          return (
                            <Button
                              key={page}
                              variant={currentPage === page ? "default" : "outline"}
                              size="sm"
                              onClick={() => goToPage(page)}
                              className="w-8 h-8 p-0"
                            >
                              {page}
                            </Button>
                          );
                        })}
                        {currentPage < totalPages - 2 && <span className="px-1">...</span>}
                        <Button
                          variant={currentPage === totalPages ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(totalPages)}
                          className="w-8 h-8 p-0"
                        >
                          {totalPages}
                        </Button>
                      </>
                    )}
                  </div>
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => goToPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Track</DialogTitle>
              <DialogDescription>
                Make changes to the track information here. Click save when you're done.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="eventId" className="text-right">
                  Event ID
                </Label>
                <Input
                  id="eventId"
                  type="text"
                  value={editForm.eventId || ''}
                  onChange={(e) => setEditForm({ ...editForm, eventId: e.target.value })}
                  className="col-span-3"
                  placeholder="e.g., EVT-001 or LAB-2024-A"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="trackName" className="text-right">
                  Track Name
                </Label>
                <Input
                  id="trackName"
                  value={editForm.trackName}
                  onChange={(e) => setEditForm({ ...editForm, trackName: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="eventDate" className="text-right">
                  Event Date
                </Label>
                <Input
                  id="eventDate"
                  value={editForm.eventDate}
                  onChange={(e) => setEditForm({ ...editForm, eventDate: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="status" className="text-right">
                  Status
                </Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="In-progress">In-progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notesETA" className="text-right">
                  Notes/ETA
                </Label>
                <Input
                  id="notesETA"
                  value={editForm.notesETA}
                  onChange={(e) => setEditForm({ ...editForm, notesETA: e.target.value })}
                  className="col-span-3"
                />
              </div> */}
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lastTestDate" className="text-right">
                  Last Test Date
                </Label>
                <Input
                  id="lastTestDate"
                  type="date"
                  value={editForm.lastTestDate}
                  onChange={(e) => setEditForm({ ...editForm, lastTestDate: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="releaseNotesUrl" className="text-right">
                  Release Notes
                </Label>
                <div className="col-span-3 space-y-2">
                  <div className="flex gap-2">
                    <Input
                      id="releaseNotesUrl"
                      type="url"
                      value={editForm.releaseNotesUrl}
                      onChange={(e) => setEditForm({ ...editForm, releaseNotesUrl: e.target.value })}
                      className="flex-1"
                      placeholder="https://..."
                    />
                    <GitHubReleasePicker
                      currentUrl={editForm.releaseNotesUrl || ''}
                      onSelect={(url) => setEditForm({ ...editForm, releaseNotesUrl: url })}
                    />
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancelEdit}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Add Track</DialogTitle>
              <DialogDescription>
                Fill in the details to add a new track.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="addTrackName" className="text-right">
                  Track Name
                </Label>
                <Input
                  id="addTrackName"
                  value={addForm.trackName}
                  onChange={(e) => setAddForm({ ...addForm, trackName: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="addEventDate" className="text-right">
                  Event Date
                </Label>
                <Input
                  id="addEventDate"
                  value={addForm.eventDate}
                  onChange={(e) => setAddForm({ ...addForm, eventDate: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="addStatus" className="text-right">
                  Status
                </Label>
                <Select
                  value={addForm.status}
                  onValueChange={(value) => setAddForm({ ...addForm, status: value })}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="In-progress">In-progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {/* <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="addNotesETA" className="text-right">
                  Notes/ETA
                </Label>
                <Input
                  id="addNotesETA"
                  value={addForm.notesETA}
                  onChange={(e) => setAddForm({ ...addForm, notesETA: e.target.value })}
                  className="col-span-3"
                />
              </div> */}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddCatalog}>
                Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Auto-Match Preview Dialog */}
        <Dialog open={isMatchPreviewOpen} onOpenChange={setIsMatchPreviewOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Auto-Match Release Notes Preview</DialogTitle>
              <DialogDescription>
                Review the suggested matches below. Uncheck any you don't want to apply.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {matchPreview.map((item, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={(e) => {
                          const updated = [...matchPreview];
                          updated[idx].selected = e.target.checked;
                          setMatchPreview(updated);
                        }}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-1">
                        <div className="font-medium text-sm">{item.catalogItem.trackName}</div>
                        {item.match ? (
                          <>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="text-xs">
                                {item.match.score}% Match
                              </Badge>
                              <span className="text-xs text-muted-foreground">→</span>
                              <span className="text-xs text-green-600">{item.match.folderName}</span>
                            </div>
                            <a 
                              href={item.match.folderUrl} 
                              target="_blank" 
                              rel="noreferrer"
                              className="text-xs text-primary hover:underline block truncate"
                            >
                              {item.match.folderUrl}
                            </a>
                          </>
                        ) : (
                          <div className="text-xs text-muted-foreground">No match found</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <DialogFooter>
              <div className="flex items-center justify-between w-full">
                <span className="text-sm text-muted-foreground">
                  {matchPreview.filter(m => m.selected).length} of {matchPreview.length} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsMatchPreviewOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleApplyMatches}>
                    Apply Selected
                  </Button>
                </div>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}