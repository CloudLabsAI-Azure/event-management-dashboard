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
import { useState, useEffect } from "react"
import { useAuth } from '@/components/AuthProvider'
import catalogService from '@/lib/services/catalogService'
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'
import { isNonEmptyString } from '@/lib/validation'

interface RoadmapItem {
  id: number;
  trackTitle: string;
  phase: string;
  eta: string;
}

const initialRoadmapData: RoadmapItem[] = [
  { id: 1, trackTitle: "GitHub Enterprise Admin Lab", phase: "Development", eta: "31st August 2025" },
  { id: 2, trackTitle: "GitHub Advanced Lab", phase: "Development", eta: "31st August 2025" },
  { id: 3, trackTitle: "Vibe Coding", phase: "Development", eta: "31st August 2025" },
  { id: 4, trackTitle: "Postgres SQL and SK Agents", phase: "Release-ready", eta: "NA" },
  { id: 5, trackTitle: "Low Code Open Hack", phase: "Backlog", eta: "NA" },
  { id: 6, trackTitle: "Serverless Hack", phase: "Backlog", eta: "NA" },
  { id: 7, trackTitle: "Azure Landing Zone", phase: "Backlog", eta: "NA" }
]

const getPhaseBadge = (phase: string) => {
  if (phase === "Development") {
    return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">Development</Badge>
  } else if (phase === "Release-ready") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Release-ready</Badge>
  } else if (phase === "Backlog") {
    return <Badge variant="secondary" className="bg-gray-500 hover:bg-gray-600 text-white">Backlog</Badge>
  }
  return <Badge variant="outline">{phase}</Badge>
}

export default function RoadmapPage() {
  const [roadmapData, setRoadmapData] = useState<RoadmapItem[]>(initialRoadmapData)
  const [editingItem, setEditingItem] = useState<RoadmapItem | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<RoadmapItem>({
    id: 0,
    trackTitle: "",
    phase: "",
    eta: ""
  })
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const list = await catalogService.list()
        if (!mounted) return
        console.log('Catalog list:', list) // Debug log
        const roadmapItems = list.filter((i: any) => i.type === 'roadmapItem')
        console.log('Filtered roadmap items:', roadmapItems) // Debug log
        if (roadmapItems.length === 0) {
          // If no roadmap items exist, use initial data
          setRoadmapData(initialRoadmapData)
        } else {
          setRoadmapData(roadmapItems.map((r: any, idx: number) => ({ 
            id: Number(r.sr || r.id || idx + 1), 
            trackTitle: r.trackTitle || r.title || '', 
            phase: r.phase || '', 
            eta: r.eta || 'NA' 
          })))
        }
      } catch (err) {
        console.error('Error loading roadmap data:', err)
        // Use initial data as fallback
        setRoadmapData(initialRoadmapData)
        toast({
          title: "Warning",
          description: "Could not load roadmap data from server. Using default data.",
          variant: "default"
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
      
      if (editingItem && editingItem.id && editingItem.id > 0) {
        await catalogService.update(editingItem.id, payload)
        setRoadmapData(prevData => prevData.map(track => track.id === editingItem.id ? { ...editForm } : track))
      } else {
        const resItem = await catalogService.create(payload)
        console.log('Create response:', resItem) // Debug log
        const newItem = { ...editForm, id: Number(resItem && (resItem.sr || resItem.id) || Date.now()) }
        setRoadmapData(prev => [...prev, newItem])
      }
      setIsEditDialogOpen(false)
      setEditingItem(null)
    } catch (err) {
      console.error('Save error:', err)
      throw err // Re-throw to let EntityEditDialog handle the error display
    }
  }

  const handleCancelEdit = () => {
    setIsEditDialogOpen(false)
    setEditingItem(null)
    setEditForm({
      id: 0,
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
          if (item.id) await catalogService.remove(item.id)
          setRoadmapData(prevData => prevData.filter(track => track.id !== item.id))
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
            <Button size="sm" onClick={() => { setEditingItem({ id: 0, trackTitle: '', phase: '', eta: '' }); setIsEditDialogOpen(true); }}>
              <Plus className="h-4 w-4" />
              Add Roadmap
            </Button>
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
              <ScrollArea className="h-[600px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="min-w-[300px]">Track Title</TableHead>
                      <TableHead className="w-40">Phase</TableHead>
                      <TableHead className="w-40">ETA</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roadmapData.map((track) => (
                      <TableRow key={track.id}>
                        <TableCell className="font-medium">{track.trackTitle}</TableCell>
                        <TableCell>{getPhaseBadge(track.phase)}</TableCell>
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(track)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            )}
                            {role === 'admin' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(track)}
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
            title={editingItem?.id ? `Edit Roadmap: ${editingItem.trackTitle}` : 'Add Roadmap Item'} 
            saving={saving} 
            onSave={handleSaveEdit}>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="trackTitle" className="text-right">Track Title</Label>
                <Input id="trackTitle" value={editForm.trackTitle} onChange={(e) => setEditForm({ ...editForm, trackTitle: e.target.value })} className="col-span-3" />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phase" className="text-right">Phase</Label>
                <Select value={editForm.phase} onValueChange={(value) => setEditForm({ ...editForm, phase: value })}>
                  <SelectTrigger className="col-span-3"><SelectValue placeholder="Select phase" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Development">Development</SelectItem>
                    <SelectItem value="Release-ready">Release-ready</SelectItem>
                    <SelectItem value="Backlog">Backlog</SelectItem>
                    <SelectItem value="Testing">Testing</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="eta" className="text-right">ETA</Label>
                <Input id="eta" value={editForm.eta} onChange={(e) => setEditForm({ ...editForm, eta: e.target.value })} className="col-span-3" placeholder="e.g., 31st August 2025 or NA" />
              </div>
            </div>
          </EntityEditDialog>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}