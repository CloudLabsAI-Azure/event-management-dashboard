import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Github, Search, ExternalLink } from 'lucide-react'
import api from '@/lib/api'
import { useToast } from '@/hooks/use-toast'

interface GitHubFolder {
  name: string
  path: string
  url: string
}

interface GitHubReleasePickerProps {
  currentUrl: string
  onSelect: (url: string) => void
  disabled?: boolean
}

export function GitHubReleasePicker({ currentUrl, onSelect, disabled }: GitHubReleasePickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [folders, setFolders] = useState<GitHubFolder[]>([])
  const [filteredFolders, setFilteredFolders] = useState<GitHubFolder[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    if (isOpen && folders.length === 0) {
      loadFolders()
    }
  }, [isOpen])

  useEffect(() => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      setFilteredFolders(
        folders.filter(folder => 
          folder.name.toLowerCase().includes(term)
        )
      )
    } else {
      setFilteredFolders(folders)
    }
  }, [searchTerm, folders])

  const loadFolders = async () => {
    setIsLoading(true)
    try {
      const response = await api.get('/api/github-release-notes')
      setFolders(response.data.folders || [])
      setFilteredFolders(response.data.folders || [])
      toast({
        title: 'Success',
        description: `Loaded ${response.data.count || 0} labs from GitHub`,
      })
    } catch (error) {
      console.error('Failed to load GitHub folders:', error)
      toast({
        title: 'Error',
        description: 'Failed to load labs from GitHub. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelect = (folder: GitHubFolder) => {
    onSelect(folder.url)
    setIsOpen(false)
    setSearchTerm('')
    toast({
      title: 'Release Notes Selected',
      description: folder.name,
    })
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          disabled={disabled}
          className="gap-2"
        >
          <Github className="h-4 w-4" />
          Select from GitHub
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            Select Release Notes from GitHub
          </DialogTitle>
          <DialogDescription>
            Choose a lab from MS-Innovation-Release-Notes repository
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search labs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Results Count */}
          {!isLoading && (
            <div className="text-sm text-muted-foreground">
              Showing {filteredFolders.length} of {folders.length} labs
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-muted-foreground">Loading labs from GitHub...</div>
            </div>
          )}

          {/* Folders List */}
          {!isLoading && (
            <ScrollArea className="h-[400px] rounded-md border">
              <div className="p-4 space-y-2">
                {filteredFolders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {searchTerm ? 'No labs found matching your search' : 'No labs available'}
                  </div>
                ) : (
                  filteredFolders.map((folder) => (
                    <button
                      key={folder.path}
                      onClick={() => handleSelect(folder)}
                      className="w-full text-left p-3 rounded-lg border hover:bg-accent hover:border-primary transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate group-hover:text-primary">
                            {folder.name}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 truncate">
                            {folder.url}
                          </div>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary flex-shrink-0 mt-1" />
                      </div>
                    </button>
                  ))
                )}
              </div>
            </ScrollArea>
          )}

          {/* Current Selection Info */}
          {currentUrl && (
            <div className="pt-2 border-t">
              <Label className="text-xs text-muted-foreground">Current URL:</Label>
              <div className="text-xs mt-1 p-2 bg-muted rounded truncate">
                {currentUrl}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
