// Simple Express server with Azure Blob Storage
import express from 'express';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import multer from 'multer';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { readDataFromBlob, writeDataToBlob, getBlobMetadata, blobExists } from './blobStorageService.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_PATH = path.join(__dirname, 'data.json');

// Storage mode: 'blob' for Azure Blob Storage, 'local' for local file system
const STORAGE_MODE = process.env.STORAGE_MODE || 'blob';

// Helper to read/write JSON - supports both blob and local storage
async function readData() {
  if (STORAGE_MODE === 'blob') {
    return await readDataFromBlob();
  } else {
    // Local file system fallback
    try {
      if (!fs.existsSync(DATA_PATH)) return {};
      const raw = fs.readFileSync(DATA_PATH, 'utf8');
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.error('readData error', err);
      return {};
    }
  }
}

async function writeData(data, options = {}) {
  if (STORAGE_MODE === 'blob') {
    await writeDataToBlob(data, options);
  } else {
    // Local file system fallback
    try {
      const { updateTimestamp = true } = options;
      const timestamp = updateTimestamp ? new Date().toISOString() : (data._metadata?.lastUpdated || new Date().toISOString());
      
      const dataWithTimestamp = {
        ...data,
        _metadata: {
          ...data._metadata,
          lastUpdated: timestamp,
          lastModifiedBy: 'system'
        }
      };
      fs.writeFileSync(DATA_PATH, JSON.stringify(dataWithTimestamp, null, 2), 'utf8');
      console.log(`Data written successfully. Timestamp: ${timestamp} ${updateTimestamp ? '(updated)' : '(preserved)'}`);
    } catch (err) {
      console.error('writeData error', err);
      throw err;
    }
  }
}

// Routes
app.get('/api/data', async (req, res) => {
  try {
    const data = await readData();
    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Get last updated timestamp
app.get('/api/last-updated', async (req, res) => {
  try {
    const data = await readData();
    
    // Priority 1: Use metadata timestamp from data (most reliable)
    let lastUpdated = data._metadata?.lastUpdated;
    
    // Priority 2: If no metadata and using local storage, use file's last modified time
    if (!lastUpdated && STORAGE_MODE === 'local') {
      try {
        const stats = fs.statSync(DATA_PATH);
        lastUpdated = stats.mtime.toISOString();
        // Don't write back to avoid updating the timestamp
      } catch (e) {
        console.error('Error reading file stats:', e);
      }
    }
    
    // Priority 3: Final fallback (shouldn't happen in production)
    if (!lastUpdated) {
      lastUpdated = new Date().toISOString();
      console.warn('⚠️  Using current time as fallback for last-updated - no metadata found');
    }
    
    console.log('📅 Last updated timestamp:', lastUpdated, 'Source:', data._metadata?.lastUpdated ? 'metadata' : (STORAGE_MODE === 'local' ? 'file-stat' : 'fallback'));
    
    res.json({ 
      lastUpdated,
      source: data._metadata?.lastUpdated ? 'metadata' : (STORAGE_MODE === 'local' ? 'file-stat' : 'fallback')
    });
  } catch (err) {
    console.error('Error in /api/last-updated:', err);
    res.status(500).json({ error: 'Failed to get last updated timestamp' });
  }
});

// Reviews screenshots upload (images or PDFs). Multiple files accepted.
app.post('/api/upload-review', requireAdmin, upload.array('files', 10), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : []
    const eventName = req.body.eventName || ''
    const data = await readData()
    data.reviews = Array.isArray(data.reviews) ? data.reviews : []
    const saved = files.map(f => ({
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
      originalName: f.originalname,
      eventName: eventName.trim() || f.originalname, // Use event name or fallback to filename
      mime: f.mimetype,
      size: f.size,
      path: `/uploads/${path.basename(f.path)}`,
      uploadedAt: Date.now(),
    }))
    data.reviews.push(...saved)
    await writeData(data)
    return res.json({ success: true, items: saved })
  } catch (err) {
    console.error('upload-review error', err)
    return res.status(500).json({ success: false, error: 'upload failed' })
  }
})

app.post('/api/data', async (req, res) => {
  await writeData(req.body || {});
  res.json({ success: true });
});

// Delete review endpoint
app.delete('/api/reviews/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    const data = await readData()
    
    if (!Array.isArray(data.reviews)) {
      return res.status(404).json({ success: false, error: 'Review not found' })
    }
    
    const reviewIndex = data.reviews.findIndex(review => review.id === id)
    if (reviewIndex === -1) {
      return res.status(404).json({ success: false, error: 'Review not found' })
    }
    
    // Remove the review from data
    const deletedReview = data.reviews.splice(reviewIndex, 1)[0]
    await writeData(data)
    
    // Optionally delete the file from filesystem
    try {
      const filePath = path.join(process.cwd(), 'uploads', path.basename(deletedReview.path))
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }
    } catch (fileErr) {
      console.warn('Could not delete file:', fileErr.message)
    }
    
    res.json({ success: true, message: 'Review deleted successfully' })
  } catch (err) {
    console.error('delete review error', err)
    res.status(500).json({ success: false, error: 'Delete failed' })
  }
});

