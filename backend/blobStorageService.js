import { BlobServiceClient } from '@azure/storage-blob';

// Get SAS URL from environment variable
const BLOB_CONTAINER_URL = process.env.AZURE_BLOB_SAS_URL || '';
const BLOB_NAME = 'data.json';
const UPLOADS_FOLDER = 'uploads'; // Virtual folder for image uploads

// Check if blob storage is configured
if (!BLOB_CONTAINER_URL) {
  console.warn('⚠️  AZURE_BLOB_SAS_URL not configured. Blob storage operations will fail.');
}

// Parse container URL to get base URL and SAS token
function parseContainerUrl(url) {
  if (!url) return { baseUrl: '', sasToken: '' };
  const urlParts = url.split('?');
  const baseUrl = urlParts[0];
  const sasToken = urlParts[1] || '';
  return { baseUrl, sasToken };
}

const { baseUrl, sasToken } = parseContainerUrl(BLOB_CONTAINER_URL);

// Create BlobServiceClient with SAS token
const blobServiceClient = new BlobServiceClient(`${baseUrl}?${sasToken}`);
const containerName = baseUrl.split('/').pop();
const containerClient = blobServiceClient.getContainerClient(containerName);
const blobClient = containerClient.getBlobClient(BLOB_NAME);
const blockBlobClient = blobClient.getBlockBlobClient();

/**
 * Read data from Azure Blob Storage
 * @returns {Promise<Object>} Parsed JSON data from blob
 */
export async function readDataFromBlob() {
  try {
    console.log('📥 Reading data from blob storage...');
    
    // Check if blob exists
    const exists = await blobClient.exists();
    if (!exists) {
      console.log('⚠️  Blob does not exist, returning empty object');
      return {};
    }

    // Download blob content
    const downloadResponse = await blockBlobClient.download();
    const downloaded = await streamToBuffer(downloadResponse.readableStreamBody);
    const content = downloaded.toString('utf8');
    
    const data = content ? JSON.parse(content) : {};
    console.log('✅ Data read successfully from blob storage');
    return data;
  } catch (error) {
    console.error('❌ Error reading data from blob:', error.message);
    // Return empty object on error to maintain compatibility
    return {};
  }
}

/**
 * Write data to Azure Blob Storage
 * @param {Object} data - Data to write to blob
 * @param {Object} options - Write options
 * @param {boolean} options.updateTimestamp - Whether to update the lastUpdated timestamp (default: true)
 * @returns {Promise<void>}
 */
export async function writeDataToBlob(data, options = {}) {
  try {
    const { updateTimestamp = true } = options;
    console.log('📤 Writing data to blob storage...');
    
    // Update or preserve timestamp based on options
    const timestamp = updateTimestamp ? new Date().toISOString() : (data._metadata?.lastUpdated || new Date().toISOString());
    
    // Add metadata timestamp
    const dataWithTimestamp = {
      ...data,
      _metadata: {
        ...data._metadata,
        lastUpdated: timestamp,
        lastModifiedBy: 'system'
      }
    };

    // Convert data to JSON string
    const content = JSON.stringify(dataWithTimestamp, null, 2);
    
    // Upload to blob (overwrites if exists)
    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: {
        blobContentType: 'application/json'
      }
    });
    
    console.log(`✅ Data written successfully to blob storage. Timestamp: ${timestamp} ${updateTimestamp ? '(updated)' : '(preserved)'}`);
  } catch (error) {
    console.error('❌ Error writing data to blob:', error.message);
    throw error; // Propagate error so caller knows write failed
  }
}

/**
 * Delete the data blob from Azure Blob Storage
 * @returns {Promise<void>}
 */
export async function deleteDataBlob() {
  try {
    console.log('🗑️  Deleting data blob...');
    
    const exists = await blobClient.exists();
    if (!exists) {
      console.log('⚠️  Blob does not exist, nothing to delete');
      return;
    }

    await blobClient.delete();
    console.log('✅ Data blob deleted successfully');
  } catch (error) {
    console.error('❌ Error deleting blob:', error.message);
    throw error;
  }
}

