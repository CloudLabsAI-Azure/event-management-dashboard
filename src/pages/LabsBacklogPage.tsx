import { DashboardLayout } from "@/components/DashboardLayout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Edit, Trash2, Plus, Search, ChevronLeft, ChevronRight, Download, ClipboardList, Eye, RefreshCw } from "lucide-react"
import * as XLSX from 'xlsx'
import { useState, useEffect } from "react"
import { useAuth } from '@/components/AuthProvider'
import catalogService from '@/lib/services/catalogService'
import EntityEditDialog from '@/components/EntityEditDialog'
import { useToast } from '@/hooks/use-toast'
import { useDirtyFields } from '@/hooks/use-dirty-fields'
import api from '@/lib/api'
import { isGraphAuthConfigured } from '@/lib/graphAuth'
import { readSharePointExcel } from '@/lib/sharepointSync'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

// ── Types ──

export interface LabsBacklogItem {
  id?: string;
  sr: number;
  formId?: number;
  startTime?: string;
  completionTime?: string;
  email?: string;
  name?: string;
  lastModified?: string;
  requestType?: string;
  labName?: string;
  description?: string;
  replacesExisting?: string;
  replacedLab?: string;
  expectedCustomers?: string;
  platforms?: string;
  goal?: string;
  duration?: string;
  attachmentUrl?: string;
  fundingScenario?: string;
  alphaTeamInterest?: string;
  nonTechSpecs?: string;
  fundingScenario2?: string;
}

const emptyForm: LabsBacklogItem = {
  sr: 0,
  formId: undefined,
  startTime: '',
  completionTime: '',
  email: '',
  name: '',
  lastModified: '',
  requestType: '',
  labName: '',
  description: '',
  replacesExisting: '',
  replacedLab: '',
  expectedCustomers: '',
  platforms: '',
  goal: '',
  duration: '',
  attachmentUrl: '',
  fundingScenario: '',
  alphaTeamInterest: '',
  nonTechSpecs: '',
  fundingScenario2: '',
}

// ── Component ──

