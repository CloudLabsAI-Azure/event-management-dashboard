// Backend sync scheduler - handles automatic syncing with node-cron
import cron from 'node-cron';
import * as syncConfig from './syncConfig.js';
import PowerBIClient from './powerBIClient.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read/write data functions (mirror server.js implementation)
const DATA_PATH = path.join(__dirname, 'data.json');

function readData() {
  try {
    if (!fs.existsSync(DATA_PATH)) return {};
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('readData error', err);
    return {};
  }
}

function writeData(data) {
  try {
    const dataWithTimestamp = {
      ...data,
      _metadata: {
        ...data._metadata,
        lastUpdated: new Date().toISOString(),
        lastModifiedBy: 'sync-scheduler'
      }
    };
    fs.writeFileSync(DATA_PATH, JSON.stringify(dataWithTimestamp, null, 2));
    console.log(`[writeData] Saved data successfully, lastUpdated: ${dataWithTimestamp._metadata.lastUpdated}`);
  } catch (err) {
    console.error('[writeData] Error:', err);
  }
}

let cronJob = null;
let powerBIClient = null;

// Initialize Power BI client
function initPowerBIClient(config) {
  const powerBI = config.powerBI;
  if (!powerBI || !powerBI.clientId || !powerBI.clientSecret || !powerBI.tenantId) {
    console.warn('[Sync] Power BI credentials not configured');
    return null;
  }
  
  return new PowerBIClient(
    powerBI.clientId,
    powerBI.clientSecret,
    powerBI.tenantId
  );
}

// Fetch data from Power BI dataset
async function fetchFromPowerBI(resourceConfig, config) {
  try {
    if (!powerBIClient) {
      powerBIClient = initPowerBIClient(config);
      if (!powerBIClient) {
        throw new Error('Power BI client not configured');
      }
    }
    
    const { workspaceId } = config.powerBI;
    const { datasetId, tableName } = resourceConfig;
    
    if (!workspaceId || !datasetId || !tableName) {
      throw new Error('Power BI workspace ID, dataset ID, and table name are required');
    }
    
    console.log(`[Sync] Fetching data from Power BI: workspace=${workspaceId}, dataset=${datasetId}, table=${tableName}`);
    const data = await powerBIClient.getTableData(workspaceId, datasetId, tableName);
    console.log(`[Sync] Fetched ${data.length} rows from Power BI`);
    
    return data;
  } catch (error) {
    console.error('[Sync] Power BI fetch error:', error);
    throw error;
  }
}
  // If it's a SharePoint sharing link with :x: format (Excel)
  if (url.includes('sharepoint.com/:x:/')) {
    // Remove the navigation parameter if present
    if (url.includes('&nav=')) {
      url = url.split('&nav=')[0];
    }
    // Add download=1 parameter to request the file instead of the viewer
    url = url + '&download=1';
    console.log(`[Sync] Converted SharePoint URL: ${url}`);
  }
  return url;
}

