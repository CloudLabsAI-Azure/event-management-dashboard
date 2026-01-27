# Data Sync Configuration Guide

## Overview
Your app now has a comprehensive automatic data synchronization system running on the **backend server**. This ensures:
- ✅ **Single source of truth** - All admins see the same configuration
- ✅ **Reliable scheduling** - Runs even when no browser is open
- ✅ **No conflicts** - Only one scheduler runs at a time
- ✅ **Persistent across devices** - Configuration shared across all users

All existing features (manual add, bulk CSV upload) are preserved.

## Features Implemented

### ✅ Backend Scheduler
- **Runs on the Node.js server** (not in browser)
- Uses `node-cron` for reliable scheduling
- Starts automatically when server starts
- Syncs data even when no one is logged in

### ✅ Automatic Scheduled Sync
- **Hourly, Daily, or Weekly** sync intervals
- Background scheduler runs automatically on server
- Syncs from publicly accessible Excel files
- Configurable per resource type

### ✅ Manual Sync Options
- **Sync Now Button**: Immediately sync all enabled resources
- **Bulk CSV Upload**: Existing feature (preserved)
- **Manual Add**: Existing feature (preserved)

### ✅ Sync Modes
- **Replace All**: Delete all existing data, import fresh from Excel
- **Smart Merge**: Update existing items, add new ones, optionally delete items not in Excel

### ✅ Resource Types Supported
- Catalog Items
- Top 25 Tracks
- Roadmap Items
- Localized Tracks

## How to Use

### Access the Sync Configuration Page
1. Login as **Admin** user
2. Navigate to **System → Data Sync** in the sidebar
3. Configure your sync settings

### Setup Auto-Sync

#### Step 1: Enable Auto-Sync
1. Toggle **"Auto-Sync"** switch ON
2. Select sync interval: **Hourly**, **Daily**, or **Weekly**
3. Backend scheduler will start automatically

#### Step 2: Configure Resources
For each resource you want to sync:

1. **Toggle the resource ON** (e.g., "Catalog Items")
2. **Enter Excel URL**: Paste the public URL of your Excel file
   - Example: `https://example.com/catalog-data.xlsx`
3. **Select Sync Mode**:
   - **Replace All**: Clean slate each sync
   - **Smart Merge**: Preserve existing, update/add new
4. **Delete Options** (Smart Merge only):
   - Check "Delete items not in Excel" to remove old data

#### Step 3: Test Your Setup
1. Click **"Sync Now"** button to test immediately
2. Check the **"Recent Sync History"** section for results
3. Verify data in the respective pages (Catalog, Tracks, etc.)

### Excel File Format

Each resource type expects specific columns:

#### Catalog Items
```
eventName | catalogType | catalogPublishDate | eventURL | testingStatus
```

#### Top 25 Tracks
```
trackName | testingStatus | releaseNotes
```

#### Roadmap Items
```
trackTitle | phase | eta
```

#### Localized Tracks
```
trackName | language | localizationStatus
```

**Note**: Column names are case-insensitive (trackName, TrackName, TRACKNAME all work)

## Sync History

The page displays the last 10 sync operations with:
- ✅ Success or ❌ Error status
- Timestamp
- Number of items processed
- Error messages (if any)

## Technical Details

### Backend Files Created
1. **`backend/syncConfig.js`**: Configuration management (file-based storage)
2. **`backend/syncScheduler.js`**: Auto-sync scheduler with node-cron
3. **`backend/sync-config.json`**: Configuration storage file (auto-created)

### Frontend Files Created
1. **`src/lib/syncConfig.ts`**: Frontend API client for sync config
2. **`src/lib/syncScheduler.ts`**: Frontend sync trigger (calls backend)
3. **`src/pages/SyncConfigurationPage.tsx`**: Admin UI for configuration
4. **`src/services/excelUrlImport.ts`**: Excel fetching and parsing utilities

### Backend API Endpoints
- `GET /api/sync-config`: Get current configuration
- `PUT /api/sync-config/global`: Update global settings (auto-sync, interval)
- `PUT /api/sync-config/resource/:resourceType`: Update resource config
- `POST /api/sync-now`: Trigger manual sync immediately
- `GET /api/sync-history`: Get sync operation history

