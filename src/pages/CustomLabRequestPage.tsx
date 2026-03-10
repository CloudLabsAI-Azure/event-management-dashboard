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
import { Edit, Trash2, Plus, Download, Clock, History, MessageSquarePlus, Search, AlertTriangle } from "lucide-react"
import * as XLSX from 'xlsx'
import { useState, useEffect } from "react"
import { useSearchParams } from "react-router-dom"
import { useAuth } from '@/components/AuthProvider'
import catalogService from '@/lib/services/catalogService'
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'
import { checkDuplicateEventId } from '@/lib/services/eventIdService'
import { useDirtyFields } from '@/hooks/use-dirty-fields'

interface ActivityLogEntry {
  date: string;
  text: string;
  addedBy?: string;
}

type CustomLabPhase = 'Under assessment' | 'In-Development' | 'Testing' | 'Release-Ready' | 'Released' | 'Backlog' | 'On-Hold' | 'Blocked' | string;

interface CustomLabRequest {
  id?: string;
  sr: number;
  eventId: string;
  eventDate?: string;
  trackTitle: string;
  sponsor: string;
  phase?: CustomLabPhase;
  frequency: 'One Time' | 'Recurring';
  moveToRegularCatalog: 'Yes' | 'No' | 'TBD';
  holLabRequested: 'Yes' | 'No';
  notes?: string;
  activityLog?: ActivityLogEntry[];
}

function phaseBadge(phase: string) {
  const cls: Record<string, string> = {
    'Under assessment': 'bg-amber-500 hover:bg-amber-600',
    'In-Development': 'bg-blue-500 hover:bg-blue-600',
    'Testing': 'bg-cyan-500 hover:bg-cyan-600',
    'Release-Ready': 'bg-green-500 hover:bg-green-600',
    'Released': 'bg-purple-500 hover:bg-purple-600',
    'Backlog': 'bg-gray-500 hover:bg-gray-600 text-white',
    'On-Hold': 'bg-orange-600 hover:bg-orange-700',
    'Blocked': 'bg-red-600 hover:bg-red-700',
  }
  return cls[phase] || 'bg-gray-400 hover:bg-gray-500'
}

const STALE_DAYS = 7;
/** Check if an item has had no activity log update in STALE_DAYS */
function isItemStale(item: CustomLabRequest): boolean {
  const phase = (item.phase || '').toLowerCase();
  if (phase === 'released' || phase === 'completed') return false;
  let lastDate: Date | null = null;
  if (Array.isArray(item.activityLog) && item.activityLog.length > 0) {
    const newest = item.activityLog[0];
    if (newest?.date) lastDate = new Date(newest.date);
  }
  if (!lastDate && item.notes) {
    const m = item.notes.match(/^(\d{4}\/\d{2}\/\d{2})/);
    if (m) lastDate = new Date(m[1].replace(/\//g, '-'));
  }
  const daysSince = lastDate
    ? Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24))
    : 999;
  return daysSince >= STALE_DAYS;
}

