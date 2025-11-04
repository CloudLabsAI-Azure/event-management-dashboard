import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, X, FileText, Image, FileSpreadsheet } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface FileUploadModalProps {
  trigger: React.ReactNode
  accept?: string
  uploadTo?: string
}

const ACCEPTED_FILE_TYPES = {
  'image/png': '.png',
  'application/pdf': '.pdf',
  'application/json': '.json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls'
}

const getFileIcon = (fileType: string) => {
  if (fileType.startsWith('image/')) return <Image className="h-4 w-4" />
  if (fileType.includes('sheet') || fileType.includes('excel')) return <FileSpreadsheet className="h-4 w-4" />
  return <FileText className="h-4 w-4" />
}

import api from '@/lib/api'
import { useAuth } from '@/components/AuthProvider'

export function FileUploadModal({ trigger, accept, uploadTo }: FileUploadModalProps) {
  const { userRole } = useAuth()
  if (userRole !== 'admin') return null
  const [isOpen, setIsOpen] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragOver, setIsDragOver] = useState(false)
  const [eventName, setEventName] = useState('')
  const { toast } = useToast()

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    addFiles(files)
  }

  const addFiles = (files: File[]) => {
    const validFiles = files.filter(file => {
      const isValidType = Object.keys(ACCEPTED_FILE_TYPES).includes(file.type)
      if (!isValidType) {
        toast({
          title: "Invalid file type",
          description: `${file.name} is not a supported file type.`,
          variant: "destructive"
        })
      }
      return isValidType
    })
    
    setSelectedFiles(prev => [...prev, ...validFiles])
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    addFiles(files)
  }

  const handleUpload = async () => {
    if (selectedFiles.length === 0) {
      toast({
        title: "No files selected",
        description: "Please select at least one file to upload.",
        variant: "destructive"
      })
      return
    }

    // For feedback uploads, require event name
    if (uploadTo === '/api/upload-review' && !eventName.trim()) {
      toast({
        title: "Event name required",
        description: "Please enter an event name for the feedback.",
        variant: "destructive"
      })
      return
    }

    try {
      const fd = new FormData()
      selectedFiles.forEach(f => fd.append('files', f))
      
      // Add event name for feedback uploads
      if (uploadTo === '/api/upload-review' && eventName.trim()) {
        fd.append('eventName', eventName.trim())
      }
      
      const target = uploadTo || '/api/upload-review'
      await api.post(target, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast({ title: 'Files uploaded successfully', description: `${selectedFiles.length} file(s) have been uploaded.` })
      setSelectedFiles([])
      setEventName('')
      setIsOpen(false)
    } catch (err) {
      toast({ title: 'Upload failed', description: 'Could not upload files', variant: 'destructive' })
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Files</DialogTitle>
          <DialogDescription>
            Upload PNG, PDF, JSON, XLS, or XLSX files. You can drag and drop or click to select.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Event Name Field for feedback uploads */}
          {uploadTo === '/api/upload-review' && (
            <div className="space-y-2">
              <Label htmlFor="event-name" className="text-sm font-medium">
                Event Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="event-name"
                type="text"
                placeholder="Enter event name (e.g., AI Workshop 2024)"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                This name will be displayed with the feedback image
              </p>
            </div>
          )}

          {/* File Drop Zone */}
          <div
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
              isDragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <div className="space-y-2">
              <p className="text-sm font-medium">Drag and drop files here</p>
              <p className="text-xs text-muted-foreground">or</p>
              <Label htmlFor="file-upload">
                <Button variant="outline" className="cursor-pointer" asChild>
                  <span>Browse Files</span>
                </Button>
              </Label>
              <Input
                id="file-upload"
                type="file"
                multiple
                accept={accept || ".png,.pdf,.json,.xlsx,.xls"}
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Supported formats: PNG, PDF, JSON, XLS, XLSX
            </p>
          </div>

          {/* Selected Files List */}
          {selectedFiles.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Selected Files ({selectedFiles.length})</Label>
              <div className="max-h-32 overflow-y-auto space-y-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-2 bg-muted rounded-md">
                    <div className="flex items-center space-x-2 flex-1 min-w-0">
                      {getFileIcon(file.type)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Button */}
          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUpload} 
              disabled={selectedFiles.length === 0 || (uploadTo === '/api/upload-review' && !eventName.trim())}
            >
              Upload {selectedFiles.length > 0 && `(${selectedFiles.length})`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}