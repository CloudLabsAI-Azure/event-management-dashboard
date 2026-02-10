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
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar, MapPin, Edit, Trash2, Plus, Clock, MessageSquarePlus, History, Download } from "lucide-react"
import * as XLSX from 'xlsx'
import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from '@/components/AuthProvider'
import catalogService from '@/lib/services/catalogService'
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'
import { isNonEmptyString } from '@/lib/validation'
import api from "@/lib/api";
import { checkDuplicateEventId } from '@/lib/services/eventIdService'

interface ActivityLogEntry {
  date: string;
  text: string;
  addedBy?: string;
}

interface RoadmapItem {
  id?: string;
  sr: number;
  trackTitle: string;
  phase: string;
  eta: string;
  eventId?: string;
  programType?: string;
  approvalDate?: string;
  duration?: string;
  labType?: string;
  progressDeck?: string;
  notes?: string;
  activityLog?: ActivityLogEntry[];
  isUpgrade?: boolean;
}

const getPhaseBadge = (phase: string) => {
  if (phase === "Under assessment") {
    return <Badge variant="default" className="bg-amber-500 hover:bg-amber-600">Under assessment</Badge>
  } else if (phase === "In-Development") {
    return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">In-Development</Badge>
  } else if (phase === "Release-Ready") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Release-Ready</Badge>
  } else if (phase === "Released") {
    return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">Released</Badge>
  } else if (phase === "Backlog") {
    return <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600 text-white">Backlog</Badge>
  } else if (phase === "On-Hold") {
    return <Badge variant="default" className="bg-orange-600 hover:bg-orange-700">On-Hold</Badge>
  } else if (phase === "Blocked") {
    return <Badge variant="destructive" className="bg-red-600 hover:bg-red-700">Blocked</Badge>
  }
  return <Badge variant="outline">{phase}</Badge>
}

// Month options for dropdown
const monthOptions = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

// Get fiscal quarter from month number (01-12)
// Fiscal Year: Q1=Jul-Sep, Q2=Oct-Dec, Q3=Jan-Mar, Q4=Apr-Jun
const getQuarterFromMonth = (month: string): string => {
  const m = parseInt(month, 10);
  if (m >= 7 && m <= 9) return 'Q1';   // July - September
  if (m >= 10 && m <= 12) return 'Q2'; // October - December
  if (m >= 1 && m <= 3) return 'Q3';   // January - March
  if (m >= 4 && m <= 6) return 'Q4';   // April - June
  return '';
};

// Get month name from month number
const getMonthName = (month: string): string => {
  const option = monthOptions.find(m => m.value === month);
  return option ? option.label : '';
};

// Parse approvalDate to get month (format: YYYY-MM or just MM)
const parseApprovalMonth = (approvalDate: string | undefined): string => {
  if (!approvalDate) return '';
  if (approvalDate.length === 7) {
    // Format: YYYY-MM
    return approvalDate.substring(5, 7);
  }
  if (approvalDate.length === 2) {
    return approvalDate;
  }
  return '';
};