export default function CustomLabRequestPage() {
  const [searchParams] = useSearchParams();
  const [customLabData, setCustomLabData] = useState<CustomLabRequest[]>([]);
  const [editingCustomLab, setEditingCustomLab] = useState<CustomLabRequest | null>(null);
  const [isCustomLabDialogOpen, setIsCustomLabDialogOpen] = useState(false);
  const [customLabForm, setCustomLabForm] = useState<CustomLabRequest>({
    sr: 0,
    eventId: "",
    eventDate: "",
    trackTitle: "",
    sponsor: "",
    phase: "Under assessment",
    frequency: "One Time",
    moveToRegularCatalog: "TBD",
    holLabRequested: "No",
    notes: ""
  });
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const { userRole: role, user } = useAuth()
  
  // Notes popup state
  const [selectedItem, setSelectedItem] = useState<CustomLabRequest | null>(null);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);

  // Activity log state
  const [newUpdate, setNewUpdate] = useState("");
  const [addingUpdate, setAddingUpdate] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");

  // Export to Excel function
  const handleExportExcel = () => {
    // Prepare data for export
    const exportData = customLabData.map(item => ({
      'Event ID': item.eventId || '',
      'Event Date': item.eventDate || '',
      'Track Title': item.trackTitle || '',
      'Sponsor': item.sponsor || '',
      'Phase': item.phase || '',
      'HOL Lab Requested': item.holLabRequested || '',
      'Frequency': item.frequency || '',
      'Move to Regular Catalog': item.moveToRegularCatalog || '',
      'Notes': item.notes || ''
    }));

    // Create workbook and worksheet
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 },  // Event ID
      { wch: 12 },  // Event Date
      { wch: 50 },  // Track Title
      { wch: 30 },  // Sponsor
      { wch: 18 },  // Phase
      { wch: 18 },  // HOL Lab Requested
      { wch: 12 },  // Frequency
      { wch: 22 },  // Move to Regular Catalog
      { wch: 50 }   // Notes
    ];
    
    XLSX.utils.book_append_sheet(wb, ws, 'Custom Lab Requests');
    
    // Generate filename with date
    const date = new Date().toISOString().split('T')[0];
    const filename = `Custom_Lab_Requests_${date}.xlsx`;
    
    // Download
    XLSX.writeFile(wb, filename);
    
    toast({
      title: "Export Successful",
      description: `Exported ${exportData.length} items to ${filename}`,
    });
  };

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await catalogService.list()
        if (!mounted) return
        
        const customLabItems = list.filter((i: any) => i.type === 'customLabRequest')
        const mapped = customLabItems.map((r: any, idx: number) => ({
          id: String(r.id || r._id || `temp_cl_${idx}`),
          sr: Number(r.sr || idx + 1),
          eventId: (r.eventId || '').trim(),
          eventDate: r.eventDate || '',
          trackTitle: (r.trackTitle || r.sponsorDetails || '').trim(),
          sponsor: (r.sponsor || '').trim(),
          phase: r.phase || '',
          frequency: r.frequency || 'One Time',
          moveToRegularCatalog: r.moveToRegularCatalog || 'TBD',
          holLabRequested: r.holLabRequested || 'No',
          notes: r.notes || '',
          activityLog: Array.isArray(r.activityLog) ? r.activityLog : [],
        }))
        setCustomLabData(mapped)

        // Auto-open activity log if ?sr= is in URL
        const srParam = searchParams.get('sr');
        if (srParam) {
          const target = mapped.find((r: CustomLabRequest) => String(r.sr) === srParam);
          if (target) {
            setSelectedItem(target);
            setIsNotesDialogOpen(true);
          }
        }
      } catch (err) {
        console.error('Error loading custom lab request data:', err)
        toast({
          title: "Error",
          description: "Could not load custom lab request data from server.",
          variant: "destructive"
        })
      }
    })()
    return () => { mounted = false }
  }, [])

  const dirty = useDirtyFields<CustomLabRequest>()

  const handleEditCustomLab = (item: CustomLabRequest) => {
    setEditingCustomLab(item);
    setCustomLabForm({ ...item });
    dirty.initOriginal(item);
    setIsCustomLabDialogOpen(true);
  };

  const handleSaveCustomLab = async () => {
    if (!customLabForm.eventId || customLabForm.eventId.trim().length < 1) {
      throw new Error('Event ID is required');
    }
    
    // Check for duplicate eventId
    const { isDuplicate, existsIn } = await checkDuplicateEventId(
      customLabForm.eventId, 
      editingCustomLab?.sr, 
      'customLabRequest'
    );
    if (isDuplicate) {
      toast({
        title: 'Duplicate Event ID',
        description: `Event ID "${customLabForm.eventId}" already exists in: ${existsIn.join(', ')}`,
        variant: 'destructive'
      });
      return;
    }
    
    try {
      const payload = { ...dirty.getDirtyPayload(customLabForm), type: 'customLabRequest' };
      
      if (editingCustomLab && editingCustomLab.sr && editingCustomLab.sr > 0) {
        await catalogService.update(editingCustomLab.sr, payload);
        setCustomLabData(prev => prev.map(item => item.sr === editingCustomLab.sr ? { ...customLabForm, id: editingCustomLab.id } : item));
      } else {
        const resItem = await catalogService.create(payload);
        const newItem = { 
          ...customLabForm, 
          id: String(resItem?.id || resItem?._id || ''),
          sr: Number(resItem?.sr || Date.now()) 
        };
        setCustomLabData(prev => [...prev, newItem]);
      }
      setIsCustomLabDialogOpen(false);
      setEditingCustomLab(null);
      toast({ title: 'Success', description: 'Custom lab request saved successfully' });
    } catch (err) {
      console.error('Save error:', err);
      throw err;
    }
  };

  const handleDeleteCustomLab = (item: CustomLabRequest) => {
    if (window.confirm(`Are you sure you want to delete custom lab request for "${item.eventId}"?`)) {
      (async () => {
        try {
          await catalogService.remove(item.sr);
          setCustomLabData(prev => prev.filter(i => i.sr !== item.sr));
          toast({ title: 'Deleted', description: 'Custom lab request removed successfully' });
        } catch (err) {
          console.error('Delete error:', err);
          toast({ title: 'Delete failed', description: err instanceof Error ? err.message : 'Could not delete item', variant: 'destructive' });
        }
      })();
    }
  };

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
      const payload = { ...selectedItem, activityLog: updatedLog, type: 'customLabRequest' };
      
      await catalogService.update(selectedItem.sr, payload);
      
      const updatedItem = { ...selectedItem, activityLog: updatedLog };
      setSelectedItem(updatedItem);
      setCustomLabData(prev => prev.map(item => item.sr === selectedItem.sr ? updatedItem : item));
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

  // Filtered data based on search, sorted: upcoming events first (nearest future date on top), then past events (most recent past first), no-date at bottom
  const filteredCustomLabData = customLabData.filter(item => {
    const query = searchQuery.toLowerCase();
    if (!query) return true;
    return (item.eventId || '').toLowerCase().includes(query) ||
      (item.trackTitle || '').toLowerCase().includes(query) ||
      (item.sponsor || '').toLowerCase().includes(query) ||
      (item.notes || '').toLowerCase().includes(query) ||
      (item.frequency || '').toLowerCase().includes(query);
  }).sort((a, b) => {
    const now = Date.now();
    const dateA = a.eventDate ? new Date(a.eventDate).getTime() : NaN;
    const dateB = b.eventDate ? new Date(b.eventDate).getTime() : NaN;
    const aHasDate = !isNaN(dateA);
    const bHasDate = !isNaN(dateB);
    // No-date items go to the very bottom
    if (!aHasDate && !bHasDate) return 0;
    if (!aHasDate) return 1;
    if (!bHasDate) return -1;
    const aUpcoming = dateA >= now;
    const bUpcoming = dateB >= now;
    // Upcoming before past
    if (aUpcoming && !bUpcoming) return -1;
    if (!aUpcoming && bUpcoming) return 1;
    // Both upcoming: nearest date first (ascending)
    if (aUpcoming && bUpcoming) return dateA - dateB;
    // Both past: most recent first (descending)
    return dateB - dateA;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Custom Lab Requests</h1>
          <p className="text-muted-foreground">
            Track custom lab requests and their status
            {(() => { const staleCount = customLabData.filter(isItemStale).length; return staleCount > 0 ? (<span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium"><AlertTriangle className="h-3.5 w-3.5" />{staleCount} stale</span>) : null; })()}
          </p>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={handleExportExcel}
          >
            <Download className="h-4 w-4 mr-1" />
            Export Excel
          </Button>
          {role === 'admin' && (
            <Button size="sm" onClick={() => { 
              setEditingCustomLab({ sr: 0, eventId: '', trackTitle: '', sponsor: '', phase: 'Under assessment', frequency: 'One Time', moveToRegularCatalog: 'TBD', holLabRequested: 'No', notes: '' }); 
              setCustomLabForm({ sr: 0, eventId: '', trackTitle: '', sponsor: '', phase: 'Under assessment', frequency: 'One Time', moveToRegularCatalog: 'TBD', holLabRequested: 'No', notes: '' });
              setIsCustomLabDialogOpen(true); 
            }}>
              <Plus className="h-4 w-4" />
              Add Custom Lab Request
            </Button>
          )}
        </div>
        
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Custom Lab Requests
            </CardTitle>
            <CardDescription>
              Track custom lab requests and their status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by event ID, title, sponsor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              {searchQuery && (
                <Badge variant="secondary" className="text-xs">
                  {filteredCustomLabData.length} result{filteredCustomLabData.length !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            <ScrollArea className="h-[500px] w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-40">Event ID</TableHead>
                    <TableHead className="w-32">Event Date</TableHead>
                    <TableHead className="min-w-[200px]">Track Title</TableHead>
                    <TableHead className="w-48">Sponsor</TableHead>
                    <TableHead className="w-36">Phase</TableHead>
                    <TableHead className="w-32">HOL Lab Requested</TableHead>
                    <TableHead className="w-32">Frequency</TableHead>
                    <TableHead className="w-48">Move to Regular Catalog</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomLabData.map((item, index) => (
                    <TableRow 
                      key={`${item.id || item.sr}-${index}`}
                      className={`cursor-pointer hover:bg-muted/50 ${isItemStale(item) ? 'border-l-4 border-l-amber-400 bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                      onClick={() => {
                        setSelectedItem(item);
                        setIsNotesDialogOpen(true);
                      }}
                    >
                      <TableCell className="font-mono">{item.eventId}</TableCell>
                      <TableCell className="text-sm">
                        {item.eventDate ? new Date(item.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'}
                      </TableCell>
                      <TableCell className="font-medium">{item.trackTitle}</TableCell>
                      <TableCell>
                        {item.sponsor ? (
                          <Badge variant="outline" className={
                            item.sponsor.startsWith("Program Sponsored") 
                              ? "bg-green-500/10 text-green-500 border-green-500 whitespace-nowrap" 
                              : item.sponsor === "Spektra Sponsored"
                              ? "bg-purple-500/10 text-purple-500 border-purple-500 whitespace-nowrap"
                              : "bg-blue-500/10 text-blue-500 border-blue-500 whitespace-nowrap"
                          }>
                            {item.sponsor}
                          </Badge>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {item.phase ? (
                          <Badge variant="default" className={phaseBadge(item.phase)}>
                            {item.phase}
                          </Badge>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.holLabRequested === 'Yes' ? "default" : "secondary"} className={item.holLabRequested === 'Yes' ? "bg-blue-500 hover:bg-blue-600" : ""}>
                          {item.holLabRequested}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.frequency === 'Recurring' ? "default" : "secondary"}>
                          {item.frequency}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          item.moveToRegularCatalog === 'Yes' ? "default" : 
                          item.moveToRegularCatalog === 'No' ? "destructive" : "secondary"
                        } className={
                          item.moveToRegularCatalog === 'Yes' ? "bg-green-500 hover:bg-green-600" : ""
                        }>
                          {item.moveToRegularCatalog}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditCustomLab(item);
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
                                handleDeleteCustomLab(item);
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
                  {filteredCustomLabData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No custom lab requests found. Click "Add Custom Lab Request" to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
        
        {/* Custom Lab Request Edit Dialog */}
        <Dialog open={isCustomLabDialogOpen} onOpenChange={setIsCustomLabDialogOpen}>
          <EntityEditDialog 
            open={isCustomLabDialogOpen} 
            onOpenChange={setIsCustomLabDialogOpen} 
            title={editingCustomLab?.sr && editingCustomLab.sr > 0 ? `Edit Custom Lab Request: ${editingCustomLab.eventId}` : 'Add Custom Lab Request'} 
            saving={saving} 
            onSave={handleSaveCustomLab}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-eventId" className="text-right">Event ID</Label>
                <Input id="cl-eventId" value={customLabForm.eventId} onChange={(e) => setCustomLabForm({ ...customLabForm, eventId: e.target.value })} className="col-span-3" placeholder="e.g., EVT-2025-001" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-eventDate" className="text-right">Event Date</Label>
                <Input id="cl-eventDate" type="date" value={customLabForm.eventDate || ''} onChange={(e) => setCustomLabForm({ ...customLabForm, eventDate: e.target.value })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-trackTitle" className="text-right">Track Title</Label>
                <Input id="cl-trackTitle" value={customLabForm.trackTitle} onChange={(e) => setCustomLabForm({ ...customLabForm, trackTitle: e.target.value })} className="col-span-3" placeholder="Enter track title" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-sponsor" className="text-right">Sponsor</Label>
                <Select value={customLabForm.sponsor} onValueChange={(value) => setCustomLabForm({ ...customLabForm, sponsor: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select sponsor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Program Sponsored - CAIP">Program Sponsored - CAIP</SelectItem>
                    <SelectItem value="Program Sponsored - ABS">Program Sponsored - ABS</SelectItem>
                    <SelectItem value="Program Sponsored - Security">Program Sponsored - Security</SelectItem>
                    <SelectItem value="Spektra Sponsored">Spektra Sponsored</SelectItem>
                    <SelectItem value="Third Party">Third Party</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-phase" className="text-right">Phase</Label>
                <Select value={customLabForm.phase || 'Under assessment'} onValueChange={(value) => setCustomLabForm({ ...customLabForm, phase: value })}>
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
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-holLabRequested" className="text-right">HOL Lab Requested</Label>
                <Select value={customLabForm.holLabRequested} onValueChange={(value: 'Yes' | 'No') => setCustomLabForm({ ...customLabForm, holLabRequested: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-frequency" className="text-right">Frequency</Label>
                <Select value={customLabForm.frequency} onValueChange={(value: 'One Time' | 'Recurring') => setCustomLabForm({ ...customLabForm, frequency: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select frequency" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="One Time">One Time</SelectItem>
                    <SelectItem value="Recurring">Recurring</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-moveToRegular" className="text-right">Move to Regular Catalog</Label>
                <Select value={customLabForm.moveToRegularCatalog} onValueChange={(value: 'Yes' | 'No' | 'TBD') => setCustomLabForm({ ...customLabForm, moveToRegularCatalog: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                    <SelectItem value="TBD">TBD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="cl-notes" className="text-right">Notes</Label>
                <textarea
                  id="cl-notes"
                  value={customLabForm.notes || ''}
                  onChange={(e) => setCustomLabForm({ ...customLabForm, notes: e.target.value })}
                  className="col-span-3 min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  placeholder="Add notes..."
                />
              </div>
            </div>
          </EntityEditDialog>
        </Dialog>
        
        {/* Notes Popup Dialog */}
        <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle>{selectedItem?.trackTitle || 'Custom Lab Request Details'}</DialogTitle>
              <DialogDescription>
                Request details and notes
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
                
                <ScrollArea className={showFullHistory ? "h-[200px]" : ""}>
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
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
                    placeholder="Add a progress note, status update, or comment..."
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

              {/* Request Details - THIRD */}
              <div className="space-y-3 p-3 bg-muted/30 rounded-lg">
                <Label className="text-xs text-muted-foreground font-semibold">Request Details</Label>
                <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Event ID:</Label>
                  <span className="text-sm font-mono">{selectedItem?.eventId || '-'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Track Title:</Label>
                  <span className="text-sm">{selectedItem?.trackTitle || '-'}</span>
                </div>
                {selectedItem?.sponsor && (
                  <div className="flex items-center gap-2">
                    <Label className="font-semibold">Sponsor:</Label>
                    <Badge variant="outline" className={
                      selectedItem.sponsor.startsWith("Program Sponsored") 
                        ? "bg-green-500/10 text-green-500 border-green-500" 
                        : selectedItem.sponsor === "Spektra Sponsored"
                        ? "bg-purple-500/10 text-purple-500 border-purple-500"
                        : "bg-blue-500/10 text-blue-500 border-blue-500"
                    }>
                      {selectedItem.sponsor}
                    </Badge>
                  </div>
                )}
                {selectedItem?.phase && (
                  <div className="flex items-center gap-2">
                    <Label className="font-semibold">Phase:</Label>
                    <Badge variant="default" className={phaseBadge(selectedItem.phase)}>
                      {selectedItem.phase}
                    </Badge>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">HOL Lab Requested:</Label>
                  <Badge variant={selectedItem?.holLabRequested === 'Yes' ? "default" : "secondary"} className={selectedItem?.holLabRequested === 'Yes' ? "bg-blue-500" : ""}>
                    {selectedItem?.holLabRequested || 'No'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Frequency:</Label>
                  <Badge variant={selectedItem?.frequency === 'Recurring' ? "default" : "secondary"}>
                    {selectedItem?.frequency || 'One Time'}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Label className="font-semibold">Move to Regular Catalog:</Label>
                  <Badge variant={
                    selectedItem?.moveToRegularCatalog === 'Yes' ? "default" : 
                    selectedItem?.moveToRegularCatalog === 'No' ? "destructive" : "secondary"
                  } className={selectedItem?.moveToRegularCatalog === 'Yes' ? "bg-green-500" : ""}>
                    {selectedItem?.moveToRegularCatalog || 'TBD'}
                  </Badge>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="font-semibold">Notes:</Label>
                <div className="rounded-md border bg-muted/50 p-4 text-sm whitespace-pre-wrap min-h-[60px]">
                  {selectedItem?.notes || 'No notes available for this request.'}
                </div>
              </div>
              </div>
            </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsNotesDialogOpen(false);
                setNewUpdate("");
                setShowFullHistory(false);
              }}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