### Configuration Storage
- Stored in **`backend/sync-config.json`**
- Shared across all users and devices
- Persists across server restarts
- Backed up with your application data

### Scheduler Details
- **Cron Expressions**:
  - Hourly: `0 * * * *` (every hour at minute 0)
  - Daily: `0 2 * * *` (every day at 2 AM)
  - Weekly: `0 2 * * 0` (every Sunday at 2 AM)
- **Auto-start**: Scheduler initializes when backend server starts
- **Auto-restart**: Scheduler restarts when configuration changes

## Troubleshooting

### Sync Fails
1. **Check Excel URL**: Ensure it's publicly accessible (no authentication required)
2. **Verify Format**: Column names must match expected format
3. **Check Backend Logs**: Look at Node.js console output for errors
4. **Review History**: Check "Recent Sync History" for error messages

### Auto-Sync Not Running
1. Ensure **"Auto-Sync" toggle is ON** in the UI
2. At least one resource must be **enabled with a valid URL**
3. Check **backend console** for "[Sync] Scheduler started successfully" message
4. Verify backend server is running

### Wrong Data Imported
1. **Review Sync Mode**: Replace All vs Smart Merge
2. **Check Excel Data**: Verify column names and data format
3. **Use Test URL**: Test with a small dataset first

### Configuration Not Saving
1. Check **file permissions** on backend/sync-config.json
2. Ensure backend has **write access** to its directory
3. Check backend console for file system errors

## Best Practices

### For Production
1. **Start with Smart Merge**: Less destructive than Replace All
2. **Test with Small Dataset**: Verify format before full sync
3. **Monitor First Few Syncs**: Check history after each scheduled run
4. **Use Daily Sync**: Good balance between freshness and load
5. **Keep Excel URLs Updated**: Update URLs if file locations change
6. **Backup sync-config.json**: Include in your backup strategy

### For Development
1. **Use Separate Excel Files**: Dev vs Prod data sources
2. **Test Manual Sync First**: Before enabling auto-sync
3. **Check Permissions**: Ensure Excel URLs don't require authentication
4. **Monitor Backend Logs**: Watch Node.js console during sync operations

## Security Notes
- Excel URLs must be **publicly accessible** (no auth)
- Admin-only feature (protected by user role)
- Configuration stored on **backend server** (not in browser)
- All sync operations **logged with timestamps**

## Important Deployment Notes

⚠️ **GitHub Actions Workflow**: Ensure `sync-config.json` is NOT overwritten during deployment

Add to `.github/workflows/main_*.yml`:
```yaml
paths-ignore:
  - 'backend/data.json'
  - 'backend/sync-config.json'  # Add this line
  - 'backend/uploads/**'
```

## Next Steps

### Potential Enhancements
- **Email Notifications**: Alert admins on sync failures
- **Webhook Support**: Trigger syncs from external events
- **Detailed Logs**: More granular sync operation logs per resource
- **Dry Run Mode**: Preview changes before applying
- **Multi-file Support**: Multiple Excel URLs per resource
- **Sync Status Dashboard**: Real-time sync status indicators

---

## Quick Start Checklist

- [ ] Login as Admin
- [ ] Navigate to System → Data Sync
- [ ] Enable Auto-Sync
- [ ] Choose sync interval (Daily recommended)
- [ ] Enable "Catalog Items" resource
- [ ] Enter Excel URL for catalog data
- [ ] Select "Smart Merge" mode
- [ ] Click "Sync Now" to test
- [ ] Verify data in Catalog Health page
- [ ] Check sync history for success
- [ ] Verify backend logs show sync activity
- [ ] Repeat for other resources as needed

**You're all set! Your data will now sync automatically on the backend server. 🎉**

## Architecture Benefits

### Before (localStorage + Frontend Scheduler)
- ❌ Configuration per browser/device
- ❌ Multiple schedulers could conflict
- ❌ Required browser to be open
- ❌ No sync when logged out

### After (Backend Scheduler)
- ✅ Single configuration for all admins
- ✅ One reliable scheduler
- ✅ Syncs even when no one is logged in
- ✅ Production-ready architecture
