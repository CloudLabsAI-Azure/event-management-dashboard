import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog } from "@/components/ui/dialog"
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
  sponsorDetails: string;
  frequency: 'One Time' | 'Recurring';
  moveToRegularCatalog: 'Yes' | 'No' | 'TBD';
  notes?: string;
}

export default function CustomLabRequestPage() {
  const [customLabData, setCustomLabData] = useState<CustomLabRequest[]>([]);
  const [editingCustomLab, setEditingCustomLab] = useState<CustomLabRequest | null>(null);
  const [isCustomLabDialogOpen, setIsCustomLabDialogOpen] = useState(false);
  const [customLabForm, setCustomLabForm] = useState<CustomLabRequest>({
    sr: 0,
    eventId: "",
    sponsorDetails: "",
    frequency: "One Time",
    moveToRegularCatalog: "TBD",
    notes: ""
  });
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const { userRole: role } = useAuth()

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
          sponsorDetails: (r.sponsorDetails || '').trim(),
          frequency: r.frequency || 'One Time',
          moveToRegularCatalog: r.moveToRegularCatalog || 'TBD',
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
              setEditingCustomLab({ sr: 0, eventId: '', sponsorDetails: '', frequency: 'One Time', moveToRegularCatalog: 'TBD', notes: '' }); 
              setCustomLabForm({ sr: 0, eventId: '', sponsorDetails: '', frequency: 'One Time', moveToRegularCatalog: 'TBD', notes: '' });
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
                    <TableHead className="w-16">Sr#</TableHead>
                    <TableHead className="w-40">Event ID</TableHead>
                    <TableHead className="min-w-[200px]">Sponsor Details</TableHead>
                    <TableHead className="w-32">Frequency</TableHead>
                    <TableHead className="w-48">Move to Regular Catalog</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customLabData.map((item, index) => (
                    <TableRow key={`${item.id || item.sr}-${index}`}>
                      <TableCell className="font-mono text-sm">{item.sr}</TableCell>
                      <TableCell className="font-mono">{item.eventId}</TableCell>
                      <TableCell className="font-medium">{item.sponsorDetails}</TableCell>
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
                              onClick={() => handleEditCustomLab(item)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteCustomLab(item)}
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
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
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
                <Label htmlFor="cl-sponsorDetails" className="text-right">Sponsor Details</Label>
                <Input id="cl-sponsorDetails" value={customLabForm.sponsorDetails} onChange={(e) => setCustomLabForm({ ...customLabForm, sponsorDetails: e.target.value })} className="col-span-3" placeholder="Enter sponsor details" />
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
      </div>
    </DashboardLayout>
  )
}
