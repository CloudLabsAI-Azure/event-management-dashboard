// Backend sync configuration management
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SYNC_CONFIG_FILE = path.join(__dirname, 'sync-config.json');

// Default configuration
const defaultConfig = {
  autoSyncEnabled: false,
  syncInterval: 'daily',
  powerBI: {
    clientId: '',
    clientSecret: '',
    tenantId: '',
    workspaceId: '',
  },
  resources: {
    catalog: {
      enabled: false,
      datasetId: '',
      tableName: '',
      syncMode: 'merge',
      deleteNotInExcel: false,
      lastSync: null,
      lastStatus: null,
      lastError: null,
    },
    tracks: {
      enabled: false,
      datasetId: '',
      tableName: '',
      syncMode: 'merge',
      deleteNotInExcel: false,
      lastSync: null,
      lastStatus: null,
      lastError: null,
    },
    roadmap: {
      enabled: false,
      datasetId: '',
      tableName: '',
      syncMode: 'merge',
      deleteNotInExcel: false,
      lastSync: null,
      lastStatus: null,
      lastError: null,
    },
    localizedTrack: {
      enabled: false,
      datasetId: '',
      tableName: '',
      syncMode: 'merge',
      deleteNotInExcel: false,
      lastSync: null,
      lastStatus: null,
      lastError: null,
    },
  },
  syncHistory: [],
};

// Load configuration from file
function loadConfig() {
  try {
    if (fs.existsSync(SYNC_CONFIG_FILE)) {
      const data = fs.readFileSync(SYNC_CONFIG_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load sync config:', error);
  }
  return { ...defaultConfig };
}

// Save configuration to file
function saveConfig(config) {
  try {
    fs.writeFileSync(SYNC_CONFIG_FILE, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error('Failed to save sync config:', error);
    return false;
  }
}

// Update global settings
function updateGlobalSettings(autoSyncEnabled, syncInterval) {
  const config = loadConfig();
  config.autoSyncEnabled = autoSyncEnabled;
  config.syncInterval = syncInterval;
  saveConfig(config);
  return config;
}

// Update resource configuration
function updateResourceConfig(resourceType, updates) {
  const config = loadConfig();
  if (config.resources[resourceType]) {
    config.resources[resourceType] = {
      ...config.resources[resourceType],
      ...updates,
    };
    saveConfig(config);
  }
  return config;
}

// Update last sync status
function updateLastSync(resourceType, status, error = null) {
  const config = loadConfig();
  if (config.resources[resourceType]) {
    config.resources[resourceType].lastSync = new Date().toISOString();
    config.resources[resourceType].lastStatus = status;
    config.resources[resourceType].lastError = error;
    saveConfig(config);
  }
}

// Update Power BI settings
function updatePowerBISettings(powerBISettings) {
  const config = loadConfig();
  config.powerBI = { ...config.powerBI, ...powerBISettings };
  saveConfig(config);
  return config;
}

// Add sync history entry
function addHistoryEntry(entry) {
  const config = loadConfig();
  config.syncHistory.unshift({
    ...entry,
    timestamp: new Date().toISOString(),
  });
  // Keep only the most recent 50 entries
  if (config.syncHistory.length > 50) {
    config.syncHistory = config.syncHistory.slice(0, 50);
  }
  saveConfig(config);
}

// Get enabled resources
function getEnabledResources() {
  const config = loadConfig();
  return Object.entries(config.resources)
    .filter(([_, resourceConfig]) => resourceConfig.enabled && (resourceConfig.datasetId || resourceConfig.excelUrl))
    .map(([type, resourceConfig]) => ({
      type,
      config: resourceConfig,
    }));
}

export {
  loadConfig,
  saveConfig,
  updateGlobalSettings,
  updateResourceConfig,
  updatePowerBISettings,
  updateLastSync,
  addHistoryEntry,
  getEnabledResources,
};