export default function LabsBacklogPage() {
  const [data, setData] = useState<LabsBacklogItem[]>([])
  const [editingItem, setEditingItem] = useState<LabsBacklogItem | null>(null)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [editForm, setEditForm] = useState<LabsBacklogItem>({ ...emptyForm })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const { userRole: role } = useAuth()
  const dirty = useDirtyFields<LabsBacklogItem>()

  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState<{ configured: boolean; lastSync: string | null } | null>(null)
  const graphConfigured = isGraphAuthConfigured()

  // Detail view dialog
  const [viewItem, setViewItem] = useState<LabsBacklogItem | null>(null)

  // Pagination & search
  const [searchQuery, setSearchQuery] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 15

  // ── Data loading ──

  const loadData = async () => {
    try {
      const list = await catalogService.list()
      const items = list
        .filter((i: any) => i.type === 'labsBacklog')
        .map((r: any, idx: number) => ({
          id: String(r.id || r._id || `temp_lb_${idx}`),
          sr: Number(r.sr || idx + 1),
          formId: r.formId != null ? Number(r.formId) : undefined,
          startTime: r.startTime || '',
          completionTime: r.completionTime || '',
          email: r.email || '',
          name: r.name || '',
          lastModified: r.lastModified || '',
          requestType: r.requestType || '',
          labName: r.labName || '',
          description: r.description || '',
          replacesExisting: r.replacesExisting || '',
          replacedLab: r.replacedLab || '',
          expectedCustomers: r.expectedCustomers || '',
          platforms: r.platforms || '',
          goal: r.goal || '',
          duration: r.duration || '',
          attachmentUrl: r.attachmentUrl || '',
          fundingScenario: r.fundingScenario || '',
          alphaTeamInterest: r.alphaTeamInterest || '',
          nonTechSpecs: r.nonTechSpecs || '',
          fundingScenario2: r.fundingScenario2 || '',
        }))
      setData(items)
    } catch (err) {
      console.error('Error loading labs backlog data:', err)
      toast({ title: 'Error', description: 'Could not load labs backlog data.', variant: 'destructive' })
    }
  }

  useEffect(() => {
    loadData()
    // Load sync status
    api.get('/sharepoint-sync/status').then(res => setSyncStatus(res.data)).catch(() => {})
  }, [])

  // ── Filtering & Pagination ──

  const filtered = data.filter(item => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      (item.labName || '').toLowerCase().includes(q) ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.requestType || '').toLowerCase().includes(q) ||
      (item.email || '').toLowerCase().includes(q) ||
      String(item.formId || '').includes(q)
    )
  })

  const totalPages = Math.ceil(filtered.length / itemsPerPage)
  const currentData = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery])

  // ── Handlers ──

  const handleAdd = () => {
    setEditingItem(null)
    setEditForm({ ...emptyForm })
    dirty.reset()
    setIsEditDialogOpen(true)
  }

  const handleEdit = (item: LabsBacklogItem) => {
    setEditingItem(item)
    setEditForm({ ...item })
    dirty.initOriginal(item)
    setIsEditDialogOpen(true)
  }

  const handleSave = async () => {
    if (!editForm.labName || editForm.labName.trim().length < 2) {
      throw new Error('Lab name is required (min 2 chars)')
    }

    try {
      const payload = { ...dirty.getDirtyPayload(editForm), type: 'labsBacklog' }

      if (editingItem && editingItem.sr && editingItem.sr > 0) {
        await catalogService.update(editingItem.sr, payload)
        setData(prev => prev.map(i => i.sr === editingItem.sr ? { ...i, ...editForm } : i))
      } else {
        const resItem = await catalogService.create({ ...editForm, type: 'labsBacklog' })
        const newItem = {
          ...editForm,
          id: String(resItem?.id || resItem?._id || ''),
          sr: Number(resItem?.sr || Date.now()),
        }
        setData(prev => [...prev, newItem])
      }
      setIsEditDialogOpen(false)
      setEditingItem(null)
      toast({ title: 'Success', description: 'Labs backlog item saved' })
    } catch (err) {
      console.error('Save error:', err)
      throw err
    }
  }

  const handleDelete = async (item: LabsBacklogItem) => {
    if (!window.confirm(`Delete "${item.labName}"?`)) return
    try {
      if (item.sr) await catalogService.remove(item.sr)
      setData(prev => prev.filter(i => i.sr !== item.sr))
      toast({ title: 'Deleted', description: 'Item removed' })
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to delete item', variant: 'destructive' })
    }
  }

  // ── SharePoint Sync (frontend popup auth) ──

  const handleSync = async () => {
    setSyncing(true)
    try {
      // Step 1: Read Excel from SharePoint via user's Graph token (popup)
      const { items } = await readSharePointExcel()
      if (!items.length) {
        toast({ title: 'No Data', description: 'No rows found in the SharePoint workbook.' })
        return
      }

      // Step 2: Send parsed items to backend for merge
      const res = await api.post('/sharepoint-sync/import', { items })
      const r = res.data
      toast({
        title: 'SharePoint Sync Complete',
        description: `${r.imported || 0} new, ${r.updated || 0} updated from ${r.totalRows || 0} rows`,
      })
      await loadData()
      setSyncStatus(prev => prev ? { ...prev, lastSync: r.lastSync } : prev)
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.response?.data?.error || err.message
      toast({ title: 'Sync Failed', description: msg, variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  // ── Export ──

  const handleExportExcel = () => {
    const exportData = data.map(i => ({
      'ID': i.formId ?? '',
      'Lab Name': i.labName || '',
      'Requester': i.name || '',
      'Email': i.email || '',
      'Request Type': i.requestType || '',
      'Replaces Existing?': i.replacesExisting || '',
      'Replaced Lab': i.replacedLab || '',
      'Expected Customers (90 days)': i.expectedCustomers || '',
      'Duration': i.duration || '',
      'Platforms': i.platforms || '',
      'Goal': i.goal || '',
      'Description': i.description || '',
      'Completion Time': i.completionTime || '',
      'Funding Scenario': i.fundingScenario || '',
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)
    ws['!cols'] = [
      { wch: 8 }, { wch: 40 }, { wch: 25 }, { wch: 30 }, { wch: 20 },
      { wch: 15 }, { wch: 30 }, { wch: 18 }, { wch: 15 }, { wch: 30 },
      { wch: 40 }, { wch: 50 }, { wch: 20 }, { wch: 40 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'Labs Backlog')
    XLSX.writeFile(wb, `Labs_Backlog_${new Date().toISOString().split('T')[0]}.xlsx`)
    toast({ title: 'Exported', description: `${exportData.length} items exported` })
  }

  // ── Truncate helper ──

  const truncate = (text: string | undefined, max = 40) => {
    if (!text) return '—'
    return text.length > max ? text.slice(0, max) + '…' : text
  }

  // ── Render ──

  const isAdmin = role === 'admin'

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="h-5 w-5" />
                  Labs Backlog
                </CardTitle>
                <CardDescription>
                  Lab requests and backlog items from Microsoft Forms
                  {syncStatus?.lastSync && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      · Last synced: {new Date(syncStatus.lastSync).toLocaleString()}
                    </span>
                  )}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (graphConfigured || syncStatus?.configured) && (
                  <Button variant="outline" size="sm" onClick={handleSync} disabled={syncing}>
                    <RefreshCw className={`h-4 w-4 mr-1 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing...' : 'Sync from SharePoint'}
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <Download className="h-4 w-4 mr-1" /> Export
                </Button>
                {isAdmin && (
                  <Button size="sm" onClick={handleAdd}>
                    <Plus className="h-4 w-4 mr-1" /> Add Item
                  </Button>
                )}
              </div>
            </div>
            {/* Search */}
            <div className="relative mt-3 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search lab name, requester, type..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="w-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px]">ID</TableHead>
                    <TableHead>What is the name of the lab you are requesting?</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>What would you like to do?</TableHead>
                    <TableHead>Is this new lab intended to replace an existing lab?</TableHead>
                    <TableHead>Which existing lab will be replaced?</TableHead>
                    <TableHead className="text-center">How many Enterprise Customers do you expect to utilize this lab within the first 90 days of its availability?</TableHead>
                    <TableHead>What is the expected length of the hands-on access & completion duration of this lab?</TableHead>
                    {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 9 : 8} className="text-center text-muted-foreground py-8">
                        {searchQuery ? 'No matching items' : 'No labs backlog data yet'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    currentData.map((item) => (
                      <TableRow key={item.sr} className="cursor-pointer hover:bg-muted/50" onClick={() => setViewItem(item)}>
                        <TableCell className="font-mono text-xs">{item.formId ?? item.sr}</TableCell>
                        <TableCell className="font-medium max-w-[250px]">{truncate(item.labName, 50)}</TableCell>
                        <TableCell>{truncate(item.name, 25)}</TableCell>
                        <TableCell>
                          {item.requestType ? (
                            <Badge variant="outline" className="text-xs">{truncate(item.requestType, 30)}</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          {item.replacesExisting === 'Yes' ? (
                            <Badge className="bg-amber-500 text-xs">Yes</Badge>
                          ) : item.replacesExisting === 'No' ? (
                            <Badge variant="secondary" className="text-xs">No</Badge>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{truncate(item.replacedLab, 30)}</TableCell>
                        <TableCell className="text-center">{item.expectedCustomers || '—'}</TableCell>
                        <TableCell>{truncate(item.duration, 25)}</TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                              <Button size="icon" variant="ghost" onClick={() => setViewItem(item)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleEdit(item)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => handleDelete(item)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">{filtered.length} items</p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">{currentPage} / {totalPages}</span>
                  <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Detail View Dialog ── */}
        <Dialog open={!!viewItem} onOpenChange={(open) => { if (!open) setViewItem(null) }}>
          <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{viewItem?.labName || 'Lab Details'}</DialogTitle>
            </DialogHeader>
            {viewItem && (
              <div className="space-y-3 text-sm">
                <DetailRow label="Form ID" value={viewItem.formId != null ? String(viewItem.formId) : ''} />
                <DetailRow label="Requester" value={viewItem.name} />
                <DetailRow label="Email" value={viewItem.email} />
                <DetailRow label="Request Type" value={viewItem.requestType} />
                <DetailRow label="Lab Name" value={viewItem.labName} />
                <DetailRow label="Description / GitHub Repo" value={viewItem.description} multiline />
                <DetailRow label="Replaces Existing Lab?" value={viewItem.replacesExisting} />
                <DetailRow label="Which Existing Lab?" value={viewItem.replacedLab} />
                <DetailRow label="Expected Customers (90 days)" value={viewItem.expectedCustomers} />
                <DetailRow label="Platforms & Services" value={viewItem.platforms} multiline />
                <DetailRow label="Expected Goal" value={viewItem.goal} multiline />
                <DetailRow label="Duration" value={viewItem.duration} />
                <DetailRow label="Funding Scenario" value={viewItem.fundingScenario} multiline />
                <DetailRow label="Alpha Team Interest" value={viewItem.alphaTeamInterest} multiline />
                <DetailRow label="Non-Tech Specs" value={viewItem.nonTechSpecs} multiline />
                <DetailRow label="Submission Time" value={viewItem.completionTime} />
                <DetailRow label="Last Modified" value={viewItem.lastModified} />
                {viewItem.attachmentUrl && (
                  <div>
                    <span className="font-medium text-muted-foreground">Attachment:</span>{' '}
                    <a href={viewItem.attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">View</a>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Edit/Add Dialog ── */}
        <EntityEditDialog
          open={isEditDialogOpen}
          onOpenChange={setIsEditDialogOpen}
          title={editingItem ? 'Edit Backlog Item' : 'Add Backlog Item'}
          saving={saving}
          onSave={handleSave}
        >
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Lab Name *</Label>
                <Input value={editForm.labName || ''} onChange={e => setEditForm(f => ({ ...f, labName: e.target.value }))} />
              </div>
              <div>
                <Label>Requester Name</Label>
                <Input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Email</Label>
                <Input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} />
              </div>
              <div>
                <Label>Request Type</Label>
                <Input value={editForm.requestType || ''} onChange={e => setEditForm(f => ({ ...f, requestType: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Description / GitHub Repo</Label>
              <Textarea rows={2} value={editForm.description || ''} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Replaces Existing Lab?</Label>
                <Select value={editForm.replacesExisting || ''} onValueChange={v => setEditForm(f => ({ ...f, replacesExisting: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yes">Yes</SelectItem>
                    <SelectItem value="No">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Which Existing Lab?</Label>
                <Input value={editForm.replacedLab || ''} onChange={e => setEditForm(f => ({ ...f, replacedLab: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Expected Customers (90 days)</Label>
                <Input value={editForm.expectedCustomers || ''} onChange={e => setEditForm(f => ({ ...f, expectedCustomers: e.target.value }))} />
              </div>
              <div>
                <Label>Duration</Label>
                <Input value={editForm.duration || ''} onChange={e => setEditForm(f => ({ ...f, duration: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Platforms & Services</Label>
              <Textarea rows={2} value={editForm.platforms || ''} onChange={e => setEditForm(f => ({ ...f, platforms: e.target.value }))} />
            </div>
            <div>
              <Label>Expected Goal</Label>
              <Textarea rows={2} value={editForm.goal || ''} onChange={e => setEditForm(f => ({ ...f, goal: e.target.value }))} />
            </div>
            <div>
              <Label>Funding Scenario</Label>
              <Textarea rows={2} value={editForm.fundingScenario || ''} onChange={e => setEditForm(f => ({ ...f, fundingScenario: e.target.value }))} />
            </div>
            <div>
              <Label>Alpha Team Interest</Label>
              <Textarea rows={2} value={editForm.alphaTeamInterest || ''} onChange={e => setEditForm(f => ({ ...f, alphaTeamInterest: e.target.value }))} />
            </div>
            <div>
              <Label>Non-Technical Event Specs</Label>
              <Textarea rows={2} value={editForm.nonTechSpecs || ''} onChange={e => setEditForm(f => ({ ...f, nonTechSpecs: e.target.value }))} />
            </div>
          </div>
        </EntityEditDialog>
      </div>
    </DashboardLayout>
  )
}

// ── Detail row helper ──

function DetailRow({ label, value, multiline }: { label: string; value?: string; multiline?: boolean }) {
  if (!value) return null
  return (
    <div>
      <span className="font-medium text-muted-foreground">{label}:</span>{' '}
      {multiline ? (
        <p className="mt-0.5 whitespace-pre-wrap">{value}</p>
      ) : (
        <span>{value}</span>
      )}
    </div>
  )
}