// Fetch and parse Excel file from URL
async function fetchAndParseExcel(url) {
  try {
    // Check if it's a local file path
    if (url.startsWith('http://localhost') || url.startsWith('/uploads')) {
      console.log(`[Sync] Fetching local file: ${url}`);
      const localPath = url.startsWith('http://localhost') 
        ? url.replace('http://localhost:4000', path.join(__dirname, '..'))
        : path.join(__dirname, '..', url);
      
      const buffer = fs.readFileSync(localPath);
      console.log(`[Sync] Successfully read local Excel file (${buffer.length} bytes)`);
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      console.log(`[Sync] Parsed ${data.length} rows from Excel`);
      return data;
    }
    
    let downloadUrl = url;
    
    // Handle SharePoint embed URLs
    if (downloadUrl.includes('/_layouts/15/Doc.aspx') && downloadUrl.includes('sourcedoc=')) {
      console.log(`[Sync] Converting SharePoint embed URL to download URL...`);
      
      // Extract the source document ID from embed URL
      const sourceDocMatch = downloadUrl.match(/sourcedoc=(\{[a-f0-9-]+\}|[a-f0-9-]+)/i);
      if (sourceDocMatch) {
        const docId = sourceDocMatch[1];
        const baseUrl = downloadUrl.split('/_layouts/')[0];
        
        // Try different SharePoint download URL formats
        const downloadUrls = [
          `${baseUrl}/_layouts/15/download.aspx?UniqueId=${docId.replace(/[{}]/g, '')}`,
          `${baseUrl}/_layouts/15/download.aspx?sourcedoc=${docId}`,
          `${baseUrl}/_layouts/15/guestaccess.aspx?docid=${docId}&authkey=`,
        ];
        
        for (const tryUrl of downloadUrls) {
          try {
            console.log(`[Sync] Trying download URL: ${tryUrl}`);
            const testResponse = await fetch(tryUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,*/*',
              },
              redirect: 'follow',
            });
            
            const contentType = testResponse.headers.get('content-type') || '';
            if (!contentType.includes('text/html') && testResponse.ok) {
              downloadUrl = tryUrl;
              console.log(`[Sync] Found working download URL!`);
              break;
            }
          } catch (err) {
            console.log(`[Sync] Failed: ${err.message}`);
          }
        }
      }
    }
    
    // Convert SharePoint sharing links to direct download format
    if (downloadUrl.includes('sharepoint.com/:x:/')) {
      console.log(`[Sync] Converting SharePoint sharing link to download URL...`);
      
      // Remove navigation parameter
      if (downloadUrl.includes('&nav=')) {
        downloadUrl = downloadUrl.split('&nav=')[0];
      }
      
      // Extract the resid (resource ID) from the URL - it's the IQC... part
      const resIdMatch = url.match(/\/(EQ[A-Za-z0-9_-]+|IQ[A-Za-z0-9_-]+)\?/);
      
      if (!resIdMatch) {
        throw new Error('Could not extract resource ID from SharePoint URL');
      }
      
      const resId = resIdMatch[1];
      const domain = url.match(/(https:\/\/[^\/]+)/)[1];
      
      // Use the embed download URL format which works better for anonymous access
      // Format: https://domain/_layouts/15/download.aspx?share=<encoded_share_token>
      // But simpler: convert :x: to :download: in the original URL path
      const downloadUrlConverted = url
        .replace('/:x:/', '/:download:/')
        .split('&nav=')[0]
        .split('&rtime=')[0]
        .split('?')[0] + '?download=1';
      
      console.log(`[Sync] Trying converted download URL: ${downloadUrlConverted}`);
      
      // Try multiple approaches
      const urlsToTry = [
        downloadUrlConverted,
        `${domain}/_layouts/15/download.aspx?SourceUrl=${encodeURIComponent(url)}`,
        downloadUrl + '&download=1',
      ];
      
      let response;
      let lastError;
      
      for (const tryUrl of urlsToTry) {
        try {
          console.log(`[Sync] Attempting: ${tryUrl}`);
          response = await fetch(tryUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*',
            },
            redirect: 'follow',
          });
          
          if (response.ok) {
            const contentType = response.headers.get('content-type') || '';
            console.log(`[Sync] Response content-type: ${contentType}`);
            
            // Check if it's actually an Excel file
            if (contentType.includes('spreadsheet') || contentType.includes('excel') || contentType.includes('octet-stream')) {
              console.log(`[Sync] Found valid Excel response!`);
              break;
            }
          }
        } catch (err) {
          lastError = err;
          console.log(`[Sync] Failed: ${err.message}`);
        }
      }
      
      if (!response || !response.ok) {
        throw new Error(lastError?.message || 'All SharePoint download attempts failed. The file may require authentication.');
      }
      
      const buffer = await response.arrayBuffer();
      
      // Verify it's actually an Excel file by checking the file signature
      const uint8Array = new Uint8Array(buffer);
      const isPK = uint8Array[0] === 0x50 && uint8Array[1] === 0x4B; // PK zip signature for .xlsx
      
      if (!isPK) {
        console.log(`[Sync] File signature check failed - not a valid Excel file`);
        throw new Error('Downloaded file is not a valid Excel file. SharePoint may require authentication for this link.');
      }
      
      console.log(`[Sync] Successfully fetched Excel file (${buffer.byteLength} bytes)`);
      
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);
      console.log(`[Sync] Parsed ${data.length} rows from Excel`);
      return data;
    }
    
    // For non-SharePoint URLs
    console.log(`[Sync] Fetching from: ${downloadUrl}`);
    
    const response = await fetch(downloadUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,*/*',
      },
      redirect: 'follow',
    });
    
    if (!response.ok) {
      throw new Error(`Request failed with status code ${response.status}`);
    }
    
    const contentType = response.headers.get('content-type') || '';
    console.log(`[Sync] Content-Type: ${contentType}`);
    
    const buffer = await response.arrayBuffer();
    console.log(`[Sync] Successfully fetched file (${buffer.byteLength} bytes)`);
    
    // Check file signature to see if it's CSV or Excel
    const uint8Array = new Uint8Array(buffer);
    const isPK = uint8Array[0] === 0x50 && uint8Array[1] === 0x4B; // PK zip signature for .xlsx
    
    // Check if it's a CSV file (plain text)
    const isCSV = contentType.includes('text/csv') || 
                  contentType.includes('text/plain') || 
                  url.toLowerCase().endsWith('.csv');
    
    if (isCSV || !isPK) {
      // Try parsing as CSV
      try {
        console.log(`[Sync] Parsing as CSV file...`);
        const text = new TextDecoder().decode(uint8Array);
        const records = parse(text, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
        });
        console.log(`[Sync] Parsed ${records.length} rows from CSV`);
        return records;
      } catch (csvError) {
        // If CSV parsing fails and it's not Excel, check if it's HTML
        const text = new TextDecoder().decode(uint8Array.slice(0, 500));
        if (text.includes('<!DOCTYPE') || text.includes('<html')) {
          console.log(`[Sync] Response is HTML, not data file. First 500 chars:`);
          console.log(text);
          throw new Error('SharePoint returned HTML instead of the file. The link may require authentication or cookies. Please use the upload button to upload the file manually.');
        }
        
        throw new Error(`Failed to parse file as CSV: ${csvError.message}`);
      }
    }
    
    // Parse as Excel
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    console.log(`[Sync] Parsed ${data.length} rows from Excel`);
    return data;
  } catch (error) {
    console.error('Error fetching/parsing Excel:', error.message);
    throw error;
  }
}

// Transform Excel data to API format based on resource type
function transformData(resourceType, excelData) {
  switch (resourceType) {
    case 'catalog':
      return excelData.map((row) => ({
        eventName: row.eventName || row.EventName || '',
        catalogType: row.catalogType || row.CatalogType || '',
        catalogPublishDate: row.catalogPublishDate || row.CatalogPublishDate || '',
        eventURL: row.eventURL || row.EventURL || '',
        testingStatus: row.testingStatus || row.TestingStatus || '',
      }));

    case 'tracks':
      return excelData.map((row) => ({
        trackName: row.trackName || row.TrackName || '',
        testingStatus: row.testingStatus || row.TestingStatus || '',
        releaseNotes: row.releaseNotes || row.ReleaseNotes || '',
      }));

    case 'roadmap':
      return excelData.map((row) => ({
        trackTitle: row.trackTitle || row.TrackTitle || '',
        phase: row.phase || row.Phase || '',
        eta: row.eta || row.ETA || '',
      }));

    case 'localizedTrack':
      return excelData.map((row) => ({
        trackName: row.trackName || row.TrackName || '',
        language: row.language || row.Language || '',
        localizationStatus: row.localizationStatus || row.LocalizationStatus || '',
      }));

    default:
      return excelData;
  }
}

// Replace all - delete existing and import fresh
async function replaceAllSync(resourceType, rawData) {
  const transformedData = transformData(resourceType, rawData);
  
  const data = readData();
  const resourceKey = resourceType === 'catalog' ? 'catalog' : resourceType;
  
  // Delete old items of this type
  const typeFilter = resourceType === 'catalog' ? 'catalog' : resourceType;
  const oldCount = data[resourceKey] ? data[resourceKey].filter(item => item.type === typeFilter || !item.type).length : 0;
  
  if (data[resourceKey]) {
    data[resourceKey] = data[resourceKey].filter(item => item.type !== typeFilter && item.type);
  } else {
    data[resourceKey] = [];
  }
  
  // Add new items
  let maxSr = 0;
  if (data[resourceKey].length > 0) {
    maxSr = Math.max(...data[resourceKey].map(item => item.sr || 0));
  }
  
  transformedData.forEach((item, index) => {
    data[resourceKey].push({
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sr: maxSr + index + 1,
      type: typeFilter,
      ...item,
      createdAt: new Date().toISOString(),
    });
  });
  
  writeData(data);
  
  return {
    inserted: transformedData.length,
    deleted: oldCount,
  };
}

// Smart merge - update existing, add new, optionally delete old
async function smartMergeSync(resourceType, rawData, deleteNotInExcel) {
  const transformedData = transformData(resourceType, rawData);
  
  const data = readData();
  const resourceKey = resourceType === 'catalog' ? 'catalog' : resourceType;
  
  if (!data[resourceKey]) {
    data[resourceKey] = [];
  }
  
  const typeFilter = resourceType === 'catalog' ? 'catalog' : resourceType;
  const existingItems = data[resourceKey].filter(item => item.type === typeFilter || !item.type);
  
  let inserted = 0;
  let updated = 0;
  let deleted = 0;
  
  // Build lookup map based on resource type
  const existingMap = new Map();
  existingItems.forEach(item => {
    let key;
    switch (resourceType) {
      case 'catalog':
        key = item.eventName;
        break;
      case 'tracks':
        key = item.trackName;
        break;
      case 'roadmap':
        key = item.trackTitle;
        break;
      case 'localizedTrack':
        key = `${item.trackName}_${item.language}`;
        break;
      default:
        key = item.id;
    }
    existingMap.set(key, item);
  });
  
  // Track which items were in Excel
  const excelKeys = new Set();
  
  // Process Excel data
  transformedData.forEach(excelItem => {
    let key;
    switch (resourceType) {
      case 'catalog':
        key = excelItem.eventName;
        break;
      case 'tracks':
        key = excelItem.trackName;
        break;
      case 'roadmap':
        key = excelItem.trackTitle;
        break;
      case 'localizedTrack':
        key = `${excelItem.trackName}_${excelItem.language}`;
        break;
      default:
        key = null;
    }
    
    excelKeys.add(key);
    
    if (existingMap.has(key)) {
      // Update existing
      const existing = existingMap.get(key);
      Object.assign(existing, excelItem);
      existing.updatedAt = new Date().toISOString();
      updated++;
    } else {
      // Insert new
      let maxSr = 0;
      if (data[resourceKey].length > 0) {
        maxSr = Math.max(...data[resourceKey].map(item => item.sr || 0));
      }
      
      data[resourceKey].push({
        id: crypto.randomBytes(8).toString('hex'),
        sr: maxSr + 1,
        type: typeFilter,
        ...excelItem,
        createdAt: new Date().toISOString(),
      });
      inserted++;
    }
  });
  
  // Delete items not in Excel (if requested)
  if (deleteNotInExcel) {
    data[resourceKey] = data[resourceKey].filter(item => {
      if (item.type !== typeFilter && item.type) return true;
      
      let key;
      switch (resourceType) {
        case 'catalog':
          key = item.eventName;
          break;
        case 'tracks':
          key = item.trackName;
          break;
        case 'roadmap':
          key = item.trackTitle;
          break;
        case 'localizedTrack':
          key = `${item.trackName}_${item.language}`;
          break;
        default:
          return true;
      }
      
      if (!excelKeys.has(key)) {
        deleted++;
        return false;
      }
      return true;
    });
  }
  
  writeData(data);
  
  return { inserted, updated, deleted };
}

// Sync a single resource
async function syncResource(resourceType, resourceConfig, globalConfig) {
  try {
    const source = resourceConfig.datasetId ? 
      `Power BI dataset ${resourceConfig.datasetId}/${resourceConfig.tableName}` : 
      `Excel ${resourceConfig.excelUrl}`;
    console.log(`[Sync] Starting sync for ${resourceType} from ${source}`);
    
    // Fetch data from Power BI
    const rawData = await fetchFromPowerBI(resourceConfig, globalConfig);
    
    let result;
    if (resourceConfig.syncMode === 'replace') {
      result = await replaceAllSync(resourceType, rawData);
    } else {
      result = await smartMergeSync(resourceType, rawData, resourceConfig.deleteNotInExcel);
    }
    
    syncConfig.updateLastSync(resourceType, 'success');
    syncConfig.addHistoryEntry({
      resourceType,
      mode: resourceConfig.syncMode,
      status: 'success',
      itemsProcessed: result.inserted + (result.updated || 0),
    });
    
    console.log(`[Sync] Success for ${resourceType}:`, result);
    return result;
  } catch (error) {
    const errorMessage = error.message || 'Unknown error';
    console.error(`[Sync] Failed for ${resourceType}:`, errorMessage);
    
    syncConfig.updateLastSync(resourceType, 'error', errorMessage);
    syncConfig.addHistoryEntry({
      resourceType,
      mode: resourceConfig.syncMode,
      status: 'error',
      error: errorMessage,
    });
    
    throw error;
  }
}

// Perform sync for all enabled resources
async function performSync() {
  const globalConfig = syncConfig.loadConfig();
  const enabledResources = syncConfig.getEnabledResources();
  
  if (enabledResources.length === 0) {
    console.log('[Sync] No enabled resources to sync');
    return;
  }
  
  console.log(`[Sync] Starting scheduled sync for ${enabledResources.length} resource(s)`);
  
  for (const { type, config } of enabledResources) {
    try {
      await syncResource(type, config, globalConfig);
    } catch (error) {
      // Continue with other resources even if one fails
      console.error(`[Sync] Error syncing ${type}, continuing with others...`);
    }
  }
  
  console.log('[Sync] Scheduled sync completed');
}

// Get cron expression based on interval
function getCronExpression(interval) {
  switch (interval) {
    case 'hourly':
      return '0 * * * *'; // Every hour at minute 0
    case 'daily':
      return '0 2 * * *'; // Every day at 2 AM
    case 'weekly':
      return '0 2 * * 0'; // Every Sunday at 2 AM
    default:
      return '0 2 * * *'; // Default to daily
  }
}

// Start the scheduler
function startScheduler() {
  const config = syncConfig.loadConfig();
  
  if (!config.autoSyncEnabled) {
    console.log('[Sync] Auto-sync is disabled');
    return;
  }
  
  if (cronJob) {
    cronJob.stop();
  }
  
  const cronExpression = getCronExpression(config.syncInterval);
  console.log(`[Sync] Starting scheduler with interval: ${config.syncInterval} (${cronExpression})`);
  
  cronJob = cron.schedule(cronExpression, async () => {
    console.log('[Sync] Cron job triggered');
    await performSync();
  });
  
  console.log('[Sync] Scheduler started successfully');
}

// Stop the scheduler
function stopScheduler() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('[Sync] Scheduler stopped');
  }
}

// Restart the scheduler (call this when config changes)
function restartScheduler() {
  stopScheduler();
  startScheduler();
}

// Manual sync - sync now
async function syncNow() {
  console.log('[Sync] Manual sync triggered');
  await performSync();
}

export {
  startScheduler,
  stopScheduler,
  restartScheduler,
  syncNow,
  syncResource,
};
