import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { syncConfigService, ResourceType, ResourceSyncConfig, SyncConfiguration } from '@/lib/syncConfig';
import { syncScheduler } from '@/lib/syncScheduler';
import { RefreshCw, CheckCircle2, XCircle, Clock, Play, Pause, Upload } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import apiClient from '@/lib/azureApiClient';

export default function SyncConfigurationPage() {
  const [config, setConfig] = useState<SyncConfiguration | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingResource, setUploadingResource] = useState<ResourceType | null>(null);
  const schedulerRunning = true; // Backend scheduler always runs

  // Load config on mount
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setIsLoading(true);
      const loadedConfig = await syncConfigService.loadConfig();
      setConfig(loadedConfig);
    } catch (error) {
      toast({
        title: 'Failed to load configuration',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle file upload
  const handleFileUpload = async (resourceType: ResourceType, file: File) => {
    try {
      setUploadingResource(resourceType);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('resourceType', resourceType);
      
      const getApiBase = () => {
        return window.location.hostname === 'localhost'
          ? 'http://localhost:4000/api'
          : '/api';
      };
      
      const response = await apiClient.post(`${getApiBase()}/upload-sync-excel`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      
      // Update the URL in config
      await handleResourceConfigChange(resourceType, { excelUrl: response.data.fileUrl });
      
      toast({
        title: 'File uploaded successfully',
        description: `${response.data.fileName} (${Math.round(response.data.size / 1024)} KB)`,
      });
    } catch (error) {
      toast({
        title: 'Upload failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setUploadingResource(null);
    }
  };

  // Update global settings
  const handleGlobalSettingsChange = async (autoSyncEnabled: boolean, syncInterval: typeof config.syncInterval) => {
    try {
      const updatedConfig = await syncConfigService.updateGlobalSettings(autoSyncEnabled, syncInterval);
      setConfig(updatedConfig);

      toast({
        title: autoSyncEnabled ? 'Auto-sync enabled' : 'Auto-sync disabled',
        description: autoSyncEnabled 
          ? `Automatic sync will run ${syncInterval} on the backend.` 
          : 'Automatic syncing has been stopped.',
      });
    } catch (error) {
      toast({
        title: 'Failed to update settings',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Update resource configuration
  const handleResourceConfigChange = async (
    resourceType: ResourceType,
    updates: Partial<ResourceSyncConfig>
  ) => {
    try {
      const updatedConfig = await syncConfigService.updateResourceConfig(resourceType, updates);
      setConfig(updatedConfig);
    } catch (error) {
      toast({
        title: 'Failed to update resource',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  // Manual sync now
  const handleSyncNow = async () => {
    setIsSyncing(true);
    await syncScheduler.syncNow(true);
    // Reload config to get updated sync status
    setTimeout(() => {
      loadConfig();
      setIsSyncing(false);
    }, 2000); // Give backend time to process
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <RefreshCw className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>Failed to load sync configuration</AlertDescription>
        </Alert>
      </div>
    );
  }

  // Format date
  const formatDate = (isoString?: string) => {
    if (!isoString) return 'Never';
    const date = new Date(isoString);
    return date.toLocaleString();
  };

  // Render resource configuration
  const renderResourceConfig = (resourceType: ResourceType, label: string) => {
    const resourceConfig = config.resources[resourceType];

    return (
      <Card key={resourceType}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">{label}</CardTitle>
              <CardDescription>Configure sync for {label.toLowerCase()}</CardDescription>
            </div>
            <Switch
              checked={resourceConfig.enabled}
              onCheckedChange={(checked) =>
                handleResourceConfigChange(resourceType, { enabled: checked })
              }
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {resourceConfig.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor={`${resourceType}-url`}>Excel File URL</Label>
                <div className="flex gap-2">
                  <Input
                    id={`${resourceType}-url`}
                    placeholder="https://example.com/data.xlsx or upload file below"
                    value={resourceConfig.excelUrl}
                    onChange={(e) =>
                      handleResourceConfigChange(resourceType, { excelUrl: e.target.value })
                    }
                  />
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    id={`${resourceType}-file`}
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(resourceType, file);
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploadingResource === resourceType}
                    onClick={() => document.getElementById(`${resourceType}-file`)?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {uploadingResource === resourceType ? 'Uploading...' : 'Upload Excel File'}
                  </Button>
                  {resourceConfig.excelUrl.includes('sharepoint.com/:x:/') && (
                    <Alert className="mt-2">
                      <AlertDescription className="text-sm">
                        SharePoint sharing links don't work directly. Please upload the Excel file using the button above.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Sync Mode</Label>
                <RadioGroup
                  value={resourceConfig.syncMode}
                  onValueChange={(value: 'replace' | 'merge') =>
                    handleResourceConfigChange(resourceType, { syncMode: value })
                  }
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="replace" id={`${resourceType}-replace`} />
                    <Label htmlFor={`${resourceType}-replace`} className="font-normal">
                      Replace All (Delete old data and import fresh)
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="merge" id={`${resourceType}-merge`} />
                    <Label htmlFor={`${resourceType}-merge`} className="font-normal">
                      Smart Merge (Update existing, add new)
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {resourceConfig.syncMode === 'merge' && (
                <div className="flex items-center space-x-2">
                  <Switch
                    id={`${resourceType}-delete`}
                    checked={resourceConfig.deleteNotInExcel}
                    onCheckedChange={(checked) =>
                      handleResourceConfigChange(resourceType, { deleteNotInExcel: checked })
                    }
                  />
                  <Label htmlFor={`${resourceType}-delete`} className="font-normal">
                    Delete items not in Excel file
                  </Label>
                </div>
              )}

              {/* Last sync status */}
              {resourceConfig.lastSync && (
                <div className="pt-2 border-t">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    <span>Last sync: {formatDate(resourceConfig.lastSync)}</span>
                  </div>
                  {resourceConfig.lastStatus === 'success' ? (
                    <div className="flex items-center gap-2 text-sm text-green-600 mt-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Success</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-red-600 mt-1">
                      <XCircle className="h-4 w-4" />
                      <span>{resourceConfig.lastError || 'Failed'}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold">Data Sync Configuration</h1>
        <p className="text-muted-foreground mt-2">
          Configure automatic and manual data synchronization from Excel files
        </p>
      </div>

      {/* Global Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Global Sync Settings</CardTitle>
          <CardDescription>Configure automatic sync schedule</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Auto-Sync</Label>
              <p className="text-sm text-muted-foreground">
                Automatically sync data at scheduled intervals
              </p>
            </div>
            <Switch
              checked={config.autoSyncEnabled}
              onCheckedChange={(checked) =>
                handleGlobalSettingsChange(checked, config.syncInterval)
              }
            />
          </div>

          {config.autoSyncEnabled && (
            <div className="space-y-2">
              <Label htmlFor="sync-interval">Sync Interval</Label>
              <Select
                value={config.syncInterval}
                onValueChange={(value: typeof config.syncInterval) =>
                  handleGlobalSettingsChange(config.autoSyncEnabled, value)
                }
              >
                <SelectTrigger id="sync-interval">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Every Hour</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {schedulerRunning ? (
              <Badge variant="default" className="flex items-center gap-1">
                <Play className="h-3 w-3" />
                Scheduler Running
              </Badge>
            ) : (
              <Badge variant="secondary" className="flex items-center gap-1">
                <Pause className="h-3 w-3" />
                Scheduler Stopped
              </Badge>
            )}
          </div>

          <Separator />

          <div>
            <Button
              onClick={handleSyncNow}
              disabled={isSyncing || syncConfigService.getEnabledResources(config).length === 0}
              className="w-full"
            >
              {isSyncing ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Now (Manual)
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Immediately sync all enabled resources on the backend
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Resource Configurations */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Resource Configuration</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {renderResourceConfig('catalog', 'Catalog Items')}
          {renderResourceConfig('tracks', 'Top 25 Tracks')}
          {renderResourceConfig('roadmap', 'Roadmap Items')}
          {renderResourceConfig('localizedTrack', 'Localized Tracks')}
        </div>
      </div>

      {/* Sync History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Sync History</CardTitle>
          <CardDescription>Last {config.syncHistory.length} sync operations</CardDescription>
        </CardHeader>
        <CardContent>
          {config.syncHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No sync history yet
            </p>
          ) : (
            <div className="space-y-2">
              {config.syncHistory.slice(0, 10).map((entry, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    {entry.status === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-600" />
                    )}
                    <div>
                      <div className="font-medium text-sm">
                        {entry.resourceType} - {entry.mode === 'replace' ? 'Replace All' : 'Smart Merge'}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(entry.timestamp)}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-right">
                    {entry.status === 'success' ? (
                      <span className="text-green-600">
                        {entry.itemsProcessed} items processed
                      </span>
                    ) : (
                      <span className="text-red-600 max-w-xs truncate">
                        {entry.error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Help Section */}
      <Alert>
        <AlertDescription>
          <strong>How to use:</strong>
          <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
            <li>Enable auto-sync and set your preferred interval for automatic background syncing</li>
            <li>Configure each resource individually with its Excel URL and sync mode</li>
            <li>Use "Sync Now" button for immediate manual synchronization</li>
            <li>Replace All: Deletes existing data and imports fresh from Excel</li>
            <li>Smart Merge: Updates existing items, adds new ones, optionally removes old ones</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}
