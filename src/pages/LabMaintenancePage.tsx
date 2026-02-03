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
import { Edit, Trash2, Plus, Clock } from "lucide-react"
import { useState, useEffect } from "react"
import { useAuth } from '@/components/AuthProvider'
import catalogService from '@/lib/services/catalogService'
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'

interface LabMaintenanceItem {
  id?: string;
  sr: number;
  trackName: string;
  sponsor: string;
  phase: string;
  thirdParty: boolean;
  notes?: string;
}

function getPhaseBadge(phase: string) {
  if (phase === "Under assessment") {
    return <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-600 border-yellow-500">Under assessment</Badge>
  } else if (phase === "Development") {
    return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">Development</Badge>
  } else if (phase === "Testing") {
    return <Badge variant="default" className="bg-orange-500 hover:bg-orange-600">Testing</Badge>
  } else if (phase === "Release-ready") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Release-ready</Badge>
  } else if (phase === "Released") {
    return <Badge variant="default" className="bg-purple-500 hover:bg-purple-600">Released</Badge>
  } else if (phase === "Backlog") {
    return <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600 text-white">Backlog</Badge>
  } else if (phase === "Completed") {
    return <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-700">Completed</Badge>
  }
  return <Badge variant="outline">{phase}</Badge>
}

export default function LabMaintenancePage() {
  const [labMaintenanceData, setLabMaintenanceData] = useState<LabMaintenanceItem[]>([]);
  const [editingLabMaintenance, setEditingLabMaintenance] = useState<LabMaintenanceItem | null>(null);
  const [isLabMaintenanceDialogOpen, setIsLabMaintenanceDialogOpen] = useState(false);
  const [labMaintenanceForm, setLabMaintenanceForm] = useState<LabMaintenanceItem>({
    sr: 0,
    trackName: "",
    sponsor: "",
    phase: "",
    thirdParty: false,
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
        
        const labMaintenanceItems = list.filter((i: any) => i.type === 'labMaintenance')
        const mapped = labMaintenanceItems.map((r: any, idx: number) => ({
          id: String(r.id || r._id || `temp_lm_${idx}`),
          sr: Number(r.sr || idx + 1),
          trackName: (r.trackName || '').trim(),
          sponsor: (r.sponsor || '').trim(),
          phase: (r.phase || '').trim(),
          thirdParty: Boolean(r.thirdParty),
          notes: r.notes || ''
        }))
        setLabMaintenanceData(mapped)
      } catch (err) {
        console.error('Error loading lab maintenance data:', err)
        toast({
          title: "Error",
          description: "Could not load lab maintenance data from server.",
          variant: "destructive"
        })
      }
    })()
    return () => { mounted = false }
  }, [])

  const handleEditLabMaintenance = (item: LabMaintenanceItem) => {
    setEditingLabMaintenance(item);
    setLabMaintenanceForm({ ...item });
    setIsLabMaintenanceDialogOpen(true);
  };

  const handleSaveLabMaintenance = async () => {
    if (!labMaintenanceForm.trackName || labMaintenanceForm.trackName.trim().length < 3) {
      throw new Error('Track name is required (min 3 chars)');
    }
    
    try {
      const payload = { ...labMaintenanceForm, type: 'labMaintenance' };
      
      if (editingLabMaintenance && editingLabMaintenance.sr && editingLabMaintenance.sr > 0) {
        await catalogService.update(editingLabMaintenance.sr, payload);
        setLabMaintenanceData(prev => prev.map(item => item.sr === editingLabMaintenance.sr ? { ...labMaintenanceForm, id: editingLabMaintenance.id } : item));
      } else {
        const resItem = await catalogService.create(payload);
        const newItem = { 
          ...labMaintenanceForm, 
          id: String(resItem?.id || resItem?._id || ''),
          sr: Number(resItem?.sr || Date.now()) 
        };
        setLabMaintenanceData(prev => [...prev, newItem]);
      }
      setIsLabMaintenanceDialogOpen(false);
      setEditingLabMaintenance(null);
      toast({ title: 'Success', description: 'Lab maintenance item saved successfully' });
    } catch (err) {
      console.error('Save error:', err);
      throw err;
    }
  };

  const handleDeleteLabMaintenance = (item: LabMaintenanceItem) => {
    if (window.confirm(`Are you sure you want to delete "${item.trackName}"?`)) {
      (async () => {
        try {
          await catalogService.remove(item.sr);
          setLabMaintenanceData(prev => prev.filter(i => i.sr !== item.sr));
          toast({ title: 'Deleted', description: 'Lab maintenance item removed successfully' });
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
          <h1 className="text-3xl font-bold text-foreground">Lab Maintenance</h1>
          <p className="text-muted-foreground">
            Track maintenance tasks for labs (Other than Trending Tracks)
          </p>
        </div>
        
        <div className="flex justify-end">
          {role === 'admin' && (
            <Button size="sm" onClick={() => { 
              setEditingLabMaintenance({ sr: 0, trackName: '', sponsor: '', phase: '', thirdParty: false, notes: '' }); 
              setLabMaintenanceForm({ sr: 0, trackName: '', sponsor: '', phase: '', thirdParty: false, notes: '' });
              setIsLabMaintenanceDialogOpen(true); 
            }}>
              <Plus className="h-4 w-4" />
              Add Lab Maintenance
            </Button>
          )}
        </div>
        
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Lab Maintenance (Other than Trending Tracks)
            </CardTitle>
            <CardDescription>
              Track maintenance tasks for labs not in Trending Tracks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px] w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-16">PO</TableHead>
                    <TableHead className="min-w-[250px]">Track Name</TableHead>
                    <TableHead className="w-48">Sponsor</TableHead>
                    <TableHead className="w-40">Phase</TableHead>
                    <TableHead className="w-32">Third Party</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {labMaintenanceData.map((item, index) => (
                    <TableRow key={`${item.id || item.sr}-${index}`}>
                      <TableCell className="font-mono text-sm">{item.sr}</TableCell>
                      <TableCell className="font-medium">{item.trackName}</TableCell>
                      <TableCell>{item.sponsor || '-'}</TableCell>
                      <TableCell>{getPhaseBadge(item.phase)}</TableCell>
                      <TableCell>
                        <Badge variant={item.thirdParty ? "default" : "secondary"}>
                          {item.thirdParty ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEditLabMaintenance(item)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteLabMaintenance(item)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {labMaintenanceData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No lab maintenance items found. Click "Add Lab Maintenance" to create one.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
        
        {/* Lab Maintenance Edit Dialog */}
        <Dialog open={isLabMaintenanceDialogOpen} onOpenChange={setIsLabMaintenanceDialogOpen}>
          <EntityEditDialog 
            open={isLabMaintenanceDialogOpen} 
            onOpenChange={setIsLabMaintenanceDialogOpen} 
            title={editingLabMaintenance?.sr && editingLabMaintenance.sr > 0 ? `Edit Lab Maintenance: ${editingLabMaintenance.trackName}` : 'Add Lab Maintenance Item'} 
            saving={saving} 
            onSave={handleSaveLabMaintenance}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lm-trackName" className="text-right">Track Name</Label>
                <Input id="lm-trackName" value={labMaintenanceForm.trackName} onChange={(e) => setLabMaintenanceForm({ ...labMaintenanceForm, trackName: e.target.value })} className="col-span-3" placeholder="Enter track name" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lm-sponsor" className="text-right">Sponsor</Label>
                <Input id="lm-sponsor" value={labMaintenanceForm.sponsor} onChange={(e) => setLabMaintenanceForm({ ...labMaintenanceForm, sponsor: e.target.value })} className="col-span-3" placeholder="Enter sponsor name" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lm-phase" className="text-right">Phase</Label>
                <Select value={labMaintenanceForm.phase} onValueChange={(value) => setLabMaintenanceForm({ ...labMaintenanceForm, phase: value })}>
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
                <Label htmlFor="lm-thirdParty" className="text-right">Third Party</Label>
                <Select value={labMaintenanceForm.thirdParty ? "yes" : "no"} onValueChange={(value) => setLabMaintenanceForm({ ...labMaintenanceForm, thirdParty: value === "yes" })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="lm-notes" className="text-right">Notes</Label>
                <textarea
                  id="lm-notes"
                  value={labMaintenanceForm.notes || ''}
                  onChange={(e) => setLabMaintenanceForm({ ...labMaintenanceForm, notes: e.target.value })}
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
