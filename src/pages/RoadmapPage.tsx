import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Calendar, MapPin, Edit, Trash2, Plus } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useAuth } from '@/components/AuthProvider'
import catalogService from '@/lib/services/catalogService'
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'
import { isNonEmptyString } from '@/lib/validation'
import api from "@/lib/api";

interface RoadmapItem {
  id?: string;
  sr: number;
  trackTitle: string;
  phase: string;
  eta: string;
  eventId?: string;
  programType?: string;
  approvalDate?: string;
  notes?: string;
}

const getPhaseBadge = (phase: string) => {
  if (phase === "Under assessment") {
    return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">Under assessment</Badge>
  } else if (phase === "Development") {
    return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">Development</Badge>
  } else if (phase === "Release-ready") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Release-ready</Badge>
  } else if (phase === "Released") {
    return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">Released</Badge>
  } else if (phase === "Backlog") {
    return <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600 text-white">Backlog</Badge>
  }
  return <Badge variant="outline">{phase}</Badge>
}

export default function RoadmapPage() {
  const [roadmapData, setRoadmapData] = useState<RoadmapItem[]>([])
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<RoadmapItem>({
    sr: 0,
    trackTitle: "",
    phase: "",
    eta: "",
    eventId: "",
    programType: "",
    approvalDate: "",
    notes: ""
  })
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  
  // Filter state
  const [phaseFilter, setPhaseFilter] = useState<string>("all");
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  
  // Notes popup state
  const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);

  // Filtered data based on phase and sponsor filters
  const filteredRoadmapData = roadmapData.filter(item => {
    const matchesPhase = phaseFilter === "all" || item.phase === phaseFilter;
    const matchesSponsor = sponsorFilter === "all" || item.programType === sponsorFilter;
    return matchesPhase && matchesSponsor;
  });

  // Get unique sponsors for filter dropdown
  const uniqueSponsors = Array.from(new Set(roadmapData.map(item => item.programType).filter(Boolean)));

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await catalogService.list()
        if (!mounted) return
        console.log('Catalog list:', list) // Debug log
        const roadmapItems = list.filter((i: any) => i.type === 'roadmapItem')
        console.log('Filtered roadmap items:', roadmapItems) // Debug log
        const mapped = roadmapItems.map((r: any, idx: number) => ({ 
          id: String(r.id || r._id || `temp_${idx}`),
          sr: Number(r.sr || idx + 1), 
          trackTitle: r.trackTitle || r.title || '', 
          phase: r.phase || '', 
          eta: r.eta || 'NA',
          eventId: r.eventId || '',
          programType: r.programType || '',
          approvalDate: r.approvalDate || '',
          notes: r.notes || ''
        }))
        setRoadmapData(mapped)
      } catch (err) {
        console.error('Error loading roadmap data:', err)
        toast({
          title: "Error",
          description: "Could not load roadmap data from server.",
          variant: "destructive"
        })
      }
    })()
    return () => { mounted = false }
  }, [])

  const handleEdit = (item: RoadmapItem) => {
    setEditingItem(item)
    setEditForm({ ...item })
    setIsEditDialogOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editForm.trackTitle || editForm.trackTitle.trim().length < 3) {
      throw new Error('Track title is required (min 3 chars)')
    }
    
    try {
      const payload = { ...editForm, type: 'roadmapItem' }
      console.log('Saving roadmap item:', payload) // Debug log
      
      if (editingItem && editingItem.sr && editingItem.sr > 0) {
        await catalogService.update(editingItem.sr, payload)
        setRoadmapData(prevData => prevData.map(track => track.sr === editingItem.sr ? { ...editForm, id: editingItem.id } : track))
      } else {
        const resItem = await catalogService.create(payload)
        console.log('Create response:', resItem) // Debug log
        const newItem = { 
          ...editForm, 
          id: String(resItem?.id || resItem?._id || ''),
          sr: Number(resItem?.sr || Date.now()) 
        }
        setRoadmapData(prev => [...prev, newItem])
      }
      setIsEditDialogOpen(false)
      setEditingItem(null)
      toast({ title: 'Success', description: 'Roadmap item saved successfully' })
    } catch (err) {
      console.error('Save error:', err)
      throw err // Re-throw to let EntityEditDialog handle the error display
    }
  }

  const handleCancelEdit = () => {
    setIsEditDialogOpen(false)
    setEditingItem(null)
    setEditForm({
      sr: 0,
      trackTitle: "",
      phase: "",
      eta: ""
    })
  }

  const { userRole: role } = useAuth()

  const handleDelete = (item: RoadmapItem) => {
    if (window.confirm(`Are you sure you want to delete "${item.trackTitle}"?`)) {
      ;(async () => {
        try {
          console.log('Deleting roadmap item:', item) // Debug log
          await catalogService.remove(item.sr)
          setRoadmapData(prevData => prevData.filter(track => track.sr !== item.sr))
          toast({ title: 'Deleted', description: 'Roadmap item removed successfully' })
        } catch (err) {
          console.error('Delete error:', err)
          toast({ 
            title: 'Delete failed', 
            description: err instanceof Error ? err.message : 'Could not delete roadmap item', 
            variant: 'destructive' 
          })
        }
      })()
    }
  }

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
      // Roadmap items are stored in catalog with type='roadmapItem'
      const res = await api.post(`/api/upload-csv?resource=catalog`, formData, { headers: { "Content-Type": "multipart/form-data" } });
      
      if (!res.data.success) {
        setCsvError(res.data.error || "Upload failed");
        return;
      }
      
      // Reload data from API to get the full merged dataset
      const catalogRes = await api.get('/api/catalog');
      const items = Array.isArray(catalogRes.data) ? catalogRes.data : [];
      const roadmapItems = items.filter((i: any) => i.type === 'roadmapItem');
      const mapped = roadmapItems.map((r: any, idx: number) => ({ 
        id: String(r.id || r._id || `temp_${idx}`),
        sr: Number(r.sr || idx + 1), 
        trackTitle: r.trackTitle || r.title || '', 
        phase: r.phase || '', 
        eta: r.eta || 'NA' 
      }));
      
      setRoadmapData(mapped);
      try { window.dispatchEvent(new CustomEvent('catalog:changed')) } catch {}
      
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Ongoing Developments & Release Roadmap</h1>
          <p className="text-muted-foreground">
            Track the progress of ongoing developments and upcoming releases
          </p>
        </div>
        <div className="flex justify-end">
          {/* Add Roadmap button for admins */}
          {role === 'admin' && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => { setEditingItem({ sr: 0, trackTitle: '', phase: '', eta: '', eventId: '', programType: '', approvalDate: '', notes: '' }); setIsEditDialogOpen(true); }}>
                <Plus className="h-4 w-4" />
                Add Roadmap
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
            </div>
          )}
        </div>

        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Development Roadmap
            </CardTitle>
            <CardDescription>
              Current status and timeline for all development tracks and releases
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Label>Phase:</Label>
                  <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All Phases" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Phases</SelectItem>
                      <SelectItem value="Under assessment">Under assessment</SelectItem>
                      <SelectItem value="Development">Development</SelectItem>
                      <SelectItem value="Testing">Testing</SelectItem>
                      <SelectItem value="Release-ready">Release-ready</SelectItem>
                      <SelectItem value="Released">Released</SelectItem>
                      <SelectItem value="Backlog">Backlog</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Label>Sponsored by:</Label>
                  <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="All Sponsors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sponsors</SelectItem>
                      {uniqueSponsors.map(sponsor => (
                        <SelectItem key={sponsor} value={sponsor}>{sponsor}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(phaseFilter !== "all" || sponsorFilter !== "all") && (
                  <Button variant="outline" size="sm" onClick={() => { setPhaseFilter("all"); setSponsorFilter("all"); }}>
                    Clear Filters
                  </Button>
                )}
              </div>
              <ScrollArea className="h-[600px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-32">Event ID</TableHead>
                      <TableHead className="min-w-[250px]">Track Title</TableHead>
                      <TableHead className="w-40">Phase</TableHead>
                      <TableHead className="w-40">Sponsored by</TableHead>
                      <TableHead className="w-40">Target Completion</TableHead>
                      <TableHead className="w-40">Approval Month</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRoadmapData.map((track) => (
                      <TableRow 
                        key={track.id || track.sr}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => {
                          setSelectedItem(track);
                          setIsNotesDialogOpen(true);
                        }}
                      >
                        <TableCell className="font-mono text-sm">{track.eventId || '-'}</TableCell>
                        <TableCell className="font-medium">{track.trackTitle}</TableCell>
                        <TableCell>{getPhaseBadge(track.phase)}</TableCell>
                        <TableCell>
                          {track.programType ? (
                            <Badge variant="outline" className={
                              track.programType === "Program Sponsored" 
                                ? "bg-green-500/10 text-green-500 border-green-500 whitespace-nowrap" 
                                : track.programType === "Spektra Sponsored"
                                ? "bg-purple-500/10 text-purple-500 border-purple-500 whitespace-nowrap"
                                : "bg-blue-500/10 text-blue-500 border-blue-500 whitespace-nowrap"
                            }>
                              {track.programType}
                            </Badge>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.eta === "NA" ? (
                            <span className="text-gray-500">Not Available</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {track.eta}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.approvalDate ? (
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4 text-green-500" />
                              <span className="text-sm">Approved: {track.approvalDate.length === 7 ? track.approvalDate : track.approvalDate.substring(0, 7)}</span>
                            </div>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEdit(track);
                              }}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            )}
                            {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(track);
                              }}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <EntityEditDialog 
            open={isEditDialogOpen} 
            onOpenChange={setIsEditDialogOpen} 
            title={editingItem?.sr && editingItem.sr > 0 ? `Edit Roadmap: ${editingItem.trackTitle}` : 'Add Roadmap Item'} 
            saving={saving} 
            onSave={handleSaveEdit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="eventId" className="text-right">Event ID</Label>
                <Input id="eventId" value={editForm.eventId} onChange={(e) => setEditForm({ ...editForm, eventId: e.target.value })} className="col-span-3" placeholder="e.g., EVT-2025-001" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="trackTitle" className="text-right">Track Title</Label>
                <Input id="trackTitle" value={editForm.trackTitle} onChange={(e) => setEditForm({ ...editForm, trackTitle: e.target.value })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phase" className="text-right">Phase</Label>
                <Select value={editForm.phase} onValueChange={(value) => setEditForm({ ...editForm, phase: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select phase" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Under assessment">Under assessment</SelectItem>
                    <SelectItem value="Development">Development</SelectItem>
                    <SelectItem value="Testing">Testing</SelectItem>
                    <SelectItem value="Release-ready">Release-ready</SelectItem>
                    <SelectItem value="Released">Released</SelectItem>
                    <SelectItem value="Backlog">Backlog</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="programType" className="text-right">Sponsored by</Label>
                <Select value={editForm.programType} onValueChange={(value) => setEditForm({ ...editForm, programType: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select sponsor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Program Sponsored">Program Sponsored</SelectItem>
                    <SelectItem value="Spektra Sponsored">Spektra Sponsored</SelectItem>
                    <SelectItem value="Third Party (Under Budget)">Third Party (Under Budget)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="eta" className="text-right">Target Completion</Label>
                <Input id="eta" value={editForm.eta} onChange={(e) => setEditForm({ ...editForm, eta: e.target.value })} className="col-span-3" placeholder="e.g., 31st August 2025 or NA" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="approvalDate" className="text-right">Approval Month</Label>
                <Input id="approvalDate" type="month" value={editForm.approvalDate && editForm.approvalDate.length >= 7 ? editForm.approvalDate.substring(0, 7) : editForm.approvalDate || ''} onChange={(e) => setEditForm({ ...editForm, approvalDate: e.target.value })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="notes" className="text-right">Notes</Label>
                <textarea
                  id="notes"
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="col-span-3 min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Add notes about development status, blockers, or other important information..."
                />
              </div>
            </div>
          </EntityEditDialog>
        </Dialog>

        {/* Notes Popup Dialog */}
        <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{selectedItem?.trackTitle || 'Track Details'}</DialogTitle>
              <DialogDescription>
                Development notes and current status
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Event ID:</Label>
                  <span className="text-sm font-mono">{selectedItem?.eventId || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Phase:</Label>
                  {selectedItem && getPhaseBadge(selectedItem.phase)}
                </div>
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Target Completion:</Label>
                  <span className="text-sm">{selectedItem?.eta || 'NA'}</span>
                </div>
                {selectedItem?.programType && (
                  <div className="flex items-center gap-2">
                    <Label className="font-semibold">Sponsor:</Label>
                    <Badge variant="outline" className={
                      selectedItem.programType === "Program Sponsored" 
                        ? "bg-green-500/10 text-green-500 border-green-500" 
                        : selectedItem.programType === "Spektra Sponsored"
                        ? "bg-purple-500/10 text-purple-500 border-purple-500"
                        : "bg-blue-500/10 text-blue-500 border-blue-500"
                    }>
                      {selectedItem.programType}
                    </Badge>
                  </div>
                )}
                {selectedItem?.approvalDate && (
                  <div className="flex items-center gap-2">
                    <Label className="font-semibold">Approval Month:</Label>
                    <span className="text-sm">{selectedItem.approvalDate.length === 7 ? selectedItem.approvalDate : selectedItem.approvalDate.substring(0, 7)}</span>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Notes:</Label>
                <div className="rounded-md border bg-muted/50 p-4 text-sm whitespace-pre-wrap min-h-[100px]">
                  {selectedItem?.notes || 'No notes available for this track.'}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNotesDialogOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}