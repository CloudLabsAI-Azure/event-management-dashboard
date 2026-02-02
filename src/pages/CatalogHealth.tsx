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
  
  // Auto-match state
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [matchPreview, setMatchPreview] = useState<Array<{
    catalogItem: CatalogItem;
    match: MatchResult | null;
    selected: boolean;
  }>>([]);
  const [isMatchPreviewOpen, setIsMatchPreviewOpen] = useState(false);
  // Load catalog from backend on mount; seed if empty
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await api.get('/api/catalog')
        const items = Array.isArray(res.data) ? res.data : []
        
        const today = new Date()
        today.setHours(0, 0, 0, 0) // Reset to start of day for accurate comparison
        
        const mapped = items
          .filter((it: any) => {
            // Include items that are explicitly catalog type OR have catalog-like fields
            // Exclude other page types
            if (it.type === 'roadmapItem' || it.type === 'localizedTrack' || it.type === 'tttSession' || 
                it.type === 'pdfCatalog' || it.type === 'trackChange' || it.type === 'generalAnnouncement' ||
                it.type === 'labMaintenance' || it.type === 'customLabRequest') return false
            return it && (it.trackName || it.trackTitle)
          })
          .map((it: any, idx: number) => ({
            id: String(it.id || it._id || `temp_${idx}`),
            sr: String(it.sr || idx + 1),
            eventId: String(it.eventId || ''),
            trackName: String(it.trackName || it.trackTitle || ''),
            eventDate: String(it.eventDate || ''),
            status: String(it.status || it.testingStatus || 'Pending'),
            notesETA: String(it.notesETA || ''),
            lastTestDate: String(it.lastTestDate || ''),
            releaseNotesUrl: String(it.releaseNotesUrl || '')
          }))
        
        // Auto-mark past events as completed
        const itemsToUpdate: CatalogItem[] = []
        const updatedMapped = mapped.map((item: CatalogItem) => {
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
        
        if (!mounted) return
        
        // Update backend for auto-completed items
        if (itemsToUpdate.length > 0) {
          for (const item of itemsToUpdate) {
            try {
              await api.put(`/api/catalog/${String(item.sr)}`, { ...item, type: 'catalog' })
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
      } catch (e) { /* ignore */ }
    })()
    return () => { mounted = false }
  }, [])


  const itemsPerPage = 10
  const totalPages = Math.ceil(catalogData.length / itemsPerPage)
  
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentData = catalogData.slice(startIndex, endIndex)
  
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handleEdit = (item: CatalogItem) => {
    setEditingItem(item)
    setEditForm({ ...item })
    setIsEditDialogOpen(true)
  }

  const handleSaveEdit = () => {
    if (editingItem) {
      setCatalogData(prevData => prevData.map(track => track.sr === editingItem.sr ? { ...editForm } : track))
      ;(async () => {
        try {
          await api.put(`/api/catalog/${String(editForm.sr)}`, { ...editForm, type: 'catalog' })
          try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
        } catch (e) { /* ignore */ }
      })()
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

  const handleDelete = (item: CatalogItem) => {
    if (window.confirm(`Are you sure you want to delete "${item.trackName}"?`)) {
      setCatalogData(prevData => prevData.filter(track => track.sr !== item.sr))
      ;(async () => {
        try { await api.delete(`/api/catalog/${String(item.sr)}`); try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {} } catch (e) { }
      })()
      
      // Adjust current page if necessary
      const newTotalPages = Math.ceil((catalogData.length - 1) / itemsPerPage)
      if (currentPage > newTotalPages && newTotalPages > 0) {
        setCurrentPage(newTotalPages)
      }
    }
  }

  // Add new catalog item
  const handleAddCatalog = async () => {
    try {
      const newItem = { ...addForm, sr: catalogData.length + 1, type: 'catalog' };
      setCatalogData(prev => [...prev, newItem]);
  await api.post(`/api/catalog`, newItem);
  try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
      setIsAddDialogOpen(false);
      setAddForm({ sr: catalogData.length + 2, trackName: "", eventDate: "", status: "", notesETA: "" });
    } catch (err) {
      alert("Failed to add catalog item");
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
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Upcoming Tracks Catalog
            </CardTitle>
            <CardDescription>
              Track updates and schedules for the next 2 weeks with current status and ETAs
            </CardDescription>
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
                        <TableCell className="font-medium">{track.trackName}</TableCell>
                        <TableCell className="text-muted-foreground">{track.eventDate}</TableCell>
                        <TableCell>{getStatusBadge(track.status)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.lastTestDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-blue-500" />
                              {new Date(track.lastTestDate).toLocaleDateString()}
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
              {totalPages > 1 && (
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {startIndex + 1} to {Math.min(endIndex, catalogData.length)} of {catalogData.length} entries
                  </div>
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
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => goToPage(page)}
                          className="w-8 h-8 p-0"
                        >
                          {page}
                        </Button>
                      ))}
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
                </div>
              )}
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