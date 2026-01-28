// Azure DevOps Service - Event Summary Log Integration
// Fetches work items, extracts images from Custom_Feedback HTML, and marks as processed
import https from 'https';

/**
 * Make an HTTPS request to Azure DevOps API
 */
function makeRequest(url, options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            return;
          }
          resolve(JSON.parse(data));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Query Event Summary Log work items that need processing
 * @param {string} organization - DevOps organization name
 * @param {string} project - DevOps project name
 * @param {string} pat - Personal Access Token
 * @param {string} lastSyncDate - ISO date string of last sync (optional)
 * @param {Array<number>} processedIds - Array of work item IDs already processed locally
 * @returns {Promise<Array>} Array of work item IDs
 */
export async function getEventSummaryLogs(organization, project, pat, lastSyncDate = null, processedIds = []) {
  // Build WIQL query for Event Summary Log items
  // Note: We track processed items locally instead of using DevOps tags (no write permission needed)
  let wiql = `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] = 'Event Summary Log'
  `;
  
  // If lastSyncDate provided, only get items changed since then
  if (lastSyncDate) {
    wiql += `  AND [System.ChangedDate] >= '${lastSyncDate}'`;
  }
  
  wiql += `
    ORDER BY [System.ChangedDate] DESC
  `;

  const wiqlUrl = `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.0`;
  const auth = Buffer.from(`:${pat}`).toString('base64');
  const postData = JSON.stringify({ query: wiql });

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  console.log('📋 Querying Event Summary Log work items...');
  const result = await makeRequest(wiqlUrl, options, postData);
  const allIds = result.workItems ? result.workItems.map(wi => wi.id) : [];
  
  // Filter out locally tracked processed IDs
  const processedSet = new Set(processedIds);
  const workItemIds = allIds.filter(id => !processedSet.has(id));
  
  console.log(`📋 Found ${allIds.length} Event Summary Log items, ${workItemIds.length} unprocessed`);
  return workItemIds;
}

/**
 * Get work item details including all fields
 * @param {string} organization - DevOps organization name
 * @param {string} project - DevOps project name
 * @param {string} pat - Personal Access Token
 * @param {number} workItemId - Work item ID
 * @returns {Promise<Object>} Work item details
 */
export async function getWorkItemDetails(organization, project, pat, workItemId) {
  const url = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}?$expand=all&api-version=7.0`;
  const auth = Buffer.from(`:${pat}`).toString('base64');

  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };

  return makeRequest(url, options);
}

/**
 * Add a tag to mark work item as processed
 * @param {string} organization - DevOps organization name
 * @param {string} project - DevOps project name
 * @param {string} pat - Personal Access Token
 * @param {number} workItemId - Work item ID
 * @returns {Promise<Object>} Updated work item
 */
export async function markWorkItemAsProcessed(organization, project, pat, workItemId) {
  const url = `https://dev.azure.com/${organization}/${project}/_apis/wit/workitems/${workItemId}?api-version=7.0`;
  const auth = Buffer.from(`:${pat}`).toString('base64');
  
  // PATCH operation to add tag
  const patchData = JSON.stringify([
    {
      op: 'add',
      path: '/fields/System.Tags',
      value: 'FeedbackProcessed'
    }
  ]);

  const options = {
    method: 'PATCH',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json-patch+json',
      'Content-Length': Buffer.byteLength(patchData)
    }
  };

  console.log(`🏷️ Marking work item ${workItemId} as processed...`);
  return makeRequest(url, options, patchData);
}

/**
 * Download an image from a URL
 * @param {string} imageUrl - Image URL (can be DevOps attachment or external)
 * @param {string} pat - Personal Access Token (for DevOps URLs)
 * @returns {Promise<Buffer>} Image data
 */