// Serve frontend (production build) if present
const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// SPA fallback: for non-API GET requests not matching a static file, return index.html
app.get(/^(?!\/api\/).*/, (req, res, next) => {
  if (req.method !== 'GET') return next();
  // If file exists (e.g., image), let static middleware handle it
  const requested = path.join(distDir, req.path);
  if (fs.existsSync(requested) && fs.lstatSync(requested).isFile()) {
    return res.sendFile(requested);
  }
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  return next();
});
// Helper: get/set resource arrays inside data.json
const VALID_RESOURCES = new Set(['tracks', 'catalog', 'users', 'events']);

// expose metrics as a top-level editable resource
async function getMetrics() {
  const data = await readData();
  return data.metrics || null;
}

async function setMetrics(metrics) {
  const data = await readData();
  data.metrics = metrics;
  await writeData(data);
}

async function getResource(name) {
  const data = await readData();
  return data[name] || [];
}

async function setResource(name, arr) {
  const data = await readData();
  data[name] = arr;
  await writeData(data);
}

// Ensure data schema (tokens as objects, users list) exists and normalize old tokens
async function ensureDataSchema() {
  const data = await readData();
  let changed = false;
  if (!Array.isArray(data.tokens)) {
    data.tokens = [];
    changed = true;
  } else {
    // normalize string tokens to objects { token, userId, role }
    const normalized = data.tokens.map((t) => {
      if (typeof t === 'string') {
        return { token: t, userId: null, role: 'admin' };
      }
      return t;
    });
    // detect change
    if (JSON.stringify(normalized) !== JSON.stringify(data.tokens)) {
      data.tokens = normalized;
      changed = true;
    }
  }
  if (!Array.isArray(data.users)) {
    data.users = [];
    changed = true;
  }
  // If no users exist, create a default admin (dev only)
  if (data.users.length === 0) {
    const hashed = bcrypt.hashSync('password', 8);
    const defaultAdmin = { 
      id: 'admin', 
      username: 'admin', 
      email: 'admin@example.com', 
      password: hashed, 
      role: 'admin' 
    };
    data.users.push(defaultAdmin);
    console.warn('No users found in data.json — creating default admin: admin@example.com/password (hashed)');
    changed = true;
  }
  if (changed) {
    console.log('📝 Schema changes detected, updating data (preserving timestamp)...');
    await writeData(data, { updateTimestamp: false });
  } else {
    console.log('✅ Data schema is up to date, no changes needed');
  }
}

await ensureDataSchema();

// Simple auth middleware: expects Authorization: Bearer <token>
async function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const parts = String(auth).split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
  const token = parts[1];
  
  const data = await readData();
  if (!Array.isArray(data.tokens)) return res.status(401).json({ error: 'Invalid token' });
  // cleanup expired tokens
  data.tokens = (data.tokens || []).filter((t) => !t.expiresAt || Number(t.expiresAt) > Date.now());
  await writeData(data);
  const entry = data.tokens.find((t) => t && t.token === token);
  if (!entry) return res.status(401).json({ error: 'Invalid token' });
  // attach user metadata for downstream handlers
  req.user = { id: entry.userId, role: entry.role };
  next();
}

