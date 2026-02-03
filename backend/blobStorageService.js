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

// SECURITY: Only initialize blob clients if URL is configured
let blobServiceClient, containerName, containerClient, blobClient, blockBlobClient;

if (BLOB_CONTAINER_URL && baseUrl) {
  try {
    // Create BlobServiceClient - this creates paths under container/containerName/... 
    // which matches the existing structure: mseventscatalogcontainer/mseventscatalogcontainer/data.json
    blobServiceClient = new BlobServiceClient(`${baseUrl}?${sasToken}`);
    containerName = baseUrl.split('/').pop();
    containerClient = blobServiceClient.getContainerClient(containerName);
    blobClient = containerClient.getBlobClient(BLOB_NAME);
    blockBlobClient = blobClient.getBlockBlobClient();
  } catch (error) {
    console.error('❌ Failed to initialize blob storage client:', error.message);
  }
}

/**
 * Read data from Azure Blob Storage
 * @returns {Promise<Object>} Parsed JSON data from blob
 */
export async function readDataFromBlob() {
  try {
    // SECURITY: Check if blob storage is configured
    if (!blobClient) {
      console.warn('⚠️  Blob storage not configured, cannot read data');
      return {};
    }
    
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
    // SECURITY: Check if blob storage is configured
    if (!blockBlobClient) {
      console.error('❌ Blob storage not configured, cannot write data');
      throw new Error('Blob storage not configured');
    }
    
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
    
    // Return the public URL - containerClient adds containerName prefix, so actual path is:
    // mseventscatalogcontainer/mseventscatalogcontainer/uploads/filename.png
    const publicUrl = `${baseUrl}/${containerName}/${blobPath}`;
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
    // URL format: https://...blob.../mseventscatalogcontainer/mseventscatalogcontainer/uploads/filename.png
    // We need the path relative to containerClient which is: uploads/filename.png
    let blobPath = blobUrl;
    
    if (blobUrl.includes(baseUrl)) {
      // Remove baseUrl and containerName prefix, plus any SAS token
      // baseUrl = https://...blob.../mseventscatalogcontainer
      // Full path in URL: mseventscatalogcontainer/uploads/filename.png
      // We need: uploads/filename.png (containerClient adds the containerName)
      blobPath = blobUrl.replace(`${baseUrl}/`, '').split('?')[0];
      // Remove the containerName prefix if present (containerClient will add it)
      if (blobPath.startsWith(`${containerName}/`)) {
        blobPath = blobPath.substring(containerName.length + 1);
      }
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
  // Path includes containerName prefix to match actual blob location
  return `${baseUrl}/${containerName}/${UPLOADS_FOLDER}/${fileName}`;
}

/**
 * Get the SAS token for blob access
 * @returns {string} SAS token (without leading ?)
 */
export function getBlobSasToken() {
  return sasToken;
}

/**
 * Append SAS token to a blob URL for authenticated access (internal use only)
 * @param {string} blobUrl - The blob URL
 * @returns {string} URL with SAS token appended
 */
export function appendSasTokenToUrl(blobUrl) {
  if (!blobUrl || !sasToken) return blobUrl;
  // Only append to blob URLs from our storage account
  if (!blobUrl.includes('experienceazure.blob.core.windows.net')) return blobUrl;
  // Don't double-add SAS token
  if (blobUrl.includes('?')) return blobUrl;
  return `${blobUrl}?${sasToken}`;
}

/**
 * Convert blob URLs to proxy URLs for secure frontend access
 * Proxy URLs go through the backend, keeping SAS token hidden
 * @param {Array} reviews - Array of review objects
 * @returns {Array} Reviews with proxy URLs for blob images
 */
export function convertToProxyUrls(reviews) {
  if (!Array.isArray(reviews)) return reviews;
  return reviews.map(review => {
    if (review.path && review.path.includes('experienceazure.blob.core.windows.net')) {
      // Extract filename from blob URL
      // URL format: https://.../mseventscatalogcontainer/mseventscatalogcontainer/uploads/filename.png
      const urlWithoutQuery = review.path.split('?')[0];
      const parts = urlWithoutQuery.split('/');
      const fileName = parts[parts.length - 1];
      return {
        ...review,
        path: `/api/blob-image/${fileName}`,
        _originalBlobPath: review.path // Keep original for reference (not exposed to frontend)
      };
    }
    return review;
  });
}

/**
 * Stream an image from blob storage
 * @param {string} fileName - Name of the file in uploads folder
 * @returns {Promise<{stream: ReadableStream, contentType: string, contentLength: number}>}
 */
export async function streamImageFromBlob(fileName) {
  try {
    const blobPath = `${UPLOADS_FOLDER}/${fileName}`;
    const imageBlobClient = containerClient.getBlobClient(blobPath);
    
    const exists = await imageBlobClient.exists();
    if (!exists) {
      return null;
    }
    
    const downloadResponse = await imageBlobClient.download();
    const properties = await imageBlobClient.getProperties();
    
    return {
      stream: downloadResponse.readableStreamBody,
      contentType: properties.contentType || 'image/png',
      contentLength: properties.contentLength
    };
  } catch (error) {
    console.error('❌ Error streaming image from blob:', error.message);
    throw error;
  }
}

// Keep old function for backward compatibility but mark as deprecated
/**
 * @deprecated Use convertToProxyUrls instead - this exposes SAS token to frontend
 */
export function addSasTokensToReviews(reviews) {
  console.warn('⚠️ addSasTokensToReviews is deprecated - use convertToProxyUrls for security');
  return convertToProxyUrls(reviews);
}
