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
import { FileText, TrendingUp, ChevronLeft, ChevronRight, Plus, Edit, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useAuth } from '@/components/AuthProvider'
import { FileUploadModal } from "@/components/FileUploadModal"
import MetricsEditor from '@/components/MetricsEditor'

interface TrackItem {
  sr: number;
  trackName: string;
  testingStatus: string;
  releaseNotes: string;
  releaseUrl?: string;
}

const initialTracksData: TrackItem[] = [
  { sr: 1, trackName: "Activate GenAI With Azure", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 2, trackName: "Automate Document Processing using Azure OpenAI", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 3, trackName: "Azure API Management", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 4, trackName: "Build Intelligent Apps With Microsoft's Copilot Stack & Azure OpenAI", testingStatus: "Completed", releaseNotes: "Release Notes", releaseUrl: "" },
  { sr: 4, trackName: "Build Intelligent Apps With Microsoft's Copilot Stack & Azure OpenAI", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 5, trackName: "Build Prompt Engineering With Azure OpenAI Service", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 6, trackName: "Business Automation with Azure OpenAI and Document Intelligence", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 7, trackName: "Cloud Native Applications", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 8, trackName: "Cloud Scale Analytics With Microsoft Fabric", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 9, trackName: "Create And Publish PowerBI Dashboards & Reports", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 10, trackName: "Develop Generative AI Solutions With Azure OpenAI Service", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 11, trackName: "Developing AI Applications with Azure AI Foundry", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 12, trackName: "DevOps With GitHub", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 13, trackName: "Fabric – Analyst In a Day", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 14, trackName: "Get Started With OpenAI And Build Natural Language Solution", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 15, trackName: "GitHub Copilot – Hackathon", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 16, trackName: "GitHub Copilot Innovation Workshop", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 17, trackName: "Implement CI/CD with GitHub Actions", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 18, trackName: "Innovate With AI", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 19, trackName: "Intelligent App Development With Microsoft Copilot Stack", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 20, trackName: "Introduction To Building AI Apps", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 21, trackName: "Low-Code for Pro-Dev in a Day", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 22, trackName: "Microsoft Azure AI Agents: Hands-on Lab", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 23, trackName: "MS Fabric Foundation For Enterprise Analytics", testingStatus: "In-progress", releaseNotes: "Release Notes" },
  { sr: 24, trackName: "Securing Repositories with GitHub Advanced Security", testingStatus: "Completed", releaseNotes: "Release Notes" },
  { sr: 25, trackName: "Use Azure OpenAI Like A Pro To Build Powerful AI Applications", testingStatus: "Completed", releaseNotes: "Release Notes" }
]

const getStatusBadge = (status: string) => {
  if (status === "Completed") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Completed</Badge>
  } else if (status === "In-progress") {
    return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">In-progress</Badge>
  }
  return <Badge variant="outline">{status}</Badge>
}

export default function Top25Tracks() {
  const [tracksData, setTracksData] = useState<TrackItem[]>(initialTracksData);
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
    releaseUrl: ""
  })
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<TrackItem>({ sr: tracksData.length + 1, trackName: "", testingStatus: "", releaseNotes: "", releaseUrl: "" });
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
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
      const updated = tracksData.map((t) => (t.sr === editingItem.sr ? { ...editForm } : t));
      // persist to backend
      await tracksService.update(editingItem.sr, { ...editForm })
      setTracksData(updated);
      setIsEditDialogOpen(false);
      setEditingItem(null);
      toast({ title: 'Saved', description: 'Track updated' })
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
      await api.delete(`/api/tracks/${String(item.sr)}`)
      const updated = tracksData.filter((t) => t.sr !== item.sr).map((t, idx) => ({ ...t, sr: idx + 1 }));
      setTracksData(updated);
      const newTotalPages = Math.ceil(updated.length / itemsPerPage)
      if (currentPage > newTotalPages && newTotalPages > 0) setCurrentPage(newTotalPages)
      toast({ title: 'Deleted', description: 'Track removed' })
    } catch (err) {
      console.warn('Failed to persist delete', err);
      toast({ title: 'Delete failed', description: 'Could not remove track', variant: 'destructive' })
    }
  }

  // Try to load persisted data on mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // load /api/tracks
        const res = await api.get('/api/tracks').catch(async () => {
          const r = await api.get('/api/data');
          return { data: r.data && r.data.tracks ? r.data.tracks : [] }
        })
        const list = Array.isArray(res.data) ? res.data : (res.data && res.data.tracks ? res.data.tracks : [])
        if (mounted && Array.isArray(list) && list.length > 0) {
          setTracksData(list.map((t: any, idx: number) => ({ sr: Number(t.sr || idx+1), trackName: String(t.trackName || t.name || ''), testingStatus: String(t.testingStatus || ''), releaseNotes: String(t.releaseNotes || 'Release Notes'), releaseUrl: t.releaseUrl || t.release_url || '' })));
        }
      } catch (err) {
        // ignore
      }
    })()
    // listen for metrics changes (no-op for now but keeps parity with other pages)
    const onMetricsChanged = (_: any) => {
      // could refresh KPIs or other UI here if needed
    }
    window.addEventListener('metrics:changed', onMetricsChanged as EventListener)
    return () => { mounted = false; window.removeEventListener('metrics:changed', onMetricsChanged as EventListener) }
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Top 25 Tracks</h1>
            {/* Subtitle removed per request */}
          </div>
          {role === 'admin' && (
            <div className="flex items-center gap-2">
              <Button size="sm" className="flex items-center gap-2" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Track
              </Button>
            </div>
          )}
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Top 25 Tracks Report
            </CardTitle>
            <CardDescription>
              Trending tracks from the Request Management Portal with testing status and release information
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
                      <TableHead className="w-32">Testing Status</TableHead>
                      <TableHead className="w-32">Release Notes</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentData.map((track) => (
                      <TableRow key={track.sr}>
                        <TableCell className="font-medium">{track.sr}</TableCell>
                        <TableCell className="font-medium">{track.trackName}</TableCell>
                        <TableCell>{getStatusBadge(track.testingStatus)}</TableCell>
                        <TableCell>
                          {track.releaseUrl ? (
                            <a href={track.releaseUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary/80 underline flex items-center gap-1">
                              <FileText className="h-4 w-4" />
                              <span>{track.releaseNotes || 'Release Notes'}</span>
                            </a>
                          ) : (
                            <span className="text-muted-foreground flex items-center gap-1">
                              <FileText className="h-4 w-4" />
                              <span>{track.releaseNotes || 'Release Notes'}</span>
                            </span>
                          )}
                        </TableCell>

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
                  <Input
                    id="addReleaseUrl"
                    value={(addForm as any).releaseUrl || ''}
                    onChange={(e) => setAddForm({ ...addForm, releaseUrl: e.target.value })}
                    placeholder="https://example.com/release-notes"
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddTrack}>
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
            </Dialog>
          )}
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
                <Input id="releaseUrl" value={(editForm as any).releaseUrl || ''} onChange={(e) => setEditForm({ ...editForm, releaseUrl: e.target.value })} placeholder="https://example.com/release-notes" className="col-span-3" />
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
      </div>
    </DashboardLayout>
  )
}