async function requireAdmin(req, res, next) {
  // ensure authenticated first
  const auth = req.headers['authorization'] || '';
  const parts = String(auth).split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
  const token = parts[1];
  
  const data = await readData();
  const entry = Array.isArray(data.tokens) && data.tokens.find((t) => t && t.token === token);
  if (!entry) return res.status(401).json({ error: 'Invalid token' });
  if (entry.expiresAt && Number(entry.expiresAt) <= Date.now()) return res.status(401).json({ error: 'Token expired' });
  if (entry.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
  req.user = { id: entry.userId, role: entry.role };
  next();
}

// Login endpoint: POST /api/login { email, password } or { username, password }
// Supports login with either email or username for backward compatibility
app.post('/api/login', async (req, res) => {
  const { email, username, password } = req.body || {};
  const loginField = email || username; // Use email if provided, otherwise username
  try {
    const data = await readData();
    // Find user by email or username
    const user = Array.isArray(data.users) && data.users.find((u) => {
      if (!u) return false;
      // If email is provided, search by email; otherwise search by username
      if (email) {
        return String(u.email || '').toLowerCase() === String(email).toLowerCase();
      } else {
        return String(u.username || '') === String(username);
      }
    });
    if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    // verify password: support hashed passwords and fallback to plaintext migration
    const provided = String(password || '');
    let ok = false;
    try {
      if (user.password && bcrypt.compareSync(provided, String(user.password))) {
        ok = true;
      }
    } catch (e) {
      // compareSync may throw if stored password isn't a hash — fallback below
    }
    if (!ok) {
      // fallback: if stored password equals provided plaintext, migrate to hash
      if (user.password && String(user.password) === provided) {
        const data2 = await readData();
        // update the user's password to hashed
        data2.users = (data2.users || []).map((u) => (String(u.id) === String(user.id) ? { ...u, password: bcrypt.hashSync(provided, 8) } : u));
        await writeData(data2);
        ok = true;
      }
    }
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid credentials' });
    // If the user was created with a temporary password and hasn't reset yet,
    // require a password reset before issuing a normal token. We still consider
    // the provided password valid (we matched above) but return mustReset flag.
    if (user.mustReset) {
      return res.json({ success: true, mustReset: true, message: 'Password reset required' });
    }
    // generate token tied to user id and role
    const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days
  data.tokens = data.tokens || [];
  data.tokens.push({ token, userId: user.id, role: user.role || 'user', expiresAt });
    await writeData(data);
    return res.json({ success: true, token, role: user.role || 'user' });
  } catch (err) {
    console.error('Login handler error', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, error: String(err && err.message ? err.message : err) });
  }
});

// B2C Authentication validation endpoint
app.post('/api/validate-b2c-user', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ 
      success: false, 
      error: 'Email is required' 
    });
  }

  try {
    const data = await readData();
    
    // Find user by email in the users array
    const user = Array.isArray(data.users) && data.users.find(u => 
      u && u.email && u.email.toLowerCase() === email.toLowerCase()
    );
    
    if (user) {
      // Generate a session token for the validated B2C user
      const token = crypto.randomBytes(24).toString('hex');
      const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
      
      // Store the token
      if (!Array.isArray(data.tokens)) data.tokens = [];
      data.tokens.push({ 
        token, 
        userId: user.id, 
        role: user.role || 'user', 
        expiresAt,
        source: 'b2c' // Mark as B2C authenticated
      });
      await writeData(data);
      
      return res.json({ 
        success: true, 
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role || 'user'
        },
        token,
        role: user.role || 'user'
      });
    }
    
    return res.status(403).json({ 
      success: false, 
      error: 'User not found. Please contact administrator.' 
    });
    
  } catch (err) {
    console.error('B2C validation error:', err);
    return res.status(500).json({ 
      success: false, 
      error: 'Error validating user credentials' 
    });
  }
});

