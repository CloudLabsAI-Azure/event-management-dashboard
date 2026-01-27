import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { GraduationCap, Users, Calendar, Edit, Trash2, Plus } from "lucide-react"
import { useState, useEffect } from "react"
import { useAuth } from '@/components/AuthProvider'
import { useToast } from '@/hooks/use-toast'
import api from '@/lib/api'
import EntityEditDialog from '@/components/EntityEditDialog'

interface TTTSession {
  id?: string
  sr: number
  eventId?: string
  trackName: string
  sessionDate: string
  status: string
  notes?: string
}

const getStatusBadge = (status: string) => {
  if (status === "Completed") {
    return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Completed</Badge>
  } else if (status === "Scheduled") {
    return <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">Scheduled</Badge>
  } else if (status === "In Progress") {
    return <Badge variant="secondary" className="bg-yellow-500 hover:bg-yellow-600 text-white">In Progress</Badge>
  }
  return <Badge variant="outline">{status}</Badge>
}

export default function TTTPage() {
  const { userRole: role } = useAuth()
  const { toast } = useToast()
  const [tttSessions, setTttSessions] = useState<TTTSession[]>([])
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editingSession, setEditingSession] = useState<TTTSession | null>(null)
  const [editForm, setEditForm] = useState<TTTSession>({
    sr: 0,
    eventId: "",
    trackName: "",
    sessionDate: "",
    status: "",
    notes: ""
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const res = await api.get('/api/catalog')
      const items = Array.isArray(res.data) ? res.data : []
      
      const sessions = items
        .filter((i: any) => i.type === 'tttSession')
        .map((i: any) => ({
          id: String(i.id || i._id || ''),
          sr: Number(i.sr || 0),
          eventId: String(i.eventId || ''),
          trackName: i.trackName || i.courseName || '',
          sessionDate: i.sessionDate || '',
          status: i.status || 'Scheduled',
          notes: i.notes || ''
        }))
      
      setTttSessions(sessions)
    } catch (err) {
      console.error('Error loading TTT sessions:', err)
      toast({
        title: "Error",
        description: "Could not load TTT sessions",
        variant: "destructive"
      })
    }
  }

  const handleAdd = () => {
    setEditingSession(null)
    setEditForm({
      sr: 0,
      eventId: "",
      trackName: "",
      sessionDate: new Date().toISOString().split('T')[0],
      status: "Scheduled",
      notes: ""
    })
    setIsEditDialogOpen(true)
  }

  const handleEdit = (session: TTTSession) => {
    setEditingSession(session)
    setEditForm({ ...session })
    setIsEditDialogOpen(true)
  }

  const handleSave = async () => {
    if (!editForm.trackName || editForm.trackName.trim().length < 3) {
      toast({
        title: 'Validation Error',
        description: 'Track name is required (min 3 characters)',
        variant: 'destructive'
      })
      return
    }

    setSaving(true)
    try {
      const payload = { ...editForm, type: 'tttSession' }
      
      if (editingSession && editingSession.sr) {
        await api.put(`/api/catalog/${editingSession.sr}`, payload)
      } else {
        await api.post('/api/catalog', payload)
      }

      await loadData()
      setIsEditDialogOpen(false)
      toast({
        title: 'Success',
        description: `TTT session ${editingSession ? 'updated' : 'added'} successfully`
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save TTT session',
        variant: 'destructive'
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (session: TTTSession) => {
    if (!window.confirm(`Delete TTT session "${session.trackName}"?`)) return

    try {
      if (session.sr) {
        await api.delete(`/api/catalog/${session.sr}`)
      }
      await loadData()
      toast({
        title: 'Deleted',
        description: 'TTT session removed'
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete TTT session',
        variant: 'destructive'
      })
    }
  }

  // Calculate statistics
  const totalSessions = tttSessions.length
  const completedSessions = tttSessions.filter(s => s.status === 'Completed').length
  const scheduledSessions = tttSessions.filter(s => s.status === 'Scheduled').length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <GraduationCap className="h-8 w-8 text-primary" />
            Train The Trainer (TTT)
          </h1>
          <p className="text-muted-foreground">
            Manage and track Train The Trainer sessions and certifications
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Sessions</CardDescription>
              <CardTitle className="text-3xl">{totalSessions}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed</CardDescription>
              <CardTitle className="text-3xl text-green-600">{completedSessions}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Scheduled</CardDescription>
              <CardTitle className="text-3xl text-blue-600">{scheduledSessions}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Main Table */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  TTT Sessions
                </CardTitle>
                <CardDescription>
                  All Train The Trainer sessions and their details
                </CardDescription>
              </div>
              {role === 'admin' && (
                <Button size="sm" onClick={handleAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Session
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px] w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-24">Event ID</TableHead>
                    <TableHead className="min-w-[200px]">Track Name</TableHead>
                    <TableHead className="w-32">Session Date</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tttSessions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No TTT sessions yet. Click "Add Session" to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tttSessions.map((session) => (
                      <TableRow key={session.id || session.sr}>
                        <TableCell className="font-medium">{session.eventId || '-'}</TableCell>
                        <TableCell className="font-medium">{session.trackName}</TableCell>
                        <TableCell className="text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(session.sessionDate).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>{getStatusBadge(session.status)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {role === 'admin' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEdit(session)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDelete(session)}
                                  className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <EntityEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          title={editingSession ? `Edit TTT Session: ${editingSession.trackName}` : 'Add TTT Session'}
          saving={saving}
          onSave={handleSave}
        >
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="eventId" className="text-right">Event ID</Label>
              <Input
                id="eventId"
                type="text"
                value={editForm.eventId || ''}
                onChange={(e) => setEditForm({ ...editForm, eventId: e.target.value })}
                className="col-span-3"
                placeholder="e.g., EVT-001 or TRAIN-2024-A"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="trackName" className="text-right">Track Name</Label>
              <Input
                id="trackName"
                value={editForm.trackName}
                onChange={(e) => setEditForm({ ...editForm, trackName: e.target.value })}
                className="col-span-3"
                placeholder="e.g., Azure Administrator Training"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="sessionDate" className="text-right">Session Date</Label>
              <Input
                id="sessionDate"
                type="date"
                value={editForm.sessionDate}
                onChange={(e) => setEditForm({ ...editForm, sessionDate: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="status" className="text-right">Status</Label>
              <Select
                value={editForm.status}
                onValueChange={(value) => setEditForm({ ...editForm, status: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="notes" className="text-right">Notes</Label>
              <Input
                id="notes"
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                className="col-span-3"
                placeholder="Optional notes"
              />
            </div>
          </div>
        </EntityEditDialog>
      </div>
    </DashboardLayout>
  )
}
