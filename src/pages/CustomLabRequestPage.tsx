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
import { Edit, Trash2, Plus } from "lucide-react"
import { useState, useEffect } from "react"
import { useAuth } from '@/components/AuthProvider'
import catalogService from '@/lib/services/catalogService'
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'

interface CustomLabRequest {
  id?: string;
  sr: number;
  eventId: string;
  eventDate?: string;
  trackTitle: string;
  sponsor: string;
  frequency: 'One Time' | 'Recurring';
  moveToRegularCatalog: 'Yes' | 'No' | 'TBD';
  holLabRequested: 'Yes' | 'No';
  notes?: string;
}

export default function CustomLabRequestPage() {
  const [customLabData, setCustomLabData] = useState<CustomLabRequest[]>([]);
  const [editingCustomLab, setEditingCustomLab] = useState<CustomLabRequest | null>(null);
  const [isCustomLabDialogOpen, setIsCustomLabDialogOpen] = useState(false);
  const [customLabForm, setCustomLabForm] = useState<CustomLabRequest>({
    sr: 0,
    eventId: "",
    eventDate: "",
    trackTitle: "",
    sponsor: "",
    frequency: "One Time",
    moveToRegularCatalog: "TBD",
    holLabRequested: "No",
    notes: ""
  });
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const { userRole: role } = useAuth()
  
  // Notes popup state
  const [selectedItem, setSelectedItem] = useState<CustomLabRequest | null>(null);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);

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
          frequency: r.frequency || 'One Time',
          moveToRegularCatalog: r.moveToRegularCatalog || 'TBD',
          holLabRequested: r.holLabRequested || 'No',
          notes: r.notes || ''
        }))
        setCustomLabData(mapped)
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

  const handleEditCustomLab = (item: CustomLabRequest) => {
    setEditingCustomLab(item);
    setCustomLabForm({ ...item });
    setIsCustomLabDialogOpen(true);
  };

  const handleSaveCustomLab = async () => {
    if (!customLabForm.eventId || customLabForm.eventId.trim().length < 1) {
      throw new Error('Event ID is required');
    }
    
    try {
      const payload = { ...customLabForm, type: 'customLabRequest' };
      
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Custom Lab Requests</h1>
          <p className="text-muted-foreground">
            Track custom lab requests and their status
          </p>
        </div>
        
        <div className="flex justify-end">
          {role === 'admin' && (
            <Button size="sm" onClick={() => { 
              setEditingCustomLab({ sr: 0, eventId: '', trackTitle: '', sponsor: '', frequency: 'One Time', moveToRegularCatalog: 'TBD', holLabRequested: 'No', notes: '' }); 
              setCustomLabForm({ sr: 0, eventId: '', trackTitle: '', sponsor: '', frequency: 'One Time', moveToRegularCatalog: 'TBD', holLabRequested: 'No', notes: '' });
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
            <ScrollArea className="h-[500px] w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-40">Event ID</TableHead>
                    <TableHead className="w-32">Event Date</TableHead>
                    <TableHead className="min-w-[200px]">Track Title</TableHead>
                    <TableHead className="w-48">Sponsor</TableHead>
                    <TableHead className="w-32">HOL Lab Requested</TableHead>
                    <TableHead className="w-32">Frequency</TableHead>
                    <TableHead className="w-48">Move to Regular Catalog</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customLabData.map((item, index) => (
                    <TableRow 
                      key={`${item.id || item.sr}-${index}`}
                      className="cursor-pointer hover:bg-muted/50"
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
                            item.sponsor === "Program Sponsored" 
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
                  {customLabData.length === 0 && (
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
                    <SelectItem value="Program Sponsored">Program Sponsored</SelectItem>
                    <SelectItem value="Spektra Sponsored">Spektra Sponsored</SelectItem>
                    <SelectItem value="Third Party">Third Party</SelectItem>
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
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>{selectedItem?.trackTitle || 'Custom Lab Request Details'}</DialogTitle>
              <DialogDescription>
                Request details and notes
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
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
                      selectedItem.sponsor === "Program Sponsored" 
                        ? "bg-green-500/10 text-green-500 border-green-500" 
                        : selectedItem.sponsor === "Spektra Sponsored"
                        ? "bg-purple-500/10 text-purple-500 border-purple-500"
                        : "bg-blue-500/10 text-blue-500 border-blue-500"
                    }>
                      {selectedItem.sponsor}
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
                <div className="rounded-md border bg-muted/50 p-4 text-sm whitespace-pre-wrap min-h-[100px]">
                  {selectedItem?.notes || 'No notes available for this request.'}
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
