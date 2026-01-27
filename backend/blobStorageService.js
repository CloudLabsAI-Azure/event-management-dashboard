import { BlobServiceClient } from '@azure/storage-blob';

// Hardcoded SAS URL for the blob container
const BLOB_CONTAINER_URL = 'https://experienceazure.blob.core.windows.net/mseventscatalogcontainer?sp=racwdli&st=2026-01-27T08:05:41Z&se=2026-11-01T16:20:41Z&sv=2024-11-04&sr=c&sig=SvFobXWmaERPhMc3Hl2mxRmHDovRo3YiJVDsQEbuekQ%3D';
const BLOB_NAME = 'data.json';

// Parse container URL to get base URL and SAS token
function parseContainerUrl(url) {
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
 * @returns {Promise<void>}
 */
export async function writeDataToBlob(data) {
  try {
    console.log('📤 Writing data to blob storage...');
    
    // Add metadata timestamp
    const dataWithTimestamp = {
      ...data,
      _metadata: {
        ...data._metadata,
        lastUpdated: new Date().toISOString(),
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
    
    console.log('✅ Data written successfully to blob storage at:', dataWithTimestamp._metadata.lastUpdated);
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