// Self-service password reset: user provides email/username, oldPassword (temporary) and newPassword
app.post('/api/reset-password', async (req, res) => {
  const { email, username, oldPassword, newPassword } = req.body || {};
  const loginField = email || username;
  if (!loginField || !oldPassword || !newPassword) return res.status(400).json({ success: false, error: 'Missing parameters' });
  try {
    const data = await readData();
    const users = data.users || [];
    // Find user by email or username
    const user = users.find((u) => {
      if (!u) return false;
      if (email) {
        return String(u.email || '').toLowerCase() === String(email).toLowerCase();
      } else {
        return String(u.username || '') === String(username);
      }
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    // Only allow reset when mustReset is true (created with temporary password)
    if (!user.mustReset) return res.status(400).json({ success: false, error: 'Password reset not required' });
    // verify oldPassword matches stored hash
    let ok = false;
    try {
      if (user.password && bcrypt.compareSync(String(oldPassword), String(user.password))) ok = true;
    } catch (e) {
      // ignore
    }
    if (!ok) return res.status(401).json({ success: false, error: 'Invalid temporary password' });
    // update to new password and clear mustReset
    const hashed = bcrypt.hashSync(String(newPassword), 8);
    data.users = users.map((u) => (String(u.id) === String(user.id) ? { ...u, password: hashed, mustReset: false } : u));
    // generate token so user can be logged in after reset
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
    data.tokens = data.tokens || [];
    data.tokens.push({ token, userId: user.id, role: user.role || 'user', expiresAt });
    await writeData(data);
    return res.json({ success: true, token, role: user.role || 'user' });
  } catch (err) {
    console.error('reset-password error', err);
    return res.status(500).json({ success: false, error: 'Reset failed' });
  }
});

// Users management endpoints (admin only for create/update/delete)
// List users (admin only under SSO model)
app.get('/api/users', requireAdmin, async (req, res) => {
  const data = await readData();
  const users = (data.users || []).map((u) => ({ id: u.id, username: u.username, email: u.email, role: u.role }));
  res.json(users);
});

app.post('/api/users', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const data = await readData();
  const users = data.users || [];
  const id = String(payload.id || `u_${Date.now()}`);

  if (!payload.email) {
    return res.status(400).json({ success: false, error: 'Email is required' });
  }
  const email = String(payload.email).toLowerCase();
  const existingUser = users.find(u => u && String(u.email || '').toLowerCase() === email);
  if (existingUser) {
    return res.status(400).json({ success: false, error: 'Email already exists' });
  }
  const username = String(payload.username || email.split('@')[0] || id);
  const newUser = {
    id,
    username,
    email,
    role: payload.role === 'admin' ? 'admin' : 'user'
  };
  users.push(newUser);
  data.users = users;
  await writeData(data);
  return res.json({ success: true, user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role } });
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const data = await readData();
  const body = { ...req.body };
  // Ignore any password fields under SSO model
  delete body.password;
  delete body.mustReset;
  if (body.email) body.email = String(body.email).toLowerCase();
  data.users = (data.users || []).map((u) => (String(u.id) === id ? { ...u, ...body } : u));
  await writeData(data);
  const updated = (data.users || []).find(u => String(u.id) === id);
  res.json({ success: true, user: updated ? { id: updated.id, username: updated.username, email: updated.email, role: updated.role } : null });
});

// Logout: invalidate token
app.post('/api/logout', requireAuth, async (req, res) => {
  const auth = req.headers['authorization'] || '';
  const parts = String(auth).split(' ');
  const token = parts[1];
  const data = await readData();
  data.tokens = (data.tokens || []).filter((t) => t.token !== token);
  await writeData(data);
  res.json({ success: true });
});

app.delete('/api/users/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const data = await readData();
  data.users = (data.users || []).filter((u) => String(u.id) !== id);
  await writeData(data);
  res.json({ success: true });
});

// Compatibility endpoint: append to tracks
app.post('/api/add-track', async (req, res) => {
  const item = req.body || {};
  const tracks = await getResource('tracks');
  const nextSr = tracks.length > 0 ? Math.max(...tracks.map(t => Number(t.sr || 0))) + 1 : 1;
  const newItem = { ...item, sr: Number(item.sr || nextSr) };
  tracks.push(newItem);
  await setResource('tracks', tracks);
  res.json({ success: true, item: newItem });
});

