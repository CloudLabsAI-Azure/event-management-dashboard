import { BlobServiceClient } from '@azure/storage-blob';
import { v4 as uuidv4 } from 'uuid';

// Get SAS URL from environment variable
const BLOB_CONTAINER_URL = process.env.AZURE_BLOB_SAS_URL || '';
const AUDIT_BLOB_NAME = 'audit.json';

// Parse container URL to get base URL and SAS token
function parseContainerUrl(url) {
  if (!url) return { baseUrl: '', sasToken: '' };
  const urlParts = url.split('?');
  const baseUrl = urlParts[0];
  const sasToken = urlParts[1] || '';
  return { baseUrl, sasToken };
}

const { baseUrl, sasToken } = parseContainerUrl(BLOB_CONTAINER_URL);

// Create BlobServiceClient for audit.json
const blobServiceClient = new BlobServiceClient(`${baseUrl}?${sasToken}`);
const containerName = baseUrl.split('/').pop();
const containerClient = blobServiceClient.getContainerClient(containerName);
const auditBlobClient = containerClient.getBlobClient(AUDIT_BLOB_NAME);
const auditBlockBlobClient = auditBlobClient.getBlockBlobClient();

/**
 * Helper function to convert stream to buffer
 */
async function streamToBuffer(readableStream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readableStream.on('data', (data) => {
      chunks.push(data instanceof Buffer ? data : Buffer.from(data));
    });
    readableStream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    readableStream.on('error', reject);
  });
}

/**
 * Read audit log from Azure Blob Storage
 * @returns {Promise<Array>} Array of audit entries
 */
export async function readAuditLog() {
  try {
    const exists = await auditBlobClient.exists();
    if (!exists) {
      return [];
    }

    const downloadResponse = await auditBlockBlobClient.download();
    const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
    const content = downloaded.toString('utf8');
    
    const data = content ? JSON.parse(content) : { entries: [] };
    return data.entries || [];
  } catch (error) {
    console.error('❌ Error reading audit log:', error.message);
    return [];
  }
}

/**
 * Write audit log to Azure Blob Storage
 * @param {Array} entries - Array of audit entries
 */
async function writeAuditLog(entries) {
  try {
    const data = {
      _metadata: {
        lastUpdated: new Date().toISOString(),
        totalEntries: entries.length
      },
      entries
    };

    const content = JSON.stringify(data, null, 2);
    
    await auditBlockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: {
        blobContentType: 'application/json'
      }
    });
  } catch (error) {
    console.error('❌ Error writing audit log:', error.message);
    throw error;
  }
}

/**
 * Calculate changes between old and new objects
 * @param {Object} oldObj - Original object
 * @param {Object} newObj - Updated object
 * @param {Array<string>} ignoreFields - Fields to ignore in diff
 * @returns {Array} Array of change objects
 */
function calculateChanges(oldObj, newObj, ignoreFields = ['_metadata', 'id', 'createdAt', 'updatedAt']) {
  const changes = [];
  const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);
  
  for (const key of allKeys) {
    if (ignoreFields.includes(key)) continue;
    
    const oldValue = oldObj?.[key];
    const newValue = newObj?.[key];
    
    // Deep comparison for objects/arrays
    const oldStr = JSON.stringify(oldValue);
    const newStr = JSON.stringify(newValue);
    
    if (oldStr !== newStr) {
      changes.push({
        field: key,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null
      });
    }
  }
  
  return changes;
}

/**
 * Log an audit entry
 * @param {Object} params - Audit entry parameters
 * @param {Object} params.user - User who made the change { id, email, role }
 * @param {string} params.action - Action type: CREATE, UPDATE, DELETE
 * @param {string} params.resource - Resource type: tracks, catalog, users, metrics, reviews, etc.
 * @param {string} params.resourceId - ID of the affected resource
 * @param {Object} params.oldData - Previous state (for UPDATE/DELETE)
 * @param {Object} params.newData - New state (for CREATE/UPDATE)
 * @param {string} params.reason - Optional reason for the change
 * @param {Object} params.metadata - Optional additional metadata
 */
