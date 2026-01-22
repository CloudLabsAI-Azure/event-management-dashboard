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
import { Calendar, TrendingUp, ChevronLeft, ChevronRight, Clock, Plus, Edit, Trash2 } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { FileUploadModal } from "@/components/FileUploadModal"
import api from "@/lib/api"
import { useAuth } from '@/components/AuthProvider'

interface CatalogItem {
  id?: string;
  sr: number;
  trackName: string;
  eventDate: string;
  status: string;
  notesETA: string;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [catalogData, setCatalogData] = useState<CatalogItem[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<CatalogItem>({
    sr: 0,
    trackName: "",
    eventDate: "",
    status: "",
    notesETA: ""
  })
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<CatalogItem>({ sr: catalogData.length + 1, trackName: "", eventDate: "", status: "", notesETA: "" });
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  // Load catalog from backend on mount; seed if empty
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const res = await api.get('/api/catalog')
        const items = Array.isArray(res.data) ? res.data : []
        const mapped = items
          .filter((it: any) => {
            // Include items that are explicitly catalog type OR have catalog-like fields
            if (it.type === 'roadmapItem' || it.type === 'localizedTrack') return false
            return it && (it.trackName || it.trackTitle)
          })
          .map((it: any, idx: number) => ({
            id: String(it.id || it._id || `temp_${idx}`),
            sr: Number(it.sr || idx + 1),
            trackName: String(it.trackName || it.trackTitle || ''),
            eventDate: String(it.eventDate || ''),
            status: String(it.status || it.testingStatus || 'Pending'),
            notesETA: String(it.notesETA || ''),
          }))
        if (!mounted) return
        setCatalogData(mapped)
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
          if (it.type === 'roadmapItem' || it.type === 'localizedTrack') return false;
          return it && (it.trackName || it.trackTitle);
        })
        .map((it: any, idx: number) => ({
          id: String(it.id || it._id || `temp_${idx}`),
          sr: Number(it.sr || idx + 1),
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
                      <TableHead className="w-16">Sr.</TableHead>
                      <TableHead className="min-w-[300px]">Track Name</TableHead>
                      <TableHead className="w-40">Event Date</TableHead>
                      <TableHead className="w-32">Status</TableHead>
                      <TableHead className="w-32">Notes/ETA</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((track) => (
                      <TableRow key={track.id || track.sr}>
                        <TableCell className="font-medium">{track.sr}</TableCell>
                        <TableCell className="font-medium">{track.trackName}</TableCell>
                        <TableCell className="text-muted-foreground">{track.eventDate}</TableCell>
                        <TableCell>{getStatusBadge(track.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-4 w-4" />
                            {track.notesETA}
                          </div>
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notesETA" className="text-right">
                  Notes/ETA
                </Label>
                <Input
                  id="notesETA"
                  value={editForm.notesETA}
                  onChange={(e) => setEditForm({ ...editForm, notesETA: e.target.value })}
                  className="col-span-3"
                />
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="addNotesETA" className="text-right">
                  Notes/ETA
                </Label>
                <Input
                  id="addNotesETA"
                  value={addForm.notesETA}
                  onChange={(e) => setAddForm({ ...addForm, notesETA: e.target.value })}
                  className="col-span-3"
                />
              </div>
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
      </div>
    </DashboardLayout>
  )
}