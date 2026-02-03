import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import api from "@/lib/api";
import tracksService from '@/lib/services/tracksService'
import { isValidUrl, isNonEmptyString } from '@/lib/validation'
import Papa from "papaparse";
import { useToast } from '@/hooks/use-toast'
import EntityEditDialog from '@/components/EntityEditDialog'
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FileText, TrendingUp, ChevronLeft, ChevronRight, Plus, Edit, Trash2, Wand2 } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { useAuth } from '@/components/AuthProvider'
import { FileUploadModal } from "@/components/FileUploadModal"
import MetricsEditor from '@/components/MetricsEditor'
import { GitHubReleasePicker } from '@/components/GitHubReleasePicker'
import { findBestMatch, type MatchResult } from '@/lib/fuzzyMatch'

interface TrackItem {
  id?: string;
  sr: number;
  trackName: string;
  testingStatus: string;
  releaseNotes: string;
  releaseUrl?: string;
  lastTestDate?: string;
}

const getStatusBadge = (status: string) => {
  if (status === "Completed") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Completed</Badge>
  } else if (status === "In-progress") {
    return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">In-progress</Badge>
  }
  return <Badge variant="outline">{status}</Badge>
}

export default function Top25Tracks() {
  const [tracksData, setTracksData] = useState<TrackItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // role determined by auth; read from localStorage (App sets it on login)
  const { userRole: role } = useAuth();
  const [currentPage, setCurrentPage] = useState(1)
  const [editingItem, setEditingItem] = useState<TrackItem | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<TrackItem>({
    sr: 0,
    trackName: "",
    testingStatus: "",
    releaseNotes: "",
    releaseUrl: "",
    lastTestDate: ""
  })
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<TrackItem>({ sr: tracksData.length + 1, trackName: "", testingStatus: "", releaseNotes: "", releaseUrl: "", lastTestDate: "" });
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  
  // Auto-match state
  const [isAutoMatching, setIsAutoMatching] = useState(false);
  const [matchPreview, setMatchPreview] = useState<Array<{
    trackItem: TrackItem;
    match: MatchResult | null;
    selected: boolean;
  }>>([]);
  const [isMatchPreviewOpen, setIsMatchPreviewOpen] = useState(false);
  // Removed bulk upload and metrics edit for this page per requirements
  
  const itemsPerPage = 10
  const totalPages = Math.ceil(tracksData.length / itemsPerPage)
  
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const currentData = tracksData.slice(startIndex, endIndex)
  
  const goToPage = (page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)))
  }

  const handleEdit = (item: TrackItem) => {
    setEditingItem(item)
    setEditForm({ ...item })
    setIsEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    // validation
    if (!editForm.trackName || editForm.trackName.trim().length < 3) {
      toast({ title: 'Validation', description: 'Track name is required (min 3 chars)', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      // releaseUrl validation
      if ((editForm as any).releaseUrl && !isValidUrl((editForm as any).releaseUrl)) {
        toast({ title: 'Validation', description: 'Release URL must be a valid http/https URL', variant: 'destructive' })
        setSaving(false)
        return
      }
      // persist to backend
      await tracksService.update(editingItem.sr, { ...editForm })
      const updated = tracksData.map((t) => (t.sr === editingItem.sr ? { ...editForm } : t));
      setTracksData(updated);
      setIsEditDialogOpen(false);
      setEditingItem(null);
      toast({ title: 'Saved', description: 'Track updated' })
      // Notify other components
      window.dispatchEvent(new CustomEvent('tracks:changed'))
    } catch (err) {
      console.warn('Failed to persist edited data', err);
      toast({ title: 'Save failed', description: 'Could not save track', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleAddTrack = async () => {
    try {
      if (!addForm.trackName || addForm.trackName.trim().length < 3) {
        toast({ title: 'Validation', description: 'Track name is required (min 3 chars)', variant: 'destructive' })
        return
      }
      if ((addForm as any).releaseUrl && !isValidUrl((addForm as any).releaseUrl)) {
        toast({ title: 'Validation', description: 'Release URL must be a valid http/https URL', variant: 'destructive' })
        return
      }
      setSaving(true)
      const newTrack = { ...addForm, sr: tracksData.length + 1 };
      const created = await tracksService.create(newTrack)
      // merge avoiding duplicates by trackName (case-insensitive)
      const existingNames = new Set(tracksData.map(t => t.trackName.toLowerCase()))
      const merged = [...tracksData]
      if (!existingNames.has((created.trackName || newTrack.trackName || '').toLowerCase())) merged.push(created)
      const updated = merged.map((t, i) => ({ ...t, sr: i + 1 }))
      setTracksData(updated);
      setIsAddDialogOpen(false);
      // Notify other components
      window.dispatchEvent(new CustomEvent('tracks:changed'))
      setAddForm({ sr: updated.length + 1, trackName: "", testingStatus: "", releaseNotes: "", releaseUrl: "" });
      toast({ title: 'Created', description: 'Track added' })
    } catch (err) {
      toast({ title: 'Add failed', description: 'Could not add track', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  };

  // Open add dialog handler exposed to UI
  const openAddDialog = () => setIsAddDialogOpen(true)


  const handleCancelEdit = () => {
    setIsEditDialogOpen(false)
    setEditingItem(null)
    setEditForm({ sr: 0, trackName: "", testingStatus: "", releaseNotes: "", releaseUrl: "" })
  }

  const handleDelete = async (item: TrackItem) => {
    if (!window.confirm(`Delete track "${item.trackName}"?`)) return
    try {
      await tracksService.remove(item.sr)
      const updated = tracksData.filter((t) => t.sr !== item.sr).map((t, idx) => ({ ...t, sr: idx + 1 }));
      setTracksData(updated);
      const newTotalPages = Math.ceil(updated.length / itemsPerPage)
      if (currentPage > newTotalPages && newTotalPages > 0) setCurrentPage(newTotalPages)
      toast({ title: 'Deleted', description: 'Track removed' })
      // Notify other components
      window.dispatchEvent(new CustomEvent('tracks:changed'))
    } catch (err) {
      console.warn('Failed to persist delete', err);
      toast({ title: 'Delete failed', description: 'Could not remove track', variant: 'destructive' })
    }
  }

  // Load data from backend on mount
  useEffect(() => {
    let mounted = true;
    const loadTracks = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/api/tracks').catch(async () => {
          const r = await api.get('/api/data');
          return { data: r.data && r.data.tracks ? r.data.tracks : [] }
        })
        const list = Array.isArray(res.data) ? res.data : (res.data && res.data.tracks ? res.data.tracks : [])
        if (mounted) {
          const mapped = Array.isArray(list) ? list.map((t: any, idx: number) => ({ 
            id: String(t.id || t._id || `track_${idx}`),
            sr: Number(t.sr || idx + 1), 
            trackName: String(t.trackName || t.name || ''), 
            testingStatus: String(t.testingStatus || ''), 
            releaseNotes: String(t.releaseNotes || 'Release Notes'), 
            releaseUrl: t.releaseUrl || t.release_url || '',
            lastTestDate: t.lastTestDate || ''
          })) : [];
          
          // Auto-mark tracks as "In-progress" if last test date is older than 30 days
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const thirtyDaysAgo = new Date(today);
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
          
          const tracksToUpdate: TrackItem[] = [];
          const updatedMapped = mapped.map((track: TrackItem) => {
            if (track.lastTestDate && track.testingStatus !== 'In-progress') {
              const testDate = new Date(track.lastTestDate);
              testDate.setHours(0, 0, 0, 0);
              
              if (testDate < thirtyDaysAgo) {
                const updatedTrack = { ...track, testingStatus: 'In-progress' };
                tracksToUpdate.push(updatedTrack);
                return updatedTrack;
              }
            }
            return track;
          });
          
          // Update backend for auto-updated tracks
          if (tracksToUpdate.length > 0) {
            for (const track of tracksToUpdate) {
              try {
                await tracksService.update(track.sr, track);
              } catch (err) {
                console.error('Error auto-updating track:', track.sr, err);
              }
            }
            toast({
              title: 'Auto-Updated',
              description: `${tracksToUpdate.length} track(s) marked as In-progress (last tested > 30 days ago)`
            });
          }
          
          setTracksData(updatedMapped);
        }
      } catch (err) {
        console.error('Failed to load tracks', err);
        if (mounted) setTracksData([]);
      } finally {
        if (mounted) setIsLoading(false);
      }
    }
    loadTracks();
    
    // Listen for data changes to refresh the list
    const onTracksChanged = () => {
      loadTracks();
    }
    window.addEventListener('tracks:changed', onTracksChanged as EventListener)
    
    return () => { 
      mounted = false; 
      window.removeEventListener('tracks:changed', onTracksChanged as EventListener)
    }
  }, [])

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
      const res = await api.post(`/api/upload-csv?resource=tracks`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      
      if (!res.data.success) {
        setCsvError(res.data.error || "Upload failed");
        return;
      }
      
      // Reload data from API to get the full merged dataset
      const tracksRes = await api.get('/api/tracks');
      const items = Array.isArray(tracksRes.data) ? tracksRes.data : [];
      const mapped = items.map((t: any, idx: number) => ({
        id: String(t.id || t._id || `track_${idx}`),
        sr: Number(t.sr || idx + 1), 
        trackName: String(t.trackName || t.name || ''), 
        testingStatus: String(t.testingStatus || ''), 
        releaseNotes: String(t.releaseNotes || 'Release Notes'), 
        releaseUrl: t.releaseUrl || t.release_url || '',
        lastTestDate: t.lastTestDate || ''
      }));
      
      setTracksData(mapped);
      try { window.dispatchEvent(new CustomEvent('tracks:changed')) } catch {}
      
      // Show success message
      toast({
        title: "Success",
        description: res.data.message || `Successfully uploaded ${res.data.uploaded || 0} items`,
      });
    } catch (err: any) {
      console.error('CSV upload error:', err);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || "Failed to upload CSV. Please check the file format.";
      setCsvError(errorMsg);
      toast({
        title: "Error",
        description: errorMsg,
        variant: "destructive"
      });
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
      const itemsToMatch = tracksData.filter(item => !item.releaseUrl || item.releaseUrl.trim() === '');

      if (itemsToMatch.length === 0) {
        toast({
          title: "No items to match",
          description: "All tracks already have release notes URLs.",
        });
        setIsAutoMatching(false);
        return;
      }

      // Find matches for each item
      const matches = itemsToMatch.map(item => {
        const match = findBestMatch(item.trackName, githubFolders, 60);
        return {
          trackItem: item,
          match,
          selected: match !== null // Auto-select if match found
        };
      });

      const foundMatches = matches.filter(m => m.match !== null).length;
      
      if (foundMatches === 0) {
        toast({
          title: "No matches found",
          description: "Could not find any matching GitHub folders for your tracks.",
          variant: "destructive"
        });
        setIsAutoMatching(false);
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
      // Update tracks data
      const updatedData = tracksData.map(item => {
        const matchEntry = selectedMatches.find(m => m.trackItem.sr === item.sr);
        if (matchEntry && matchEntry.match) {
          return { ...item, releaseUrl: matchEntry.match.folderUrl };
        }
        return item;
      });

      setTracksData(updatedData);

      // Save to backend
      for (const matchEntry of selectedMatches) {
        if (matchEntry.match) {
          await tracksService.update(matchEntry.trackItem.sr, {
            ...matchEntry.trackItem,
            releaseUrl: matchEntry.match.folderUrl
          });
        }
      }

      toast({
        title: "Success!",
        description: `Applied ${selectedMatches.length} release notes URLs.`,
      });

      setIsMatchPreviewOpen(false);
      setMatchPreview([]);
      
      try { window.dispatchEvent(new CustomEvent('tracks:changed')) } catch {}
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
          <div className="max-w-4xl">
            <h1 className="text-3xl font-bold text-foreground">Trending Tracks</h1>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              Trending tracks are identified and tagged as "Trending" in the Request Management Portal and can be easily filtered from the UI. A minimum of 25 unique tracks with hands-on labs (excluding onboarding, TTT, and lunch-and-learn) are maintained monthly, with full end-to-end validation including UI updates, screenshots, testing, and upgrade assessment—independent of the number of events in the quarter.
            </p>
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              The list is refreshed quarterly based on prior-quarter demand, with additional tracks maintained under a separate monthly budget to keep the total at 30 active tracks. All other tracks are updated event-driven, with major upgrades planned case-by-case based on priority, funding approval, and coordination with the PMO team.
            </p>
          </div>
          {role === 'admin' && (
            <div className="flex items-center gap-2">
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
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".csv" 
                style={{ display: "none" }} 
                onChange={handleCsvUpload} 
              />
            </div>
          )}
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Trending Tracks Report
            </CardTitle>
            <CardDescription>
              Trending tracks from the Request Management Portal with testing status and release information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">Loading tracks...</div>
                </div>
              ) : tracksData.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="text-muted-foreground">No tracks found. {role === 'admin' && 'Click "Add Track" to create one.'}</div>
                </div>
              ) : (
                <>
              {/* Scrollable Table Container */}
              <ScrollArea className="h-[600px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-16">Sr.</TableHead>
                      <TableHead className="min-w-[300px]">Track Name</TableHead>
                      <TableHead className="w-32">Testing Status</TableHead>
                      <TableHead className="w-32">Release Notes</TableHead>
                      <TableHead className="w-32">Last Test Date</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((track) => (
                      <TableRow key={track.id || track.sr}>
                        <TableCell className="font-medium">{track.sr}</TableCell>
                        <TableCell className="font-medium">{track.trackName}</TableCell>
                        <TableCell>{getStatusBadge(track.testingStatus)}</TableCell>
                        <TableCell>
                          {track.releaseUrl ? (
                            <a href={track.releaseUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 underline whitespace-nowrap">
                              View Release Notes
                            </a>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.lastTestDate ? new Date(track.lastTestDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
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
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {startIndex + 1} to {Math.min(endIndex, tracksData.length)} of {tracksData.length} entries
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
              </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Add Dialog */}
        {role === 'admin' && (
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Lab/Track</DialogTitle>
                <DialogDescription>
                  Fill in the details to add a new lab/track.
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
                  <Label htmlFor="addTestingStatus" className="text-right">
                    Testing Status
                  </Label>
                  <Select
                    value={addForm.testingStatus}
                    onValueChange={(value) => setAddForm({ ...addForm, testingStatus: value })}
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
                  <Label htmlFor="addReleaseNotes" className="text-right">
                    Release Notes
                  </Label>
                  <Input
                    id="addReleaseNotes"
                    value={addForm.releaseNotes}
                    onChange={(e) => setAddForm({ ...addForm, releaseNotes: e.target.value })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="addReleaseUrl" className="text-right">
                    Release URL
                  </Label>
                  <div className="col-span-3 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        id="addReleaseUrl"
                        value={(addForm as any).releaseUrl || ''}
                        onChange={(e) => setAddForm({ ...addForm, releaseUrl: e.target.value })}
                        placeholder="https://example.com/release-notes"
                        className="flex-1"
                      />
                      <GitHubReleasePicker
                        currentUrl={(addForm as any).releaseUrl || ''}
                        onSelect={(url) => setAddForm({ ...addForm, releaseUrl: url })}
                      />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="addLastTestDate" className="text-right">
                    Last Test Date
                  </Label>
                  <Input
                    id="addLastTestDate"
                    type="date"
                    value={addForm.lastTestDate || ''}
                    onChange={(e) => setAddForm({ ...addForm, lastTestDate: e.target.value })}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddTrack} disabled={saving}>
                  {saving ? 'Adding...' : 'Add'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

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
                <Label htmlFor="testingStatus" className="text-right">
                  Testing Status
                </Label>
                <Select
                  value={editForm.testingStatus}
                  onValueChange={(value) => setEditForm({ ...editForm, testingStatus: value })}
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
                <Label htmlFor="releaseNotes" className="text-right">
                  Release Notes
                </Label>
                <Input
                  id="releaseNotes"
                  value={editForm.releaseNotes}
                  onChange={(e) => setEditForm({ ...editForm, releaseNotes: e.target.value })}
                  className="col-span-3"
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="releaseUrl" className="text-right">Release URL</Label>
                <div className="col-span-3 space-y-2">
                  <div className="flex gap-2">
                    <Input 
                      id="releaseUrl" 
                      value={(editForm as any).releaseUrl || ''} 
                      onChange={(e) => setEditForm({ ...editForm, releaseUrl: e.target.value })} 
                      placeholder="https://example.com/release-notes" 
                      className="flex-1" 
                    />
                    <GitHubReleasePicker
                      currentUrl={(editForm as any).releaseUrl || ''}
                      onSelect={(url) => setEditForm({ ...editForm, releaseUrl: url })}
                    />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lastTestDate" className="text-right">Last Test Date</Label>
                <Input id="lastTestDate" type="date" value={editForm.lastTestDate || ''} onChange={(e) => setEditForm({ ...editForm, lastTestDate: e.target.value })} className="col-span-3" />
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
                        <div className="font-medium text-sm">{item.trackItem.trackName}</div>
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