export async function logAudit({
  user,
  action,
  resource,
  resourceId,
  oldData = null,
  newData = null,
  reason = null,
  metadata = {}
}) {
  try {
    // Calculate changes for UPDATE actions
    let changes = [];
    if (action === 'UPDATE' && oldData && newData) {
      changes = calculateChanges(oldData, newData);
      // Skip logging if no actual changes
      if (changes.length === 0) {
        console.log(`ℹ️  No changes detected for ${resource}/${resourceId}, skipping audit log`);
        return;
      }
    }

    const entry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      user: {
        id: user?.id || 'system',
        email: user?.email || 'system@internal',
        role: user?.role || 'system'
      },
      action,
      resource,
      resourceId: String(resourceId),
      changes,
      reason,
      metadata: {
        ...metadata,
        // For CREATE/DELETE, store summary info
        ...(action === 'CREATE' && newData ? { createdData: summarizeData(newData) } : {}),
        ...(action === 'DELETE' && oldData ? { deletedData: summarizeData(oldData) } : {})
      }
    };

    // Read existing entries
    const entries = await readAuditLog();
    
    // Add new entry at the beginning (most recent first)
    entries.unshift(entry);
    
    // Keep only entries from last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const trimmedEntries = entries.filter(e => new Date(e.timestamp) >= ninetyDaysAgo);
    
    // Write back
    await writeAuditLog(trimmedEntries);
    
    console.log(`✅ Audit logged: ${action} ${resource}/${resourceId} by ${user?.email || 'system'}`);
  } catch (error) {
    // Don't throw - audit logging should not break the main operation
    console.error('⚠️  Failed to log audit entry:', error.message);
  }
}

/**
 * Summarize data for storage (avoid storing huge objects)
 */
function summarizeData(data) {
  if (!data) return null;
  
  // For arrays, just store count
  if (Array.isArray(data)) {
    return { _count: data.length };
  }
  
  // For objects, store key fields only
  const summary = {};
  const keyFields = ['id', 'title', 'name', 'trackName', 'trackTitle', 'email', 'status', 'type'];
  
  for (const field of keyFields) {
    if (data[field] !== undefined) {
      summary[field] = data[field];
    }
  }
  
  return Object.keys(summary).length > 0 ? summary : { _keys: Object.keys(data).slice(0, 5) };
}

/**
 * Get audit entries with filters
 * @param {Object} filters - Filter options
 * @param {string} filters.resource - Filter by resource type
 * @param {string} filters.resourceId - Filter by resource ID
 * @param {string} filters.action - Filter by action type
 * @param {string} filters.userId - Filter by user ID
 * @param {string} filters.startDate - Filter by start date (ISO string)
 * @param {string} filters.endDate - Filter by end date (ISO string)
 * @param {number} filters.limit - Max entries to return (default 100)
 * @param {number} filters.offset - Offset for pagination (default 0)
 * @returns {Promise<Object>} { entries, total, hasMore }
 */
export async function getAuditEntries(filters = {}) {
  try {
    let entries = await readAuditLog();
    
    // Apply filters
    if (filters.resource) {
      entries = entries.filter(e => e.resource === filters.resource);
    }
    if (filters.resourceId) {
      entries = entries.filter(e => e.resourceId === filters.resourceId);
    }
    if (filters.action) {
      entries = entries.filter(e => e.action === filters.action);
    }
    if (filters.userId) {
      entries = entries.filter(e => e.user?.id === filters.userId || e.user?.email === filters.userId);
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      entries = entries.filter(e => new Date(e.timestamp) >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      entries = entries.filter(e => new Date(e.timestamp) <= end);
    }
    
    const total = entries.length;
    const limit = filters.limit || 100;
    const offset = filters.offset || 0;
    
    const paginatedEntries = entries.slice(offset, offset + limit);
    
    return {
      entries: paginatedEntries,
      total,
      hasMore: offset + limit < total
    };
  } catch (error) {
    console.error('❌ Error getting audit entries:', error.message);
    return { entries: [], total: 0, hasMore: false };
  }
}

/**
 * Get audit history for a specific resource
 * @param {string} resource - Resource type
 * @param {string} resourceId - Resource ID
 * @returns {Promise<Array>} Array of audit entries for this resource
 */
export async function getResourceHistory(resource, resourceId) {
  const result = await getAuditEntries({ resource, resourceId, limit: 50 });
  return result.entries;
}

export default {
  logAudit,
  getAuditEntries,
  getResourceHistory,
  readAuditLog
};