export async function downloadImage(imageUrl, pat) {
  return new Promise((resolve, reject) => {
    const headers = {};
    
    // Add auth header if it's an Azure DevOps URL
    if (imageUrl.includes('dev.azure.com') || imageUrl.includes('visualstudio.com')) {
      const auth = Buffer.from(`:${pat}`).toString('base64');
      headers['Authorization'] = `Basic ${auth}`;
    }

    const options = {
      method: 'GET',
      headers
    };

    const req = https.request(imageUrl, options, (res) => {
      // Handle redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, pat).then(resolve).catch(reject);
      }
      
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Parse HTML content and extract image URLs
 * @param {string} html - HTML content from Custom_Feedback field
 * @returns {Array<{url: string, alt: string}>} Array of image info
 */
export function extractImagesFromHtml(html) {
  if (!html) return [];
  
  const images = [];
  
  // Match <img> tags and extract src
  const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*(?:alt=["']([^"']*)["'])?[^>]*>/gi;
  let match;
  
  while ((match = imgRegex.exec(html)) !== null) {
    const url = match[1];
    const alt = match[2] || '';
    
    // Skip data URLs (inline base64 images) - we'd need different handling
    if (!url.startsWith('data:')) {
      images.push({ url, alt });
    }
  }
  
  // Also look for Azure DevOps attachment references
  // Format: /_apis/wit/attachments/GUID
  const attachmentRegex = /\/_apis\/wit\/attachments\/([a-f0-9-]+)/gi;
  while ((match = attachmentRegex.exec(html)) !== null) {
    const attachmentId = match[1];
    images.push({ 
      url: match[0], 
      alt: `attachment-${attachmentId}`,
      isAttachment: true 
    });
  }
  
  console.log(`🖼️ Extracted ${images.length} images from HTML`);
  return images;
}

/**
 * Process Event Summary Log work items and extract feedback images
 * @param {string} organization - DevOps organization name
 * @param {string} project - DevOps project name
 * @param {string} pat - Personal Access Token
 * @param {string} customFeedbackField - Field name for Custom_Feedback (e.g., 'Custom.Feedback')
 * @param {string} eventDateField - Field name for EventDate (e.g., 'Custom.EventDate')
 * @param {string} eventIdField - Field name for EventID (e.g., 'Custom.EventID')
 * @param {string} lastSyncDate - ISO date of last sync (optional)
 * @param {number} limit - Maximum items to process
 * @param {Array<number>} processedIds - Array of work item IDs already processed locally
 * @returns {Promise<Array>} Array of feedback items with images
 */
export async function processEventSummaryLogs(
  organization, 
  project, 
  pat, 
  customFeedbackField = 'Custom.Feedback',
  eventDateField = 'Custom.EventDate',
  eventIdField = 'Custom.EventID',
  lastSyncDate = null,
  limit = 50,
  processedIds = []
) {
  try {
    console.log('🔄 Starting Event Summary Log processing...');
    console.log(`  Organization: ${organization}`);
    console.log(`  Project: ${project}`);
    console.log(`  Feedback Field: ${customFeedbackField}`);
    console.log(`  Event Date Field: ${eventDateField}`);
    console.log(`  Event ID Field: ${eventIdField}`);
    console.log(`  Last Sync: ${lastSyncDate || 'none (full sync)'}`);
    console.log(`  Already processed: ${processedIds.length} work items`);
    
    // Get unprocessed work items (filtered by local tracking)
    const workItemIds = await getEventSummaryLogs(organization, project, pat, lastSyncDate, processedIds);
    const limitedIds = workItemIds.slice(0, limit);
    
    if (limitedIds.length === 0) {
      console.log('✅ No unprocessed Event Summary Log items found');
      return { items: [], processed: 0, skipped: 0, errors: [] };
    }
    
    console.log(`📥 Processing ${limitedIds.length} work items...`);
    
    const feedbackItems = [];
    const errors = [];
    let processed = 0;
    let skipped = 0;
    
    for (const id of limitedIds) {
      try {
        const workItem = await getWorkItemDetails(organization, project, pat, id);
        const fields = workItem.fields || {};
        
        const title = fields['System.Title'] || '';
        const eventDate = fields[eventDateField] || fields['System.CreatedDate'] || '';
        const eventId = fields[eventIdField] || '';
        const customFeedback = fields[customFeedbackField] || '';
        
        console.log(`\n📄 Work Item ${id}: ${title}`);
        console.log(`   Event ID: ${eventId || '(none)'}`);
        console.log(`   Event Date: ${eventDate}`);
        
        // Check if Custom_Feedback has content
        if (!customFeedback || customFeedback.trim() === '') {
          console.log(`   ⏭️ No feedback content, skipping`);
          skipped++;
          // Track locally as processed (no DevOps write needed)
          continue;
        }
        
        // Extract images from HTML
        const images = extractImagesFromHtml(customFeedback);
        
        if (images.length === 0) {
          console.log(`   ⏭️ No images in feedback, skipping`);
          skipped++;
          continue;
        }
        
        console.log(`   🖼️ Found ${images.length} images`);
        
        // Process each image
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          let imageUrl = img.url;
          
          // If it's a relative DevOps URL, make it absolute
          if (imageUrl.startsWith('/')) {
            imageUrl = `https://dev.azure.com/${organization}${imageUrl}`;
          }
          
          feedbackItems.push({
            workItemId: id,
            workItemTitle: title,
            eventId: eventId,
            eventDate: eventDate,
            imageUrl: imageUrl,
            imageAlt: img.alt,
            imageIndex: i,
            isAttachment: img.isAttachment || false
          });
        }
        
        // Successfully processed this work item
        processed++;
        
      } catch (err) {
        console.error(`❌ Error processing work item ${id}:`, err.message);
        errors.push({ workItemId: id, error: err.message });
      }
    }
    
    console.log(`\n✅ Processing complete:`);
    console.log(`   Processed: ${processed}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors: ${errors.length}`);
    console.log(`   Total images: ${feedbackItems.length}`);
    
    // Return the work item IDs that were processed so caller can track locally
    const processedWorkItemIds = limitedIds.filter(id => !errors.some(e => e.workItemId === id));
    
    return { 
      items: feedbackItems, 
      processed, 
      skipped, 
      errors,
      processedWorkItemIds,
      syncTime: new Date().toISOString()
    };
    
  } catch (err) {
    console.error('❌ Error in processEventSummaryLogs:', err);
    throw err;
  }
}

// Keep legacy function for backward compatibility
export async function getWorkItems(organization, project, pat, query = null) {
  const wiql = query || `
    SELECT [System.Id]
    FROM WorkItems
    WHERE [System.WorkItemType] = 'Event Summary Log'
    ORDER BY [System.ChangedDate] DESC
  `;

  const wiqlUrl = `https://dev.azure.com/${organization}/${project}/_apis/wit/wiql?api-version=7.0`;
  const auth = Buffer.from(`:${pat}`).toString('base64');
  const postData = JSON.stringify({ query: wiql });

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const result = await makeRequest(wiqlUrl, options, postData);
  return result.workItems ? result.workItems.map(wi => wi.id) : [];
}

// Keep legacy downloadAttachment for compatibility
export async function downloadAttachment(attachmentUrl, pat) {
  return downloadImage(attachmentUrl, pat);
}

// Legacy function - now uses processEventSummaryLogs
export async function getScreenshotsFromWorkItems(organization, project, pat, limit = 50) {
  const result = await processEventSummaryLogs(
    organization, 
    project, 
    pat,
    process.env.AZURE_DEVOPS_FEEDBACK_FIELD || 'Custom.Feedback',
    process.env.AZURE_DEVOPS_EVENTDATE_FIELD || 'Custom.EventDate',
    null, // No last sync date for full sync
    limit
  );
  
  // Convert to legacy format
  return result.items.map(item => ({
    workItemId: item.workItemId,
    workItemTitle: item.workItemTitle,
    workItemType: 'Event Summary Log',
    attachmentUrl: item.imageUrl,
    fileName: `feedback_${item.workItemId}_${item.imageIndex}.png`,
    size: 0,
    comment: item.eventDate,
    eventDate: item.eventDate
  }));
}
