import { useState, useEffect } from 'react'
import { DashboardLayout } from '@/components/DashboardLayout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  RefreshCw,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  FileText,
  Plus,
  Pencil,
  Trash2,
  ArrowRight,
  History,
  Info,
} from 'lucide-react'
import api from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface AuditEntry {
  id: string
  timestamp: string
  user: {
    id: string
    email: string
    role: string
  }
  action: 'CREATE' | 'UPDATE' | 'DELETE'
  resource: string
  resourceId: string
  changes: Array<{
    field: string
    oldValue: any
    newValue: any
  }>
  reason?: string
  metadata?: Record<string, any>
}

const actionIcons = {
  CREATE: <Plus className="h-4 w-4" />,
  UPDATE: <Pencil className="h-4 w-4" />,
  DELETE: <Trash2 className="h-4 w-4" />,
}

const actionColors = {
  CREATE: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  UPDATE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
}

const resourceColors: Record<string, string> = {
  users: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  tracks: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  catalog: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  metrics: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  reviews: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
}

export default function AuditLogPage() {
  const { toast } = useToast()
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  
  // Filters
  const [resourceFilter, setResourceFilter] = useState<string>('')
  const [actionFilter, setActionFilter] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const pageSize = 20
  
  // Detail dialog
  const [selectedEntry, setSelectedEntry] = useState<AuditEntry | null>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const fetchAuditEntries = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (resourceFilter) params.append('resource', resourceFilter)
      if (actionFilter) params.append('action', actionFilter)
      params.append('limit', String(pageSize))
      params.append('offset', String(page * pageSize))
      
      const response = await api.get(`/api/audit/entries?${params.toString()}`)
      setEntries(response.data.entries || [])
      setTotal(response.data.total || 0)
      setHasMore(response.data.hasMore || false)
    } catch (err: any) {
      console.error('Error fetching audit entries:', err)
      toast({
        title: 'Error',
        description: 'Failed to fetch audit log',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAuditEntries()
  }, [resourceFilter, actionFilter, page])

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '(empty)'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  const filteredEntries = entries.filter(entry => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      entry.user.email.toLowerCase().includes(query) ||
      entry.resource.toLowerCase().includes(query) ||
      entry.resourceId.toLowerCase().includes(query) ||
      entry.changes.some(c => c.field.toLowerCase().includes(query))
    )
  })

  const openDetail = (entry: AuditEntry) => {
    setSelectedEntry(entry)
    setIsDetailOpen(true)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
              <History className="h-8 w-8 text-blue-600" />
              Audit Log
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1">
              Track all changes made to the system
            </p>
          </div>
          <Button onClick={fetchAuditEntries} variant="outline" className="gap-2">
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-500" />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Filters:</span>
              </div>
              
              <Select value={resourceFilter} onValueChange={v => { setResourceFilter(v === 'all' ? '' : v); setPage(0); }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Resources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Resources</SelectItem>
                  <SelectItem value="users">Users</SelectItem>
                  <SelectItem value="tracks">Tracks</SelectItem>
                  <SelectItem value="catalog">Catalog</SelectItem>
                  <SelectItem value="metrics">Metrics</SelectItem>
                  <SelectItem value="reviews">Reviews</SelectItem>
                </SelectContent>
              </Select>
              
              <Select value={actionFilter} onValueChange={v => { setActionFilter(v === 'all' ? '' : v); setPage(0); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                </SelectContent>
              </Select>
              
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by user, resource, field..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              
              <div className="text-sm text-slate-500">
                {total} total entries
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Audit Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px]">Timestamp</TableHead>
                  <TableHead className="w-[200px]">User</TableHead>
                  <TableHead className="w-[100px]">Action</TableHead>
                  <TableHead className="w-[120px]">Resource</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto text-slate-400" />
                      <p className="mt-2 text-slate-500">Loading audit entries...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredEntries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <FileText className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600" />
                      <p className="mt-2 text-slate-500">No audit entries found</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEntries.map((entry) => (
                    <TableRow key={entry.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => openDetail(entry)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-slate-400" />
                          <Tooltip>
                            <TooltipTrigger>
                              <span className="text-sm">{formatTimestamp(entry.timestamp)}</span>
                            </TooltipTrigger>
                            <TooltipContent>
                              {new Date(entry.timestamp).toLocaleString()}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center">
                            <User className="h-4 w-4 text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-medium truncate max-w-[150px]">{entry.user.email}</p>
                            <p className="text-xs text-slate-500">{entry.user.role}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`gap-1 ${actionColors[entry.action]}`}>
                          {actionIcons[entry.action]}
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={resourceColors[entry.resource] || 'bg-slate-100 text-slate-700'}>
                          {entry.resource}
                        </Badge>
                        <p className="text-xs text-slate-500 mt-1 font-mono">#{entry.resourceId}</p>
                      </TableCell>
                      <TableCell>
                        {entry.action === 'UPDATE' && entry.changes.length > 0 ? (
                          <div className="space-y-1">
                            {entry.changes.slice(0, 2).map((change, i) => (
                              <div key={i} className="text-sm flex items-center gap-1">
                                <span className="font-medium text-slate-700 dark:text-slate-300">{change.field}:</span>
                                <span className="text-red-500 line-through text-xs truncate max-w-[80px]">{formatValue(change.oldValue)}</span>
                                <ArrowRight className="h-3 w-3 text-slate-400" />
                                <span className="text-emerald-600 text-xs truncate max-w-[80px]">{formatValue(change.newValue)}</span>
                              </div>
                            ))}
                            {entry.changes.length > 2 && (
                              <span className="text-xs text-slate-500">+{entry.changes.length - 2} more</span>
                            )}
                          </div>
                        ) : entry.action === 'CREATE' ? (
                          <span className="text-sm text-emerald-600">New item created</span>
                        ) : entry.action === 'DELETE' ? (
                          <span className="text-sm text-red-500">Item deleted</span>
                        ) : (
                          <span className="text-sm text-slate-400">No changes recorded</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); openDetail(entry); }}>
                          <Info className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => p + 1)}
                disabled={!hasMore}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Audit Entry Details
              </DialogTitle>
            </DialogHeader>
            
            {selectedEntry && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase">Timestamp</label>
                    <p className="text-sm">{new Date(selectedEntry.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase">User</label>
                    <p className="text-sm">{selectedEntry.user.email}</p>
                    <p className="text-xs text-slate-500">Role: {selectedEntry.user.role}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase">Action</label>
                    <Badge className={`mt-1 gap-1 ${actionColors[selectedEntry.action]}`}>
                      {actionIcons[selectedEntry.action]}
                      {selectedEntry.action}
                    </Badge>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase">Resource</label>
                    <p className="text-sm">{selectedEntry.resource} / {selectedEntry.resourceId}</p>
                  </div>
                </div>

                {/* Changes */}
                {selectedEntry.action === 'UPDATE' && selectedEntry.changes.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase mb-2 block">Changes</label>
                    <div className="space-y-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                      {selectedEntry.changes.map((change, i) => (
                        <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-200 dark:border-slate-700 last:border-0">
                          <span className="font-medium text-slate-700 dark:text-slate-300 min-w-[120px]">{change.field}</span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-medium text-slate-500">OLD:</span>
                              <code className="text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded">
                                {formatValue(change.oldValue)}
                              </code>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-slate-500">NEW:</span>
                              <code className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded">
                                {formatValue(change.newValue)}
                              </code>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                {selectedEntry.metadata && Object.keys(selectedEntry.metadata).length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase mb-2 block">Additional Info</label>
                    <pre className="text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded-lg overflow-x-auto">
                      {JSON.stringify(selectedEntry.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Entry ID */}
                <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-400 font-mono">Entry ID: {selectedEntry.id}</p>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  )
}