// Generic CSV upload: ?resource=tracks|catalog|users|events (defaults to tracks)
app.post('/api/upload-csv', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const resource = String(req.query.resource || 'tracks');
  const results = [];
  
  // Define required columns for each resource type
  const requiredColumns = {
    catalog: ['trackName', 'eventDate', 'status'],
    roadmap: ['trackTitle', 'phase', 'eta'], // Special case for roadmap items
    tracks: ['trackName', 'testingStatus', 'releaseNotes'],
    events: ['title', 'date', 'status'],
    users: ['username', 'email', 'role']
  };
  
  let required = requiredColumns[resource] || [];
  
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        // Validate that we have data
        if (results.length === 0) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ 
            success: false, 
            error: 'CSV file is empty or could not be parsed' 
          });
        }
        
        // Check if this is a roadmap CSV (has type='roadmapItem' in first row)
        const firstRow = results[0];
        if (resource === 'catalog' && firstRow.type === 'roadmapItem') {
          required = requiredColumns['roadmap'];
        }
        
        // Validate required columns exist in the first row
        const missingColumns = required.filter(col => !(col in firstRow));
        
        if (missingColumns.length > 0) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ 
            success: false, 
            error: `Missing required columns: ${missingColumns.join(', ')}. Expected columns: ${required.join(', ')}` 
          });
        }
        
        // Filter out empty rows
        const validResults = results.filter(item => {
          return required.some(col => item[col] && String(item[col]).trim() !== '');
        });
        
        if (validResults.length === 0) {
          fs.unlink(req.file.path, () => {});
          return res.status(400).json({ 
            success: false, 
            error: 'No valid data rows found in CSV. Please check the file format.' 
          });
        }
        
        const existing = await getResource(resource);
        const startingSr = existing.length;
        
        console.log(`CSV Upload: Processing ${validResults.length} valid rows for ${resource}`);
        
        // Assign unique IDs and serial numbers to new items
        const processedResults = validResults.map((item, idx) => ({
          ...item,
          id: item.id || crypto.randomBytes(8).toString('hex'),
          sr: startingSr + idx + 1,
          // Use type from CSV if provided, otherwise default based on resource
          type: item.type || (resource === 'catalog' ? 'catalog' : (resource === 'tracks' ? 'track' : resource))
        }));
        
        const merged = (existing || []).concat(processedResults);
        await setResource(resource, merged);
        
        console.log(`CSV Upload: Successfully saved ${processedResults.length} items to ${resource}`);
        
        res.json({ 
          success: true, 
          resource, 
          uploaded: processedResults.length,
          total: results.length,
          message: `Successfully uploaded ${processedResults.length} items${results.length !== processedResults.length ? ` (${results.length - processedResults.length} rows skipped due to missing data)` : ''}`
        });
      } catch (err) {
        console.error('CSV save error', err);
        res.status(500).json({ success: false, error: 'CSV save error: ' + err.message });
      } finally {
        fs.unlink(req.file.path, (err) => { if (err) console.warn('cleanup error', err); });
      }
    })
    .on('error', (err) => {
      console.error('CSV parse error', err);
      res.status(500).json({ success: false, error: 'CSV parse error. Please ensure the file is a valid CSV.' });
      fs.unlink(req.file.path, () => {});
    });
});

// Generic resource endpoints (GET, POST append, PUT update by id/sr, DELETE by id/sr)
// Return current user info based on token
app.get('/api/me', requireAuth, (req, res) => {
  try {
    const data = readData();
    const userId = req.user && req.user.id;
    const user = (data.users || []).find((u) => String(u.id) === String(userId));
    if (!user) return res.json({ id: userId, role: req.user && req.user.role ? req.user.role : 'user' });
    return res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    return res.status(500).json({ error: 'me lookup failed' });
  }
});

// metrics endpoints (must be defined before the generic /api/:resource route)
app.get('/api/metrics', async (req, res) => {
  const metrics = await getMetrics();
  if (!metrics) return res.status(404).json({ error: 'No metrics found' });
  res.json(metrics);
});

app.put('/api/metrics', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  await setMetrics(payload);
  res.json({ success: true, metrics: payload });
});

app.get('/api/:resource', async (req, res) => {
  const resource = String(req.params.resource);
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  const data = await getResource(resource);
  res.json(data);
});

app.post('/api/:resource', requireAdmin, async (req, res) => {
  const resource = String(req.params.resource);
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  const item = req.body || {};
  const list = await getResource(resource) || [];
  if (resource === 'users') {
    const id = String(item.id || `u_${Date.now()}`);
    // If caller provided password, hash it; otherwise generate temporary password and mustReset flag
    if (item.password) {
      const newItem = { ...item, id, password: bcrypt.hashSync(String(item.password), 8), mustReset: false };
      list.push(newItem);
      await setResource(resource, list);
      return res.json({ success: true, item: { id: newItem.id, username: newItem.username, role: newItem.role } });
    }
    const tempPassword = crypto.randomBytes(6).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 12);
    const newItem = { ...item, id, password: bcrypt.hashSync(String(tempPassword), 8), mustReset: true };
    list.push(newItem);
    await setResource(resource, list);
    return res.json({ success: true, item: { id: newItem.id, username: newItem.username, role: newItem.role }, temporaryPassword: tempPassword });
  }
  // For catalog/tracks/events, generate unique ID if missing
  const nextSr = list.length > 0 ? Math.max(...list.map(t => Number(t.sr || 0))) + 1 : 1;
  const id = item.id || crypto.randomBytes(8).toString('hex');
  const newItem = { ...item, id, sr: Number(item.sr || nextSr) };
  list.push(newItem);
  await setResource(resource, list);
  res.json({ success: true, item: newItem });
});