export default function RoadmapPage() {
  const [searchParams] = useSearchParams();
  const initialPhaseFilter = searchParams.get('phase') || 'all';
  
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
    duration: "",
    labType: "",
    progressDeck: "",
    notes: "",
    isUpgrade: false
  })
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvError, setCsvError] = useState("");
  
  // Filter state - initialize from URL if present
  const [phaseFilter, setPhaseFilter] = useState<string>(initialPhaseFilter);
  const [sponsorFilter, setSponsorFilter] = useState<string>("all");
  
  // Notes popup state
  const [selectedItem, setSelectedItem] = useState<RoadmapItem | null>(null);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  
  // Activity log state
  const [newUpdate, setNewUpdate] = useState("");
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [addingUpdate, setAddingUpdate] = useState(false);

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
          duration: r.duration || '',
          labType: r.labType || (r.isUpgrade ? 'Lab Upgrade' : ''),
          progressDeck: r.progressDeck || '',
          notes: r.notes || '',
          activityLog: Array.isArray(r.activityLog) ? r.activityLog : [],
          isUpgrade: r.isUpgrade || false
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
      // Auto-set eventId to TBD if empty
      const eventIdValue = editForm.eventId?.trim() || 'TBD';
      
      // Check for duplicate eventId (skip if TBD)
      if (eventIdValue && eventIdValue.toUpperCase() !== 'TBD') {
        const { isDuplicate, existsIn } = await checkDuplicateEventId(
          eventIdValue, 
          editingItem?.sr, 
          'roadmapItem'
        );
        if (isDuplicate) {
          toast({
            title: 'Duplicate Event ID',
            description: `Event ID "${eventIdValue}" already exists in: ${existsIn.join(', ')}`,
            variant: 'destructive'
          });
          return;
        }
      }
      
      const payload = { ...editForm, eventId: eventIdValue, type: 'roadmapItem' }
      console.log('Saving roadmap item:', payload) // Debug log
      
      if (editingItem && editingItem.sr && editingItem.sr > 0) {
        await catalogService.update(editingItem.sr, payload)
        setRoadmapData(prevData => prevData.map(track => track.sr === editingItem.sr ? { ...editForm, eventId: eventIdValue, id: editingItem.id } : track))
      } else {
        const resItem = await catalogService.create(payload)
        console.log('Create response:', resItem) // Debug log
        const newItem = { 
          ...editForm, 
          eventId: eventIdValue,
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

  const { userRole: role, user } = useAuth()

  // Add activity log update
  const handleAddUpdate = async () => {
    if (!selectedItem || !newUpdate.trim()) return;
    
    setAddingUpdate(true);
    try {
      const currentUser = user?.name || user?.email || user?.username || 'Unknown';
      const newEntry: ActivityLogEntry = {
        date: new Date().toISOString(),
        text: newUpdate.trim(),
        addedBy: currentUser
      };
      
      const updatedLog = [newEntry, ...(selectedItem.activityLog || [])];
      const payload = { ...selectedItem, activityLog: updatedLog, type: 'roadmapItem' };
      
      await catalogService.update(selectedItem.sr, payload);
      
      // Update local state
      const updatedItem = { ...selectedItem, activityLog: updatedLog };
      setSelectedItem(updatedItem);
      setRoadmapData(prev => prev.map(item => item.sr === selectedItem.sr ? updatedItem : item));
      setNewUpdate("");
      
      toast({ title: 'Update Added', description: 'Activity log updated successfully' });
    } catch (err) {
      console.error('Error adding update:', err);
      toast({ title: 'Error', description: 'Failed to add update', variant: 'destructive' });
    } finally {
      setAddingUpdate(false);
    }
  };

  // Format date for display
  const formatLogDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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

  // Export to Excel function
  const handleExportExcel = () => {
    // Prepare data for export
    const exportData = filteredRoadmapData.map(item => {
      const month = parseApprovalMonth(item.approvalDate);
      const quarter = month ? getQuarterFromMonth(month) : '';
      const monthName = month ? getMonthName(month) : '';
      
      return {
        'Event ID': item.eventId || '',
        'Track Title': item.trackTitle || '',
        'Type': item.labType || '',
        'Phase': item.phase || '',
        'Sponsored by': item.programType || '',
        'Target Completion': item.eta || '',
        'Duration': item.duration || '',
        'Approval Month': monthName,
        'Quarter': quarter,
        'Notes': item.notes || ''
      };
    });

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Event ID
      { wch: 50 },  // Track Title
      { wch: 20 },  // Type
      { wch: 15 },  // Phase
      { wch: 25 },  // Sponsored by
      { wch: 20 },  // Target Completion
      { wch: 10 },  // Duration
      { wch: 15 },  // Approval Month
      { wch: 10 },  // Quarter
      { wch: 50 }   // Notes
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Lab Development');
    
    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `Lab_Development_Roadmap_${date}.xlsx`;
    
    // Download
    XLSX.writeFile(wb, filename);
    
    toast({
      title: "Export Successful",
      description: `Exported ${exportData.length} items to ${filename}`,
    });
  };

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
              <Button 
                size="sm" 
                variant="outline" 
                onClick={handleExportExcel}
              >
                <Download className="h-4 w-4 mr-1" />
                Export Excel
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
            <ScrollArea className="h-[600px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-32">Event ID</TableHead>
                      <TableHead className="min-w-[250px]">Track Title</TableHead>
                      <TableHead className="w-36">Type</TableHead>
                      <TableHead className="w-48">
                        <div className="flex flex-col gap-1">
                          <span>Phase</span>
                          <Select value={phaseFilter} onValueChange={setPhaseFilter}>
                            <SelectTrigger className="h-7 text-xs font-normal">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Phases</SelectItem>
                              <SelectItem value="Under assessment">Under assessment</SelectItem>
                              <SelectItem value="In-Development">In-Development</SelectItem>
                              <SelectItem value="Testing">Testing</SelectItem>
                              <SelectItem value="Release-Ready">Release-Ready</SelectItem>
                              <SelectItem value="Released">Released</SelectItem>
                              <SelectItem value="Backlog">Backlog</SelectItem>
                              <SelectItem value="On-Hold">On-Hold</SelectItem>
                              <SelectItem value="Blocked">Blocked</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </TableHead>
                      <TableHead className="w-48">
                        <div className="flex flex-col gap-1">
                          <span>Sponsored by</span>
                          <Select value={sponsorFilter} onValueChange={setSponsorFilter}>
                            <SelectTrigger className="h-7 text-xs font-normal">
                              <SelectValue placeholder="All" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Sponsors</SelectItem>
                              {uniqueSponsors.map(sponsor => (
                                <SelectItem key={sponsor} value={sponsor!}>{sponsor}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </TableHead>
                      <TableHead className="w-32">Target Completion</TableHead>
                      <TableHead className="w-24">Duration</TableHead>
                      <TableHead className="w-32">Approval Month</TableHead>
                      <TableHead className="w-20">Quarter</TableHead>
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
                        <TableCell className="font-mono text-sm">{track.eventId || 'TBD'}</TableCell>
                        <TableCell className="font-medium">
                          {track.trackTitle}
                        </TableCell>
                        <TableCell>
                          {track.labType ? (
                            <Badge variant="outline" className={
                              track.labType === "New Lab Onboarding"
                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500 whitespace-nowrap text-xs"
                                : "bg-orange-500/10 text-orange-600 border-orange-500 whitespace-nowrap text-xs"
                            }>
                              {track.labType}
                            </Badge>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
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
                          {track.duration ? (
                            <span className="text-sm">{track.duration}</span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.approvalDate ? (
                            <span className="text-sm">
                              {getMonthName(parseApprovalMonth(track.approvalDate))}
                            </span>
                          ) : (
                            <span className="text-gray-500">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {track.approvalDate ? (
                            <Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500">
                              {getQuarterFromMonth(parseApprovalMonth(track.approvalDate))}
                            </Badge>
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
                <Input id="eventId" value={editForm.eventId} onChange={(e) => setEditForm({ ...editForm, eventId: e.target.value })} className="col-span-3" placeholder="e.g., MSXXX" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="trackTitle" className="text-right">Track Title</Label>
                <Input id="trackTitle" value={editForm.trackTitle} onChange={(e) => setEditForm({ ...editForm, trackTitle: e.target.value })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="labType" className="text-right">Type</Label>
                <Select value={editForm.labType || ''} onValueChange={(value) => setEditForm({ ...editForm, labType: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="New Lab Onboarding">New Lab Onboarding</SelectItem>
                    <SelectItem value="Lab Upgrade">Lab Upgrade</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phase" className="text-right">Phase</Label>
                <Select value={editForm.phase} onValueChange={(value) => setEditForm({ ...editForm, phase: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select phase" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Under assessment">Under assessment</SelectItem>
                    <SelectItem value="In-Development">In-Development</SelectItem>
                    <SelectItem value="Testing">Testing</SelectItem>
                    <SelectItem value="Release-Ready">Release-Ready</SelectItem>
                    <SelectItem value="Released">Released</SelectItem>
                    <SelectItem value="Backlog">Backlog</SelectItem>
                    <SelectItem value="On-Hold">On-Hold</SelectItem>
                    <SelectItem value="Blocked">Blocked</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="duration" className="text-right">Duration</Label>
                <Select value={editForm.duration || ''} onValueChange={(value) => setEditForm({ ...editForm, duration: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select duration" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1 hour">1 hour</SelectItem>
                    <SelectItem value="4 hours">4 hours</SelectItem>
                    <SelectItem value="8 hours">8 hours</SelectItem>
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
                    <SelectItem value="Third Party">Third Party</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="eta" className="text-right">Target Completion</Label>
                <Input id="eta" value={editForm.eta} onChange={(e) => setEditForm({ ...editForm, eta: e.target.value })} className="col-span-3" placeholder="e.g., 31st August 2025 or NA" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="approvalDate" className="text-right">Approval Month</Label>
                <div className="col-span-3 grid grid-cols-2 gap-2">
                  <Select 
                    value={parseApprovalMonth(editForm.approvalDate)} 
                    onValueChange={(value) => {
                      const year = new Date().getFullYear();
                      setEditForm({ ...editForm, approvalDate: `${year}-${value}` });
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Select month" /></SelectTrigger>
                    <SelectContent>
                      {monthOptions.map(m => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input 
                    value={parseApprovalMonth(editForm.approvalDate) ? getQuarterFromMonth(parseApprovalMonth(editForm.approvalDate)) : ''} 
                    placeholder="Quarter" 
                    readOnly 
                    className="bg-muted cursor-not-allowed"
                  />
                </div>
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Type</Label>
                <div className="col-span-3 flex items-center gap-2">
                  <Checkbox
                    id="isUpgrade"
                    checked={editForm.isUpgrade || false}
                    onCheckedChange={(checked) => setEditForm({ ...editForm, isUpgrade: checked === true })}
                  />
                  <Label htmlFor="isUpgrade" className="text-sm font-normal cursor-pointer">
                    Lab Upgrade
                  </Label>
                </div>
              </div>
            </div>
          </EntityEditDialog>
        </Dialog>

        {/* Notes Popup Dialog with Activity Log */}
        <Dialog open={isNotesDialogOpen} onOpenChange={(open) => {
          setIsNotesDialogOpen(open);
          if (!open) {
            setNewUpdate("");
            setShowFullHistory(false);
          }
        }}>
          <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                {selectedItem?.trackTitle || 'Track Details'}
              </DialogTitle>
              <DialogDescription>
                Development notes and activity log
              </DialogDescription>
            </DialogHeader>
            
            <div className="flex-1 overflow-y-auto min-h-0 pr-2">
              <div className="space-y-4 py-4">
              
              {/* Activity Log Timeline - FIRST */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <History className="h-4 w-4 text-violet-600" />
                    <Label className="font-semibold">Activity Log</Label>
                    {selectedItem?.activityLog && selectedItem.activityLog.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{selectedItem.activityLog.length} updates</Badge>
                    )}
                  </div>
                  {selectedItem?.activityLog && selectedItem.activityLog.length > 3 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowFullHistory(!showFullHistory)}
                      className="text-xs"
                    >
                      {showFullHistory ? 'Show Less' : 'Show All History'}
                    </Button>
                  )}
                </div>
                
                <ScrollArea className={showFullHistory ? "h-[250px]" : ""}>
                  <div className="space-y-3 pr-4">
                    {selectedItem?.activityLog && selectedItem.activityLog.length > 0 ? (
                      (showFullHistory ? selectedItem.activityLog : selectedItem.activityLog.slice(0, 3)).map((entry, idx) => (
                        <div key={idx} className="relative pl-6 pb-3 border-l-2 border-violet-200 dark:border-violet-800 last:border-transparent">
                          <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-violet-500 flex items-center justify-center">
                            <Clock className="h-2.5 w-2.5 text-white" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                              <span>{formatLogDate(entry.date)}</span>
                              {entry.addedBy && (
                                <span className="inline-flex items-center gap-1 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 px-1.5 py-0.5 rounded text-[11px] font-medium">
                                  by {entry.addedBy}
                                </span>
                              )}
                            </div>
                            <div className="text-sm bg-muted/50 rounded-md p-3 whitespace-pre-wrap">
                              {entry.text}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-muted-foreground italic py-4 text-center">
                        No activity updates yet. Add your first update below.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Add New Update Section - SECOND */}
              {role === 'admin' && (
                <div className="space-y-3 p-4 border rounded-lg bg-blue-50/50 dark:bg-blue-950/20">
                  <div className="flex items-center gap-2">
                    <MessageSquarePlus className="h-4 w-4 text-blue-600" />
                    <Label className="font-semibold text-blue-700 dark:text-blue-400">Add Update</Label>
                  </div>
                  <textarea
                    value={newUpdate}
                    onChange={(e) => setNewUpdate(e.target.value)}
                    className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                    placeholder="Add a daily update, progress note, or status change..."
                  />
                  <Button 
                    size="sm" 
                    onClick={handleAddUpdate}
                    disabled={!newUpdate.trim() || addingUpdate}
                    className="w-full"
                  >
                    {addingUpdate ? 'Adding...' : 'Add Update'}
                  </Button>
                </div>
              )}

              {/* Track Info Summary - THIRD */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <Label className="text-xs text-muted-foreground font-semibold">Track Details</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Event ID:</Label>
                    <span className="text-sm font-mono">{selectedItem?.eventId || 'TBD'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground">Target:</Label>
                    <span className="text-sm">{selectedItem?.eta || 'NA'}</span>
                  </div>
                  {selectedItem?.programType && (
                    <div className="flex items-center gap-2 col-span-2">
                      <Label className="text-xs text-muted-foreground">Sponsor:</Label>
                      <Badge variant="outline" className={
                        selectedItem.programType === "Program Sponsored" 
                          ? "bg-green-500/10 text-green-500 border-green-500 text-xs" 
                          : selectedItem.programType === "Spektra Sponsored"
                          ? "bg-purple-500/10 text-purple-500 border-purple-500 text-xs"
                          : "bg-blue-500/10 text-blue-500 border-blue-500 text-xs"
                      }>
                        {selectedItem.programType}
                      </Badge>
                    </div>
                  )}
                </div>
                
                {/* Phase Change Option */}
                <div className="flex items-center gap-3 pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">Phase:</Label>
                  {role === 'admin' ? (
                    <Select 
                      value={selectedItem?.phase || ''} 
                      onValueChange={async (value) => {
                        if (!selectedItem) return;
                        try {
                          const updatedItem = { ...selectedItem, phase: value };
                          await catalogService.update(selectedItem.sr, { ...updatedItem, type: 'roadmapItem' });
                          setRoadmapData(prev => prev.map(item => item.sr === selectedItem.sr ? updatedItem : item));
                          setSelectedItem(updatedItem);
                          toast({ title: 'Phase Updated', description: `Phase changed to ${value}` });
                        } catch (err) {
                          console.error('Error updating phase:', err);
                          toast({ title: 'Error', description: 'Failed to update phase', variant: 'destructive' });
                        }
                      }}
                    >
                      <SelectTrigger className="h-8 w-48">
                        <SelectValue placeholder="Select phase" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Under assessment">Under assessment</SelectItem>
                        <SelectItem value="In-Development">In-Development</SelectItem>
                        <SelectItem value="Testing">Testing</SelectItem>
                        <SelectItem value="Release-Ready">Release-Ready</SelectItem>
                        <SelectItem value="Released">Released</SelectItem>
                        <SelectItem value="Backlog">Backlog</SelectItem>
                        <SelectItem value="On-Hold">On-Hold</SelectItem>
                        <SelectItem value="Blocked">Blocked</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    selectedItem && getPhaseBadge(selectedItem.phase)
                  )}
                </div>
              </div>

              {/* Legacy Notes Section */}
              {selectedItem?.notes && (
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-xs text-muted-foreground">Legacy Notes:</Label>
                  <div className="rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap text-muted-foreground">
                    {selectedItem.notes}
                  </div>
                </div>
              )}
              </div>
            </div>
            
            <DialogFooter className="flex-shrink-0 border-t pt-4">
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