/**
 * Get blob metadata (last modified time, size, etc.)
 * @returns {Promise<Object>}
 */
export async function getBlobMetadata() {
  try {
    const exists = await blobClient.exists();
    if (!exists) {
      return null;
    }

    const properties = await blobClient.getProperties();
    return {
      lastModified: properties.lastModified,
      contentLength: properties.contentLength,
      contentType: properties.contentType,
      etag: properties.etag
    };
  } catch (error) {
    console.error('❌ Error getting blob metadata:', error.message);
    return null;
  }
}

/**
 * Check if blob exists
 * @returns {Promise<boolean>}
 */
export async function blobExists() {
  try {
    return await blobClient.exists();
  } catch (error) {
    console.error('❌ Error checking blob existence:', error.message);
    return false;
  }
}

/**
 * Helper function to convert stream to buffer
 * @param {ReadableStream} readableStream
 * @returns {Promise<Buffer>}
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
 * Upload an image to Azure Blob Storage
 * @param {Buffer} imageBuffer - Image data buffer
 * @param {string} fileName - Name for the blob (e.g., 'devops_12345_0_1234567890.png')
 * @param {string} contentType - MIME type (e.g., 'image/png')
 * @returns {Promise<string>} Public URL of the uploaded blob
 */
export async function uploadImageToBlob(imageBuffer, fileName, contentType = 'image/png') {
  try {
    const blobPath = `${UPLOADS_FOLDER}/${fileName}`;
    const imageBlobClient = containerClient.getBlockBlobClient(blobPath);
    
    console.log(`📤 Uploading image to blob: ${blobPath}`);
    
    await imageBlobClient.upload(imageBuffer, imageBuffer.length, {
      blobHTTPHeaders: {
        blobContentType: contentType
      }
    });
    
    // Return the public URL (without SAS token for public access, or with for private)
    const publicUrl = `${baseUrl}/${blobPath}`;
    console.log(`✅ Image uploaded: ${publicUrl}`);
    
    return publicUrl;
  } catch (error) {
    console.error('❌ Error uploading image to blob:', error.message);
    throw error;
  }
}

/**
 * Delete an image from Azure Blob Storage
 * @param {string} blobUrl - Full URL or path of the blob to delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
export async function deleteImageFromBlob(blobUrl) {
  try {
    // Extract blob path from URL or use as-is if it's already a path
    let blobPath = blobUrl;
    if (blobUrl.includes(baseUrl)) {
      blobPath = blobUrl.replace(`${baseUrl}/`, '').split('?')[0];
    } else if (blobUrl.startsWith('/')) {
      blobPath = blobUrl.substring(1); // Remove leading slash
    }
    
    const imageBlobClient = containerClient.getBlobClient(blobPath);
    
    console.log(`🗑️ Deleting image from blob: ${blobPath}`);
    
    const exists = await imageBlobClient.exists();
    if (!exists) {
      console.log(`⚠️ Image blob does not exist: ${blobPath}`);
      return false;
    }
    
    await imageBlobClient.delete();
    console.log(`✅ Image deleted: ${blobPath}`);
    return true;
  } catch (error) {
    console.error('❌ Error deleting image from blob:', error.message);
    throw error;
  }
}

/**
 * Check if an image exists in blob storage
 * @param {string} fileName - Name of the file (without uploads/ prefix)
 * @returns {Promise<boolean>}
 */
export async function imageExistsInBlob(fileName) {
  try {
    const blobPath = `${UPLOADS_FOLDER}/${fileName}`;
    const imageBlobClient = containerClient.getBlobClient(blobPath);
    return await imageBlobClient.exists();
  } catch (error) {
    console.error('❌ Error checking image existence:', error.message);
    return false;
  }
}

/**
 * Get the public URL for an image in blob storage
 * @param {string} fileName - Name of the file
 * @returns {string} Public URL
 */
export function getImageBlobUrl(fileName) {
  return `${baseUrl}/${UPLOADS_FOLDER}/${fileName}`;
}