app.put('/api/:resource/:id', requireAdmin, async (req, res) => {
  const resource = String(req.params.resource);
  const id = req.params.id;
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  const list = await getResource(resource) || [];
  const updated = list.map((it) => {
    if (resource === 'users') {
      if (String(it && it.id) === id) return { ...it, ...req.body };
    } else {
      if (String(it && it.sr) === id) return { ...it, ...req.body };
    }
    return it;
  });
  await setResource(resource, updated);
  res.json({ success: true });
});

app.delete('/api/:resource/:id', requireAdmin, async (req, res) => {
  const resource = String(req.params.resource);
  const id = req.params.id;
  console.log(`DELETE /${resource}/${id} requested`);
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  const list = await getResource(resource) || [];
  console.log(`Before delete: ${list.length} items`);
  const filtered = list.filter((it) => {
    if (resource === 'users') {
      // Users use id field
      return String(it && it.id) !== id;
    }
    // For catalog/tracks/events, match either id OR sr
    const matchesId = String(it && it.id) === id;
    const matchesSr = String(it && it.sr) === id;
    const shouldKeep = !matchesId && !matchesSr;
    if (!shouldKeep) {
      console.log(`Deleting item: sr=${it.sr}, id=${it.id}, name=${it.trackName || it.name}`);
    }
    return shouldKeep;
  }).map((t, idx) => {
    // renumber sr for non-users
    if (resource !== 'users') return { ...t, sr: idx + 1 };
    return t;
  });
  console.log(`After delete: ${filtered.length} items`);
  await setResource(resource, filtered);
  res.json({ success: true });
});

// Return current user info based on token
app.get('/api/me', requireAuth, (req, res) => {
  try {
    const data = readData();
    const userId = req.user && req.user.id;
    const user = (data.users || []).find((u) => String(u.id) === String(userId));
    if (!user) return res.json({ id: userId, role: req.user && req.user.role ? req.user.role : 'user' });
    return res.json({ id: user.id, username: user.username, role: user.role });
  } catch (err) {
    return res.status(500).json({ error: 'me lookup failed' });
  }
});

// GitHub Release Notes - Fetch available lab folders
app.get('/api/github-release-notes', async (req, res) => {
  try {
    const githubApiUrl = 'https://api.github.com/repos/CloudLabsAI-Azure/MS-Innovation-Release-Notes/contents';
    
    // Fetch with minimal caching (5 minutes)
    const response = await fetch(githubApiUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MS-Innovation-Dashboard'
      }
    });
    
    if (!response.ok) {
      console.error('GitHub API error:', response.status, response.statusText);
      return res.status(response.status).json({ error: 'Failed to fetch from GitHub' });
    }
    
    const data = await response.json();
    
    // Filter only directories and format for frontend
    const folders = data
      .filter(item => item.type === 'dir')
      .map(item => ({
        name: item.name,
        path: item.path,
        url: `https://github.com/CloudLabsAI-Azure/MS-Innovation-Release-Notes/blob/main/${encodeURIComponent(item.name)}/Release-Notes.md`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    res.json({ folders, count: folders.length });
  } catch (err) {
    console.error('Error fetching GitHub release notes:', err);
    res.status(500).json({ error: 'Failed to fetch release notes from GitHub' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});

// If a client build exists (Vite -> dist), serve it as static files in production
try {
  const clientDist = path.join(process.cwd(), 'dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    // serve index.html for any non-API route
    app.get('*', (req, res, next) => {
      if (String(req.path || '').startsWith('/api')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
    console.log('Serving static client from', clientDist);
  }
} catch (e) {
  // ignore
}

// Global error handler to capture uncaught errors in routes
app.use((err, req, res, next) => {
  console.error('Express error handler caught:', err && err.stack ? err.stack : err);
  res.status(500).json({ error: String(err && err.message ? err.message : err) });
});
