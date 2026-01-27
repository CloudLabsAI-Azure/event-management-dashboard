// Sync configuration management - Backend API version
import apiClient from './azureApiClient';

// Get API base URL
const getApiBase = () => {
  return window.location.hostname === 'localhost'
    ? 'http://localhost:4000/api'
    : '/api';
};

export type SyncMode = 'replace' | 'merge';
export type SyncInterval = 'manual' | 'hourly' | 'daily' | 'weekly';
export type ResourceType = 'catalog' | 'tracks' | 'roadmap' | 'localizedTrack';

export interface ResourceSyncConfig {
  enabled: boolean;
  excelUrl: string;
  syncMode: SyncMode;
  deleteNotInExcel: boolean;
  lastSync?: string;
  lastStatus?: 'success' | 'error';
  lastError?: string;
}

export interface SyncConfiguration {
  autoSyncEnabled: boolean;
  syncInterval: SyncInterval;
  resources: {
    catalog: ResourceSyncConfig;
    tracks: ResourceSyncConfig;
    roadmap: ResourceSyncConfig;
    localizedTrack: ResourceSyncConfig;
  };
  syncHistory: SyncHistoryEntry[];
}

export interface SyncHistoryEntry {
  timestamp: string;
  resourceType: ResourceType;
  mode: SyncMode;
  status: 'success' | 'error';
  itemsProcessed?: number;
  error?: string;
}

export const syncConfigService = {
  // Load configuration from backend
  async loadConfig(): Promise<SyncConfiguration> {
    try {
      const response = await apiClient.get(`${getApiBase()}/sync-config`);
      return response.data;
    } catch (error) {
      console.error('Failed to load sync config:', error);
      throw error;
    }
  },

  // Update resource configuration
  async updateResourceConfig(
    resourceType: ResourceType,
    updates: Partial<ResourceSyncConfig>
  ): Promise<SyncConfiguration> {
    try {
      const response = await apiClient.put(`${getApiBase()}/sync-config/resource/${resourceType}`, updates);
      return response.data.config;
    } catch (error) {
      console.error('Failed to update resource config:', error);
      throw error;
    }
  },

  // Update global sync settings
  async updateGlobalSettings(
    autoSyncEnabled: boolean,
    syncInterval: SyncInterval
  ): Promise<SyncConfiguration> {
    try {
      const response = await apiClient.put(`${getApiBase()}/sync-config/global`, {
        autoSyncEnabled,
        syncInterval,
      });
      return response.data.config;
    } catch (error) {
      console.error('Failed to update global settings:', error);
      throw error;
    }
  },

  // Trigger manual sync
  async syncNow(): Promise<void> {
    try {
      await apiClient.post(`${getApiBase()}/sync-now`);
    } catch (error) {
      console.error('Failed to trigger sync:', error);
      throw error;
    }
  },

  // Get sync history
  async getSyncHistory(): Promise<SyncHistoryEntry[]> {
    try {
      const response = await apiClient.get(`${getApiBase()}/sync-history`);
      return response.data;
    } catch (error) {
      console.error('Failed to load sync history:', error);
      throw error;
    }
  },

  // Get enabled resources
  getEnabledResources(config: SyncConfiguration): Array<{ type: ResourceType; config: ResourceSyncConfig }> {
    return Object.entries(config.resources)
      .filter(([_, resourceConfig]) => 
        (resourceConfig as ResourceSyncConfig).enabled && 
        (resourceConfig as ResourceSyncConfig).excelUrl
      )
      .map(([type, resourceConfig]) => ({
        type: type as ResourceType,
        config: resourceConfig as ResourceSyncConfig,
      }));
  },
};
