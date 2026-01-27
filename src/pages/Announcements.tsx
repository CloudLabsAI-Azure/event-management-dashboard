import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Megaphone, FileText, Trash2, Plus, Edit, Download } from "lucide-react"
import { useState, useEffect } from "react"
import { useAuth } from '@/components/AuthProvider'
import { useToast } from '@/hooks/use-toast'
import api from '@/lib/api'
import EntityEditDialog from '@/components/EntityEditDialog'

interface PDFCatalog {
  id?: string
  sr: number
  title: string
  description: string
  pdfUrl: string
  uploadDate: string
}

interface TrackChange {
  id?: string
  sr: number
  trackName: string
  changeType: 'added' | 'removed'
  changeDate: string
  notes?: string
}

interface GeneralAnnouncement {
  id?: string
  sr: number
  title: string
  message: string
  announcementDate: string
}

export default function Announcements() {
  const { userRole: role } = useAuth()
  const { toast } = useToast()
  
  // PDF Catalogs State
  const [pdfCatalogs, setPdfCatalogs] = useState<PDFCatalog[]>([])
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false)
  const [editingPdf, setEditingPdf] = useState<PDFCatalog | null>(null)
  const [pdfForm, setPdfForm] = useState<PDFCatalog>({
    sr: 0,
    title: "",
    description: "",
    pdfUrl: "",
    uploadDate: new Date().toISOString().split('T')[0]
  })
  const [savingPdf, setSavingPdf] = useState(false)

  // Track Changes State
  const [trackChanges, setTrackChanges] = useState<TrackChange[]>([])
  const [isTrackDialogOpen, setIsTrackDialogOpen] = useState(false)
  const [editingTrack, setEditingTrack] = useState<TrackChange | null>(null)
  const [trackForm, setTrackForm] = useState<TrackChange>({
    sr: 0,
    trackName: "",
    changeType: 'added',
    changeDate: new Date().toISOString().split('T')[0],
    notes: ""
  })
  const [savingTrack, setSavingTrack] = useState(false)

  // General Announcements State
  const [generalAnnouncements, setGeneralAnnouncements] = useState<GeneralAnnouncement[]>([])
  const [isAnnouncementDialogOpen, setIsAnnouncementDialogOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<GeneralAnnouncement | null>(null)
  const [announcementForm, setAnnouncementForm] = useState<GeneralAnnouncement>({
    sr: 0,
    title: "",
    message: "",
    announcementDate: new Date().toISOString().split('T')[0]
  })
  const [savingAnnouncement, setSavingAnnouncement] = useState(false)

  // Load data
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const res = await api.get('/api/catalog')
      const items = Array.isArray(res.data) ? res.data : []
      
      // Filter PDF catalogs
      const pdfs = items
        .filter((i: any) => i.type === 'pdfCatalog')
        .map((i: any) => ({
          id: String(i.id || i._id || ''),
          sr: Number(i.sr || 0),
          title: i.title || '',
          description: i.description || '',
          pdfUrl: i.pdfUrl || '',
          uploadDate: i.uploadDate || new Date().toISOString().split('T')[0]
        }))
      setPdfCatalogs(pdfs)

      // Filter track changes
      const changes = items
        .filter((i: any) => i.type === 'trackChange')
        .map((i: any) => ({
          id: String(i.id || i._id || ''),
          sr: Number(i.sr || 0),
          trackName: i.trackName || '',
          changeType: i.changeType || 'added',
          changeDate: i.changeDate || new Date().toISOString().split('T')[0],
          notes: i.notes || ''
        }))
      setTrackChanges(changes)

      // Filter general announcements
      const announcements = items
        .filter((i: any) => i.type === 'generalAnnouncement')
        .map((i: any) => ({
          id: String(i.id || i._id || ''),
          sr: Number(i.sr || 0),
          title: i.title || '',
          message: i.message || '',
          announcementDate: i.announcementDate || new Date().toISOString().split('T')[0]
        }))
        .sort((a: any, b: any) => new Date(b.announcementDate).getTime() - new Date(a.announcementDate).getTime())
      setGeneralAnnouncements(announcements)
    } catch (err) {
      console.error('Error loading announcements:', err)
      toast({
        title: "Error",
        description: "Could not load announcements data",
        variant: "destructive"
      })
    }
  }

  // PDF Catalog handlers
  const handleAddPdf = () => {
    setEditingPdf(null)
    setPdfForm({
      sr: 0,
      title: "",
      description: "",
      pdfUrl: "",
      uploadDate: new Date().toISOString().split('T')[0]
    })
    setIsPdfDialogOpen(true)
  }

  const handleEditPdf = (pdf: PDFCatalog) => {
    setEditingPdf(pdf)
    setPdfForm({ ...pdf })
    setIsPdfDialogOpen(true)
  }

  const handleSavePdf = async () => {
    if (!pdfForm.title || pdfForm.title.trim().length < 3) {
      toast({
        title: 'Validation Error',
        description: 'Title is required (min 3 characters)',
        variant: 'destructive'
      })
      return
    }

    if (!pdfForm.pdfUrl || !pdfForm.pdfUrl.startsWith('http')) {
      toast({
        title: 'Validation Error',
        description: 'Valid PDF URL is required',
        variant: 'destructive'
      })
      return
    }

    setSavingPdf(true)
    try {
      const payload = { ...pdfForm, type: 'pdfCatalog' }
      
      if (editingPdf && editingPdf.sr) {
        await api.put(`/api/catalog/${editingPdf.sr}`, payload)
      } else {
        await api.post('/api/catalog', payload)
      }

      await loadData()
      setIsPdfDialogOpen(false)
      toast({
        title: 'Success',
        description: `PDF catalog ${editingPdf ? 'updated' : 'added'} successfully`
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save PDF catalog',
        variant: 'destructive'
      })
    } finally {
      setSavingPdf(false)
    }
  }

  const handleDeletePdf = async (pdf: PDFCatalog) => {
    if (!window.confirm(`Delete "${pdf.title}"?`)) return

    try {
      if (pdf.sr) {
        await api.delete(`/api/catalog/${pdf.sr}`)
      }
      await loadData()
      toast({
        title: 'Retired',
        description: 'PDF catalog removed'
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete PDF catalog',
        variant: 'destructive'
      })
    }
  }

  // Track Change handlers
  const handleAddTrack = () => {
    setEditingTrack(null)
    setTrackForm({
      sr: 0,
      trackName: "",
      changeType: 'added',
      changeDate: new Date().toISOString().split('T')[0],
      notes: ""
    })
    setIsTrackDialogOpen(true)
  }

  const handleEditTrack = (track: TrackChange) => {
    setEditingTrack(track)
    setTrackForm({ ...track })
    setIsTrackDialogOpen(true)
  }

  const handleSaveTrack = async () => {
    if (!trackForm.trackName || trackForm.trackName.trim().length < 3) {
      toast({
        title: 'Validation Error',
        description: 'Track name is required (min 3 characters)',
        variant: 'destructive'
      })
      return
    }

    setSavingTrack(true)
    try {
      const payload = { ...trackForm, type: 'trackChange' }
      
      if (editingTrack && editingTrack.sr) {
        await api.put(`/api/catalog/${editingTrack.sr}`, payload)
      } else {
        await api.post('/api/catalog', payload)
      }

      await loadData()
      setIsTrackDialogOpen(false)
      toast({
        title: 'Success',
        description: `Track change ${editingTrack ? 'updated' : 'added'} successfully`
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save track change',
        variant: 'destructive'
      })
    } finally {
      setSavingTrack(false)
    }
  }

  const handleDeleteTrack = async (track: TrackChange) => {
    if (!window.confirm(`Delete "${track.trackName}"?`)) return

    try {
      if (track.sr) {
        await api.delete(`/api/catalog/${track.sr}`)
      }
      await loadData()
      toast({
        title: 'Retired',
        description: 'Track change removed'
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete track change',
        variant: 'destructive'
      })
    }
  }

  // General Announcement handlers
  const handleAddAnnouncement = () => {
    setEditingAnnouncement(null)
    setAnnouncementForm({
      sr: 0,
      title: "",
      message: "",
      announcementDate: new Date().toISOString().split('T')[0]
    })
    setIsAnnouncementDialogOpen(true)
  }

  const handleEditAnnouncement = (announcement: GeneralAnnouncement) => {
    setEditingAnnouncement(announcement)
    setAnnouncementForm({ ...announcement })
    setIsAnnouncementDialogOpen(true)
  }

  const handleSaveAnnouncement = async () => {
    if (!announcementForm.title || announcementForm.title.trim().length < 3) {
      toast({
        title: 'Validation Error',
        description: 'Title is required (min 3 characters)',
        variant: 'destructive'
      })
      return
    }

    if (!announcementForm.message || announcementForm.message.trim().length < 5) {
      toast({
        title: 'Validation Error',
        description: 'Message is required (min 5 characters)',
        variant: 'destructive'
      })
      return
    }

    setSavingAnnouncement(true)
    try {
      const payload = { ...announcementForm, type: 'generalAnnouncement' }
      
      if (editingAnnouncement && editingAnnouncement.sr) {
        await api.put(`/api/catalog/${editingAnnouncement.sr}`, payload)
      } else {
        await api.post('/api/catalog', payload)
      }

      await loadData()
      setIsAnnouncementDialogOpen(false)
      toast({
        title: 'Success',
        description: `Announcement ${editingAnnouncement ? 'updated' : 'added'} successfully`
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to save announcement',
        variant: 'destructive'
      })
    } finally {
      setSavingAnnouncement(false)
    }
  }

  const handleDeleteAnnouncement = async (announcement: GeneralAnnouncement) => {
    if (!window.confirm(`Delete announcement "${announcement.title}"?`)) return

    try {
      if (announcement.sr) {
        await api.delete(`/api/catalog/${announcement.sr}`)
      }
      await loadData()
      toast({
        title: 'Retired',
        description: 'Announcement removed'
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to delete announcement',
        variant: 'destructive'
      })
    }
  }

  const addedTracks = trackChanges.filter(t => t.changeType === 'added')
  const removedTracks = trackChanges.filter(t => t.changeType === 'removed')

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-8 w-8 text-primary" />
            Announcements
          </h1>
          <p className="text-muted-foreground">
            Catalog updates, PDF resources, and track changes
          </p>
        </div>

        {/* General Announcements Section */}
        <Card className="glass-card border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Megaphone className="h-5 w-5 text-primary" />
                  General Announcements
                </CardTitle>
                <CardDescription>
                  Important updates and notifications
                </CardDescription>
              </div>
              {role === 'admin' && (
                <Button size="sm" onClick={handleAddAnnouncement}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Announcement
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] w-full rounded-md border">
              <div className="p-4 space-y-3">
                {generalAnnouncements.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">No announcements yet</p>
                ) : (
                  generalAnnouncements.map((announcement) => (
                    <div 
                      key={announcement.id || announcement.sr} 
                      className="p-4 border rounded-lg hover:bg-accent/50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <h4 className="font-semibold">{announcement.title}</h4>
                          <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">
                            {announcement.message}
                          </p>
                          <div className="text-xs text-muted-foreground mt-2">
                            {new Date(announcement.announcementDate).toLocaleDateString()}
                          </div>
                        </div>
                        {role === 'admin' && (
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditAnnouncement(announcement)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteAnnouncement(announcement)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* PDF Catalogs Section */}
        <Card className="glass-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  PDF Catalogs
                </CardTitle>
                <CardDescription>
                  Downloadable catalog resources and documentation
                </CardDescription>
              </div>
              {role === 'admin' && (
                <Button size="sm" onClick={handleAddPdf}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add PDF
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] w-full rounded-md border">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="min-w-[200px]">Title</TableHead>
                    <TableHead className="min-w-[250px]">Description</TableHead>
                    <TableHead className="w-32">Upload Date</TableHead>
                    <TableHead className="w-32">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pdfCatalogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                        No PDF catalogs yet. Click "Add PDF" to upload one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pdfCatalogs.map((pdf) => (
                      <TableRow key={pdf.id || pdf.sr}>
                        <TableCell className="font-medium">
                          <a 
                            href={pdf.pdfUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-primary hover:underline cursor-pointer"
                          >
                            {pdf.title}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{pdf.description}</TableCell>
                        <TableCell>{new Date(pdf.uploadDate).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => window.open(pdf.pdfUrl, '_blank')}
                              className="h-8 w-8 p-0"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            {role === 'admin' && (
                              <>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleEditPdf(pdf)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeletePdf(pdf)}
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

        {/* Track Changes Section */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* New Tracks Added */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-green-600">➕ New Tracks Added</CardTitle>
                  <CardDescription>Recently added tracks</CardDescription>
                </div>
                {role === 'admin' && (
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setTrackForm({
                        sr: 0,
                        trackName: "",
                        changeType: 'added',
                        changeDate: new Date().toISOString().split('T')[0],
                        notes: ""
                      })
                      setIsTrackDialogOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Track
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] w-full rounded-md border">
                <div className="p-4 space-y-3">
                  {addedTracks.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No new tracks added yet</p>
                  ) : (
                    addedTracks.map((track) => (
                      <div key={track.id || track.sr} className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50">
                        <div className="flex-1">
                          <div className="font-medium">{track.trackName}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            Added on: {new Date(track.changeDate).toLocaleDateString()}
                          </div>
                          {track.notes && (
                            <div className="text-sm text-muted-foreground mt-1 italic">{track.notes}</div>
                          )}
                        </div>
                        {role === 'admin' && (
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTrack(track)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTrack(track)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Tracks Retired */}
          <Card className="glass-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-red-600">🗑️ Tracks Retired</CardTitle>
                  <CardDescription>Recently retired tracks</CardDescription>
                </div>
                {role === 'admin' && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setTrackForm({
                        sr: 0,
                        trackName: "",
                        changeType: 'removed',
                        changeDate: new Date().toISOString().split('T')[0],
                        notes: ""
                      })
                      setIsTrackDialogOpen(true)
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Retirement
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] w-full rounded-md border">
                <div className="p-4 space-y-3">
                  {removedTracks.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground">No tracks retired yet</p>
                  ) : (
                    removedTracks.map((track) => (
                      <div key={track.id || track.sr} className="flex items-start justify-between p-3 border rounded-lg hover:bg-accent/50">
                        <div className="flex-1">
                          <div className="font-medium line-through text-muted-foreground">{track.trackName}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            Retired on: {new Date(track.changeDate).toLocaleDateString()}
                          </div>
                          {track.notes && (
                            <div className="text-sm text-muted-foreground mt-1 italic">{track.notes}</div>
                          )}
                        </div>
                        {role === 'admin' && (
                          <div className="flex items-center gap-1 ml-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTrack(track)}
                              className="h-8 w-8 p-0"
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTrack(track)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* PDF Dialog */}
        <EntityEditDialog
          open={isPdfDialogOpen}
          onOpenChange={setIsPdfDialogOpen}
          title={editingPdf ? 'Edit PDF Catalog' : 'Add PDF Catalog'}
          saving={savingPdf}
          onSave={handleSavePdf}
        >
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pdf-title" className="text-right">Title</Label>
              <Input
                id="pdf-title"
                value={pdfForm.title}
                onChange={(e) => setPdfForm({ ...pdfForm, title: e.target.value })}
                className="col-span-3"
                placeholder="e.g., 2025 Course Catalog"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pdf-description" className="text-right">Description</Label>
              <Input
                id="pdf-description"
                value={pdfForm.description}
                onChange={(e) => setPdfForm({ ...pdfForm, description: e.target.value })}
                className="col-span-3"
                placeholder="Brief description"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pdf-url" className="text-right">PDF URL</Label>
              <Input
                id="pdf-url"
                value={pdfForm.pdfUrl}
                onChange={(e) => setPdfForm({ ...pdfForm, pdfUrl: e.target.value })}
                className="col-span-3"
                placeholder="https://example.com/catalog.pdf"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="pdf-date" className="text-right">Upload Date</Label>
              <Input
                id="pdf-date"
                type="date"
                value={pdfForm.uploadDate}
                onChange={(e) => setPdfForm({ ...pdfForm, uploadDate: e.target.value })}
                className="col-span-3"
              />
            </div>
          </div>
        </EntityEditDialog>

        {/* Track Change Dialog */}
        <EntityEditDialog
          open={isTrackDialogOpen}
          onOpenChange={setIsTrackDialogOpen}
          title={editingTrack ? 'Edit Track Change' : 'Add Track Change'}
          saving={savingTrack}
          onSave={handleSaveTrack}
        >
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="track-name" className="text-right">Track Name</Label>
              <Input
                id="track-name"
                value={trackForm.trackName}
                onChange={(e) => setTrackForm({ ...trackForm, trackName: e.target.value })}
                className="col-span-3"
                placeholder="e.g., Azure Fundamentals"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="track-type" className="text-right">Change Type</Label>
              <select
                id="track-type"
                value={trackForm.changeType}
                onChange={(e) => setTrackForm({ ...trackForm, changeType: e.target.value as 'added' | 'removed' })}
                className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="added">Added</option>
                <option value="removed">Removed</option>
              </select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="track-date" className="text-right">Change Date</Label>
              <Input
                id="track-date"
                type="date"
                value={trackForm.changeDate}
                onChange={(e) => setTrackForm({ ...trackForm, changeDate: e.target.value })}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="track-notes" className="text-right">Notes</Label>
              <Input
                id="track-notes"
                value={trackForm.notes}
                onChange={(e) => setTrackForm({ ...trackForm, notes: e.target.value })}
                className="col-span-3"
                placeholder="Optional notes"
              />
            </div>
          </div>
        </EntityEditDialog>

        {/* General Announcement Dialog */}
        <EntityEditDialog
          open={isAnnouncementDialogOpen}
          onOpenChange={setIsAnnouncementDialogOpen}
          title={editingAnnouncement ? 'Edit Announcement' : 'Add General Announcement'}
          saving={savingAnnouncement}
          onSave={handleSaveAnnouncement}
        >
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="announcement-title" className="text-right">Title</Label>
              <Input
                id="announcement-title"
                value={announcementForm.title}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, title: e.target.value })}
                className="col-span-3"
                placeholder="e.g., System Maintenance"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="announcement-message" className="text-right">Message</Label>
              <textarea
                id="announcement-message"
                value={announcementForm.message}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, message: e.target.value })}
                className="col-span-3 min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter announcement message..."
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="announcement-date" className="text-right">Date</Label>
              <Input
                id="announcement-date"
                type="date"
                value={announcementForm.announcementDate}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, announcementDate: e.target.value })}
                className="col-span-3"
              />
            </div>
          </div>
        </EntityEditDialog>
      </div>
    </DashboardLayout>
  )
}
