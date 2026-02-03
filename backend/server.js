// Simple Express server with Azure Blob Storage
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env from the backend directory FIRST
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

// Standard imports that don't depend on env vars
import express from 'express';
import fs from 'fs';
import cron from 'node-cron';
import cors from 'cors';
import multer from 'multer';
import csv from 'csv-parser';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import https from 'https';
import rateLimit from 'express-rate-limit';

// Dynamic import for modules that need env vars
const { readDataFromBlob, writeDataToBlob, getBlobMetadata, blobExists, uploadImageToBlob, deleteImageFromBlob, getImageBlobUrl, convertToProxyUrls, streamImageFromBlob } = await import('./blobStorageService.js');
const { processEventSummaryLogs, downloadImage } = await import('./azureDevOpsService.js');
const { logAudit, getAuditEntries, getResourceHistory } = await import('./auditService.js');

const app = express();
const PORT = process.env.PORT || 4000;

// SECURITY: Configure CORS with specific origins instead of allowing all
const ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS 
  ? process.env.CORS_ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:5173', 'http://localhost:3000', 'http://localhost:4000'];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    // In development, allow localhost variations
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }
    
    if (ALLOWED_ORIGINS.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

// SECURITY: Rate limiting for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many login attempts, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

// Serve uploaded files statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// SECURITY: Configure secure file upload with validation
const ALLOWED_FILE_TYPES = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf'
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const multerStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Generate secure filename
    const uniqueSuffix = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `upload_${Date.now()}_${uniqueSuffix}${ext}`);
  }
});

const multerFilter = function (req, file, cb) {
  // SECURITY: Validate MIME type against whitelist
  if (!ALLOWED_FILE_TYPES[file.mimetype]) {
    return cb(new Error(`Invalid file type. Allowed types: ${Object.keys(ALLOWED_FILE_TYPES).join(', ')}`), false);
  }
  
  // SECURITY: Validate file extension matches MIME type
  const ext = path.extname(file.originalname).toLowerCase();
  const expectedExt = ALLOWED_FILE_TYPES[file.mimetype];
  if (ext !== expectedExt && !expectedExt.includes(ext)) {
    return cb(new Error('File extension does not match MIME type'), false);
  }
  
  cb(null, true);
};

const upload = multer({ 
  storage: multerStorage,
  fileFilter: multerFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 20 // Max 20 files per request
  }
});

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
    // Convert blob URLs to proxy URLs for secure frontend access (hides SAS token)
    if (data.reviews && process.env.STORAGE_MODE === 'blob') {
      data.reviews = convertToProxyUrls(data.reviews);
    }
    res.json(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ error: 'Failed to fetch data' });
  }
});

// Proxy endpoint to serve blob images without exposing SAS token
app.get('/api/blob-image/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    if (!filename) {
      return res.status(400).json({ error: 'Filename required' });
    }
    
    // SECURITY: Sanitize filename to prevent path traversal
    const sanitizedFilename = path.basename(filename);
    if (sanitizedFilename !== filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename - path traversal not allowed' });
    }
    
    // SECURITY: Only allow image files
    const allowedExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.pdf'];
    const ext = path.extname(sanitizedFilename).toLowerCase();
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({ error: 'Invalid file type' });
    }
    
    const result = await streamImageFromBlob(sanitizedFilename);
    
    if (!result) {
      return res.status(404).json({ error: 'Image not found' });
    }
    
    // Set appropriate headers
    res.setHeader('Content-Type', result.contentType);
    if (result.contentLength) {
      res.setHeader('Content-Length', result.contentLength);
    }
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    
    // Stream the image to the response
    result.stream.pipe(res);
  } catch (error) {
    console.error('Error proxying blob image:', error);
    res.status(500).json({ error: 'Failed to fetch image' });
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

// Reviews screenshots upload (images or PDFs). Multiple files accepted under one event name.
app.post('/api/upload-review', requireAdmin, upload.array('files', 20), async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : []
    const eventName = req.body.eventName || ''
    const data = await readData()
    data.reviews = Array.isArray(data.reviews) ? data.reviews : []
    
    // SECURITY: Generate a secure group ID using crypto instead of Math.random()
    const groupId = `grp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const uploadTimestamp = Date.now();
    
    const saved = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      let imagePath, storedIn = 'local';
      
      // Generate unique filename with original extension
      const ext = path.extname(f.originalname) || '.png';
      const uniqueName = `upload_${uploadTimestamp}_${i}${ext}`;
      
      if (process.env.STORAGE_MODE === 'blob') {
        try {
          // Read file buffer and upload to blob
          const fileBuffer = fs.readFileSync(f.path);
          const blobUrl = await uploadImageToBlob(fileBuffer, uniqueName, f.mimetype);
          imagePath = blobUrl;
          storedIn = 'blob';
          // Delete local temp file after blob upload
          fs.unlinkSync(f.path);
          console.log(`Uploaded to blob: ${f.originalname} -> ${uniqueName}`);
        } catch (blobErr) {
          console.error(`Blob upload failed, keeping local:`, blobErr.message);
          // Rename temp file to unique name
          const localPath = path.join(UPLOAD_DIR, uniqueName);
          fs.renameSync(f.path, localPath);
          imagePath = `/uploads/${uniqueName}`;
        }
      } else {
        // Rename temp file to unique name for local storage
        const localPath = path.join(UPLOAD_DIR, uniqueName);
        fs.renameSync(f.path, localPath);
        imagePath = `/uploads/${uniqueName}`;
      }
      
      saved.push({
        id: `r_${uploadTimestamp}_${i}_${crypto.randomBytes(3).toString('hex')}`,
        originalName: f.originalname,
        eventName: eventName.trim() || f.originalname,
        mime: f.mimetype,
        size: f.size,
        path: imagePath,
        storedIn: storedIn,
        uploadedAt: uploadTimestamp,
        groupId: groupId,  // Links multiple images uploaded together
        imageIndex: i,     // Order within the group
        totalInGroup: files.length
      });
    }
    
    data.reviews.push(...saved)
    await writeData(data)
    return res.json({ success: true, items: saved, groupId })
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
    
    // Delete the file from blob storage or filesystem
    try {
      if (deletedReview.storedIn === 'blob') {
        // Delete from Azure Blob Storage
        await deleteImageFromBlob(deletedReview.originalName);
        console.log(`Deleted from blob: ${deletedReview.originalName}`);
      } else {
        // Delete from local filesystem
        const filePath = path.join(process.cwd(), 'uploads', path.basename(deletedReview.path))
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
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
  // If no users exist, create a default admin with a secure random password
  // SECURITY: Only in development mode, and with a strong random password
  if (data.users.length === 0 && process.env.NODE_ENV !== 'production') {
    const randomPassword = crypto.randomBytes(16).toString('hex');
    const hashed = bcrypt.hashSync(randomPassword, 10);
    const defaultAdmin = { 
      id: 'admin', 
      username: 'admin', 
      email: 'admin@example.com', 
      password: hashed, 
      role: 'admin' 
    };
    data.users.push(defaultAdmin);
    console.warn('⚠️  [DEV ONLY] Created default admin user. IMPORTANT: Set a secure password immediately!');
    console.warn('⚠️  Temporary password (save this): ' + randomPassword);
    console.warn('⚠️  Email: admin@example.com');
    changed = true;
  } else if (data.users.length === 0) {
    console.error('❌ CRITICAL: No users found in production mode. Please create users via Azure B2C or manual data configuration.');
  }
  if (changed) {
    console.log('📝 Schema changes detected, updating data (preserving timestamp)...');
    await writeData(data, { updateTimestamp: false });
  } else {
    console.log('✅ Data schema is up to date, no changes needed');
  }
}

await ensureDataSchema();

// =====================
// Request Validation Middleware
// =====================

/**
 * Validate catalog item request body
 */
function validateCatalogItem(req, res, next) {
  const { trackName, trackTitle } = req.body || {};
  const name = trackName || trackTitle;
  
  if (!name || String(name).trim() === '') {
    return res.status(400).json({ 
      error: 'Validation failed', 
      message: 'Track name is required' 
    });
  }
  
  // Sanitize date fields - convert empty strings to null
  const dateFields = ['lastTestDate', 'eventDate', 'sessionDate', 'approvalDate'];
  dateFields.forEach(field => {
    if (req.body[field] === '' || req.body[field] === undefined) {
      req.body[field] = null;
    }
  });
  
  next();
}

/**
 * Validate user request body
 */
function validateUser(req, res, next) {
  const { username, role } = req.body || {};
  
  if (!username || String(username).trim() === '') {
    return res.status(400).json({ 
      error: 'Validation failed', 
      message: 'Username is required' 
    });
  }
  
  const validRoles = ['admin', 'developer', 'viewer'];
  if (role && !validRoles.includes(role)) {
    return res.status(400).json({ 
      error: 'Validation failed', 
      message: `Invalid role. Must be one of: ${validRoles.join(', ')}` 
    });
  }
  
  next();
}

/**
 * Generic request sanitizer - trim string fields
 */
function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  next();
}

// =====================
// Auth Middleware
// =====================

// Simple auth middleware: expects Authorization: Bearer <token>
async function requireAuth(req, res, next) {
  const auth = req.headers['authorization'] || '';
  const parts = String(auth).split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
  const token = parts[1];
  
  // SECURITY: Dev bypass token ONLY in development mode and localhost
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (token === 'dev-bypass-token-local' && isLocalhost && isDevelopment) {
    console.log('🚀 [DEV ONLY] Dev bypass token accepted for localhost');
    req.user = { id: 'dev-admin', email: 'dev@localhost', role: 'admin' };
    return next();
  }
  
  const data = await readData();
  if (!Array.isArray(data.tokens)) return res.status(401).json({ error: 'Invalid token' });
  // cleanup expired tokens
  data.tokens = (data.tokens || []).filter((t) => !t.expiresAt || Number(t.expiresAt) > Date.now());
  await writeData(data);
  const entry = data.tokens.find((t) => t && t.token === token);
  if (!entry) return res.status(401).json({ error: 'Invalid token' });
  // attach user metadata for downstream handlers (including email for audit logging)
  req.user = { id: entry.userId, email: entry.email || 'unknown@user', role: entry.role };
  next();
}

async function requireAdmin(req, res, next) {
  // ensure authenticated first
  const auth = req.headers['authorization'] || '';
  const parts = String(auth).split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') return res.status(401).json({ error: 'Unauthorized' });
  const token = parts[1];
  
  // SECURITY: Dev bypass token ONLY in development mode and localhost
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  const isDevelopment = process.env.NODE_ENV !== 'production';
  if (token === 'dev-bypass-token-local' && isLocalhost && isDevelopment) {
    console.log('🚀 [DEV ONLY] Dev bypass token accepted for admin access on localhost');
    req.user = { id: 'dev-admin', email: 'dev@localhost', role: 'admin' };
    return next();
  }
  
  const data = await readData();
  const entry = Array.isArray(data.tokens) && data.tokens.find((t) => t && t.token === token);
  if (!entry) return res.status(401).json({ error: 'Invalid token' });
  if (entry.expiresAt && Number(entry.expiresAt) <= Date.now()) return res.status(401).json({ error: 'Token expired' });
  if (entry.role !== 'admin') return res.status(403).json({ error: 'Admin role required' });
  req.user = { id: entry.userId, email: entry.email || 'unknown@user', role: entry.role };
  next();
}

// Login endpoint: POST /api/login { email, password } or { username, password }
// Supports login with either email or username for backward compatibility
// SECURITY: Rate limited to prevent brute force attacks
app.post('/api/login', authLimiter, async (req, res) => {
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
    
    // SECURITY: Only support hashed passwords, no plaintext migration
    // This removes the security risk of storing plaintext passwords temporarily
    const provided = String(password || '');
    let ok = false;
    try {
      if (user.password && bcrypt.compareSync(provided, String(user.password))) {
        ok = true;
      }
    } catch (e) {
      // compareSync may throw if stored password isn't a valid hash
      console.error('Password validation error:', e.message);
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
  data.tokens.push({ token, userId: user.id, email: user.email, role: user.role || 'user', expiresAt });
    await writeData(data);
    return res.json({ success: true, token, role: user.role || 'user' });
  } catch (err) {
    console.error('Login handler error', err && err.stack ? err.stack : err);
    return res.status(500).json({ success: false, error: String(err && err.message ? err.message : err) });
  }
});

// B2C Authentication validation endpoint
// SECURITY: Rate limited to prevent brute force attacks
app.post('/api/validate-b2c-user', authLimiter, async (req, res) => {
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
        email: user.email,
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
// SECURITY: Rate limited to prevent brute force attacks
app.post('/api/reset-password', authLimiter, async (req, res) => {
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
    data.tokens.push({ token, userId: user.id, email: user.email, role: user.role || 'user', expiresAt });
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
  
  // Audit log
  await logAudit({
    user: req.user,
    action: 'CREATE',
    resource: 'users',
    resourceId: newUser.id,
    newData: { id: newUser.id, email: newUser.email, role: newUser.role }
  });
  
  return res.json({ success: true, user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role } });
});

app.put('/api/users/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const data = await readData();
  const oldUser = (data.users || []).find(u => String(u.id) === id);
  const body = { ...req.body };
  // Ignore any password fields under SSO model
  delete body.password;
  delete body.mustReset;
  if (body.email) body.email = String(body.email).toLowerCase();
  data.users = (data.users || []).map((u) => (String(u.id) === id ? { ...u, ...body } : u));
  await writeData(data);
  const updated = (data.users || []).find(u => String(u.id) === id);
  
  // Audit log
  if (oldUser && updated) {
    await logAudit({
      user: req.user,
      action: 'UPDATE',
      resource: 'users',
      resourceId: id,
      oldData: { id: oldUser.id, email: oldUser.email, role: oldUser.role },
      newData: { id: updated.id, email: updated.email, role: updated.role }
    });
  }
  
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
  const deletedUser = (data.users || []).find(u => String(u.id) === id);
  data.users = (data.users || []).filter((u) => String(u.id) !== id);
  await writeData(data);
  
  // Audit log
  if (deletedUser) {
    await logAudit({
      user: req.user,
      action: 'DELETE',
      resource: 'users',
      resourceId: id,
      oldData: { id: deletedUser.id, email: deletedUser.email, role: deletedUser.role }
    });
  }
  
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
  
  // SECURITY: Validate resource parameter against whitelist
  const resource = String(req.query.resource || 'tracks');
  const VALID_RESOURCES = ['tracks', 'catalog', 'users', 'events'];
  if (!VALID_RESOURCES.includes(resource)) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ 
      success: false, 
      error: `Invalid resource type. Allowed: ${VALID_RESOURCES.join(', ')}` 
    });
  }
  
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
        // Always generate new IDs to prevent duplicates from CSV imports
        const processedResults = validResults.map((item, idx) => ({
          ...item,
          id: crypto.randomBytes(8).toString('hex'), // Always generate new ID
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
  const oldMetrics = await getMetrics() || {};
  const payload = req.body || {};
  await setMetrics(payload);
  
  // Audit log
  await logAudit({
    user: req.user,
    action: 'UPDATE',
    resource: 'metrics',
    resourceId: 'dashboard',
    oldData: oldMetrics,
    newData: payload
  });
  
  res.json({ success: true, metrics: payload });
});

// GitHub Release Notes - Fetch available lab folders (must be before /api/:resource)
app.get('/api/github-release-notes', async (req, res) => {
  try {
    const githubApiUrl = 'api.github.com';
    const path = '/repos/CloudLabsAI-Azure/MS-Innovation-Release-Notes/contents';
    
    const options = {
      hostname: githubApiUrl,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'MS-Innovation-Dashboard'
      }
    };

    const githubRequest = new Promise((resolve, reject) => {
      const req = https.request(options, (response) => {
        let data = '';
        
        response.on('data', (chunk) => {
          data += chunk;
        });
        
        response.on('end', () => {
          if (response.statusCode !== 200) {
            reject(new Error(`GitHub API returned ${response.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('Failed to parse GitHub response'));
          }
        });
      });
      
      req.on('error', (error) => {
        reject(error);
      });
      
      req.end();
    });

    const data = await githubRequest;
    
    // Filter only directories and format for frontend
    const folders = data
      .filter(item => item.type === 'dir')
      .map(item => ({
        name: item.name,
        path: item.path,
        url: `https://github.com/CloudLabsAI-Azure/MS-Innovation-Release-Notes/blob/main/${encodeURIComponent(item.name)}/Release-Notes.md`
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    console.log(`✅ Fetched ${folders.length} labs from GitHub`);
    res.json({ folders, count: folders.length });
  } catch (err) {
    console.error('❌ Error fetching GitHub release notes:', err.message);
    res.status(500).json({ error: 'Failed to fetch release notes from GitHub', details: err.message });
  }
});

// GitHub Trending Tracks sync status
app.get('/api/github-sync/status', async (req, res) => {
  try {
    const data = await readData();
    res.json({
      lastSync: data.githubSyncLastRun || null,
      tracksUpdated: data.githubSyncTracksUpdated || 0
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Manual GitHub sync trigger
app.post('/api/github-sync/run', requireAdmin, async (req, res) => {
  try {
    const result = await runGitHubSync();
    res.json(result);
  } catch (err) {
    console.error('GitHub sync error:', err);
    res.status(500).json({ error: 'Failed to sync from GitHub', details: err.message });
  }
});

// GitHub sync function - syncs last test dates from Release-Notes.md files
async function runGitHubSync() {
  console.log('🔄 Starting GitHub sync for Trending Tracks...');
  const data = await readData();
  const tracks = data.tracks || [];
  
  let updated = 0;
  const errors = [];
  
  for (const track of tracks) {
    const releaseUrl = track.releaseNotesUrl || '';
    if (!releaseUrl) continue;
    
    try {
      // Extract folder name from GitHub URL
      const urlMatch = releaseUrl.match(/MS-Innovation-Release-Notes\/blob\/main\/([^/]+)/);
      if (!urlMatch) continue;
      
      const folderName = decodeURIComponent(urlMatch[1]);
      
      // Fetch the Release-Notes.md file
      const rawUrl = `https://raw.githubusercontent.com/CloudLabsAI-Azure/MS-Innovation-Release-Notes/main/${encodeURIComponent(folderName)}/Release-Notes.md`;
      const response = await fetch(rawUrl);
      
      if (!response.ok) continue;
      
      const content = await response.text();
      
      // Skip if file not found
      if (content.includes('404:') || content.includes('Not Found')) continue;
      
      // Try multiple date patterns
      let releaseDate = null;
      
      const summaryMatch = content.match(/<summary>(\d{4}-\d{2}-\d{2})<\/summary>/);
      if (summaryMatch) releaseDate = summaryMatch[1];
      
      if (!releaseDate) {
        const releaseDateMatch = content.match(/Release Date[:\s#]*(\d{4}-\d{2}-\d{2})/i);
        if (releaseDateMatch) releaseDate = releaseDateMatch[1];
      }
      
      if (!releaseDate) {
        const testingDateMatch = content.match(/Testing Date[:\*\s]*(\d{4}-\d{2}-\d{2})/i);
        if (testingDateMatch) releaseDate = testingDateMatch[1];
      }
      
      if (!releaseDate) {
        const anyDateMatch = content.match(/(\d{4}-\d{2}-\d{2})/);
        if (anyDateMatch) releaseDate = anyDateMatch[1];
      }
      
      if (releaseDate) {
        // Calculate if the date is within 32 days (30 + 2 buffer)
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const thresholdDate = new Date(today);
        thresholdDate.setDate(thresholdDate.getDate() - 32); // 30 days + 2 day buffer
        
        const testDate = new Date(releaseDate);
        testDate.setHours(0, 0, 0, 0);
        
        const isWithin30Days = testDate >= thresholdDate;
        const newStatus = isWithin30Days ? 'Completed' : 'In-progress';
        
        // Check if anything changed
        const dateChanged = track.lastTestDate !== releaseDate;
        const statusChanged = track.testingStatus !== newStatus;
        
        if (dateChanged || statusChanged) {
          if (dateChanged) {
            track.lastTestDate = releaseDate;
          }
          if (statusChanged) {
            track.testingStatus = newStatus;
            track.testingCompleted = isWithin30Days;
          }
          updated++;
          console.log(`  ✓ Updated: ${track.trackName.substring(0, 40)} → ${releaseDate} (${newStatus})`);
        }
      }
    } catch (err) {
      errors.push({ track: track.trackName, error: err.message });
    }
  }
  
  // Save updated data
  data.tracks = tracks;
  data.githubSyncLastRun = new Date().toISOString();
  data.githubSyncTracksUpdated = updated;
  await writeData(data);
  
  console.log(`✅ GitHub sync complete: ${updated} tracks updated`);
  
  return {
    success: true,
    updated,
    total: tracks.length,
    lastSync: data.githubSyncLastRun,
    errors: errors.length > 0 ? errors : undefined
  };
}

// Fix eventName format for existing DevOps items (migration endpoint)
app.post('/api/devops/fix-titles', requireAdmin, async (req, res) => {
  try {
    const data = await readData();
    data.reviews = Array.isArray(data.reviews) ? data.reviews : [];
    
    let fixed = 0;
    for (const review of data.reviews) {
      if (review.source === 'devops' && review.workItemId) {
        // Format event date
        let formattedDate = '';
        if (review.eventDate) {
          try {
            const d = new Date(review.eventDate);
            formattedDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          } catch {
            formattedDate = String(review.eventDate).split('T')[0] || '';
          }
        }
        
        // Build new eventName in correct format: WI-{id} | {date} | {title}
        const eventNameParts = [`WI-${review.workItemId}`];
        if (formattedDate) eventNameParts.push(formattedDate);
        if (review.workItemTitle) eventNameParts.push(review.workItemTitle);
        
        const newEventName = eventNameParts.join(' | ');
        
        // Only update if different
        if (review.eventName !== newEventName) {
          review.eventName = newEventName;
          fixed++;
        }
      }
    }
    
    if (fixed > 0) {
      await writeData(data);
    }
    
    res.json({ success: true, fixed, message: `Fixed ${fixed} DevOps items` });
  } catch (err) {
    console.error('❌ Error fixing DevOps titles:', err.message);
    res.status(500).json({ error: 'Failed to fix titles', details: err.message });
  }
});

// Azure DevOps - Get sync status
app.get('/api/devops/sync-status', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    const syncInfo = data._devopsSync || {};
    res.json({
      lastSync: syncInfo.lastSync || null,
      lastResult: syncInfo.lastResult || null,
      nextScheduledSync: syncInfo.nextScheduledSync || null
    });
  } catch (err) {
    console.error('Error getting sync status:', err.message);
    res.status(500).json({ error: 'Failed to get sync status' });
  }
});

// Azure DevOps - Import feedback images from Event Summary Log work items
// Follows DEVOPS_INTEGRATION_PLAN.md specifications
app.post('/api/devops/import-screenshots', requireAdmin, async (req, res) => {
  try {
    const org = process.env.AZURE_DEVOPS_ORG;
    const project = process.env.AZURE_DEVOPS_PROJECT;
    const pat = process.env.AZURE_DEVOPS_PAT;
    const feedbackField = process.env.AZURE_DEVOPS_FEEDBACK_FIELD || 'Custom.Feedback';
    const eventDateField = process.env.AZURE_DEVOPS_EVENTDATE_FIELD || 'Custom.EventDate';
    const eventIdField = process.env.AZURE_DEVOPS_EVENTID_FIELD || 'Custom.EventID';
    
    if (!org || !project || !pat) {
      return res.status(400).json({ 
        error: 'DevOps configuration missing. Set AZURE_DEVOPS_ORG, AZURE_DEVOPS_PROJECT, and AZURE_DEVOPS_PAT environment variables' 
      });
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 DEVOPS FEEDBACK IMPORT - ${new Date().toISOString()}`);
    console.log(`${'='.repeat(60)}`);
    
    // Get existing data to check last sync time
    const data = await readData();
    data.reviews = Array.isArray(data.reviews) ? data.reviews : [];
    data._devopsSync = data._devopsSync || {};
    
    const lastSyncDate = data._devopsSync.lastSync || null;
    console.log(`📅 Last sync: ${lastSyncDate || 'Never (full sync)'}`);    
    
    // Get locally tracked processed work item IDs
    data._devopsSync.processedWorkItemIds = data._devopsSync.processedWorkItemIds || [];
    const processedIds = data._devopsSync.processedWorkItemIds;
    console.log(`📋 Already processed locally: ${processedIds.length} work items`);
    
    // Process Event Summary Log work items
    const result = await processEventSummaryLogs(
      org, 
      project, 
      pat,
      feedbackField,
      eventDateField,
      eventIdField,
      lastSyncDate,
      50, // limit
      processedIds // pass locally tracked IDs
    );
    
    if (result.items.length === 0) {
      // Update sync time and processed IDs even if no items
      data._devopsSync.lastSync = result.syncTime;
      data._devopsSync.lastResult = { imported: 0, processed: result.processed, skipped: result.skipped };
      // Add newly processed work item IDs to local tracking
      if (result.processedWorkItemIds && result.processedWorkItemIds.length > 0) {
        data._devopsSync.processedWorkItemIds = [...new Set([...processedIds, ...result.processedWorkItemIds])];
      }
      await writeData(data);
      
      return res.json({ 
        success: true, 
        imported: 0,
        processed: result.processed,
        skipped: result.skipped,
        errors: result.errors,
        message: 'No images found in Event Summary Log feedback fields' 
      });
    }
    
    // Download and save each image
    const existingPaths = new Set(data.reviews.map(r => r.path));
    const savedImages = [];
    let duplicates = 0;
    let downloadErrors = 0;
    
    for (const item of result.items) {
      try {
        // Create unique filename
        const ext = item.imageUrl.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i)?.[1] || 'png';
        const fileName = `devops_${item.workItemId}_${item.imageIndex}_${Date.now()}.${ext}`;
        
        // Skip if already imported (check by work item ID and index)
        const existingKey = `devops_${item.workItemId}_${item.imageIndex}`;
        const isDuplicate = data.reviews.some(r => 
          r.source === 'devops' && 
          r.workItemId === item.workItemId && 
          r.imageIndex === item.imageIndex
        );
        
        if (isDuplicate) {
          console.log(`⏭️ Skipping duplicate: WI-${item.workItemId} image ${item.imageIndex}`);
          duplicates++;
          continue;
        }
        
        // Download image
        console.log(`📥 Downloading: ${item.imageUrl.substring(0, 80)}...`);
        const imageData = await downloadImage(item.imageUrl, pat);
        
        if (!imageData || imageData.length === 0) {
          console.log(`⚠️ Empty image data for WI-${item.workItemId}`);
          downloadErrors++;
          continue;
        }
        
        // Save to blob storage or local based on STORAGE_MODE
        let uploadPath;
        const mimeType = `image/${ext}`;
        
        if (STORAGE_MODE === 'blob') {
          // Upload to Azure Blob Storage
          const blobUrl = await uploadImageToBlob(imageData, fileName, mimeType);
          uploadPath = blobUrl;
          console.log(`☁️ Uploaded to blob: ${fileName}`);
        } else {
          // Save to local uploads folder
          const filePath = path.join(UPLOAD_DIR, fileName);
          fs.writeFileSync(filePath, imageData);
          uploadPath = `/uploads/${fileName}`;
        }
        
        // Format event date for display (extract date portion if ISO string)
        let formattedDate = '';
        if (item.eventDate) {
          try {
            const d = new Date(item.eventDate);
            formattedDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          } catch {
            formattedDate = String(item.eventDate).split('T')[0] || item.eventDate;
          }
        }
        
        // Create review item with EventID, Event Date, and Title combined
        // Format: "{eventId} | {date} | {title}"
        const eventNameParts = [];
        if (item.eventId) eventNameParts.push(item.eventId);
        if (formattedDate) eventNameParts.push(formattedDate);
        if (item.workItemTitle) eventNameParts.push(item.workItemTitle);
        
        const reviewItem = {
          id: `devops_${item.workItemId}_${Date.now()}_${savedImages.length}`,
          originalName: fileName,
          eventName: eventNameParts.join(' | '),
          eventId: item.eventId,
          eventDate: item.eventDate,
          workItemTitle: item.workItemTitle,
          mime: mimeType,
          size: imageData.length,
          path: uploadPath,
          uploadedAt: Date.now(),
          source: 'devops',
          workItemId: item.workItemId,
          imageIndex: item.imageIndex,
          storageType: STORAGE_MODE
        };
        
        savedImages.push(reviewItem);
        console.log(`✅ Saved: ${fileName} (${(imageData.length / 1024).toFixed(1)} KB)`);
        
      } catch (err) {
        console.error(`❌ Failed to download image from WI-${item.workItemId}:`, err.message);
        downloadErrors++;
      }
    }
    
    // Save reviews and update sync metadata
    if (savedImages.length > 0) {
      data.reviews.push(...savedImages);
    }
    
    // Add newly processed work item IDs to local tracking
    if (result.processedWorkItemIds && result.processedWorkItemIds.length > 0) {
      data._devopsSync.processedWorkItemIds = [...new Set([...processedIds, ...result.processedWorkItemIds])];
    }
    
    data._devopsSync.lastSync = result.syncTime;
    data._devopsSync.lastResult = {
      imported: savedImages.length,
      duplicates,
      downloadErrors,
      processed: result.processed,
      skipped: result.skipped,
      workItemErrors: result.errors.length
    };
    
    await writeData(data);
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ IMPORT COMPLETE`);
    console.log(`   Images imported: ${savedImages.length}`);
    console.log(`   Work items processed: ${result.processed}`);
    console.log(`   Work items skipped (no images): ${result.skipped}`);
    console.log(`   Duplicates skipped: ${duplicates}`);
    console.log(`   Download errors: ${downloadErrors}`);
    console.log(`${'='.repeat(60)}\n`);
    
    res.json({ 
      success: true, 
      imported: savedImages.length,
      processed: result.processed,
      skipped: result.skipped,
      duplicates,
      downloadErrors,
      errors: result.errors,
      syncTime: result.syncTime
    });
    
  } catch (err) {
    console.error('❌ DevOps import error:', err);
    res.status(500).json({ error: 'Failed to import from DevOps', details: err.message });
  }
});

// Audit Log API endpoints
app.get('/api/audit/entries', requireAdmin, async (req, res) => {
  try {
    const filters = {
      resource: req.query.resource || null,
      resourceId: req.query.resourceId || null,
      action: req.query.action || null,
      userId: req.query.userId || null,
      startDate: req.query.startDate || null,
      endDate: req.query.endDate || null,
      limit: parseInt(req.query.limit) || 100,
      offset: parseInt(req.query.offset) || 0
    };
    
    const result = await getAuditEntries(filters);
    res.json(result);
  } catch (err) {
    console.error('Error fetching audit entries:', err);
    res.status(500).json({ error: 'Failed to fetch audit entries' });
  }
});

app.get('/api/audit/history/:resource/:resourceId', requireAdmin, async (req, res) => {
  try {
    const { resource, resourceId } = req.params;
    const entries = await getResourceHistory(resource, resourceId);
    res.json({ entries });
  } catch (err) {
    console.error('Error fetching resource history:', err);
    res.status(500).json({ error: 'Failed to fetch resource history' });
  }
});

// =====================
// Duplicate Event ID Check Endpoint
// =====================
app.get('/api/check-duplicate-eventid', async (req, res) => {
  try {
    const { eventId, excludeSr, excludeResource } = req.query;
    
    if (!eventId || String(eventId).trim() === '' || String(eventId).trim().toUpperCase() === 'TBD') {
      return res.json({ isDuplicate: false, existsIn: [] });
    }
    
    const normalizedEventId = String(eventId).trim().toLowerCase();
    const existsIn = [];
    
    const data = await readData();
    
    // Check catalog items
    const catalog = data.catalog || [];
    for (const item of catalog) {
      const itemEventId = (item.eventId || '').trim().toLowerCase();
      if (itemEventId && itemEventId === normalizedEventId) {
        // Skip if this is the same item being edited
        if (excludeSr && String(item.sr) === String(excludeSr)) {
          continue;
        }
        
        // Determine which page this item belongs to
        if (item.type === 'tttSession') {
          if (!existsIn.includes('TTT Sessions')) existsIn.push('TTT Sessions');
        } else if (item.type === 'customLabRequest') {
          if (!existsIn.includes('Custom Lab Requests')) existsIn.push('Custom Lab Requests');
        } else if (item.type === 'roadmapItem') {
          if (!existsIn.includes('Lab Development')) existsIn.push('Lab Development');
        } else {
          if (!existsIn.includes('Catalog Health')) existsIn.push('Catalog Health');
        }
      }
    }
    
    // Check tracks
    const tracks = data.tracks || [];
    for (const track of tracks) {
      const trackEventId = (track.eventId || '').trim().toLowerCase();
      if (trackEventId && trackEventId === normalizedEventId) {
        // Skip if this is the same item being edited
        if (excludeSr && excludeResource === 'tracks' && String(track.sr) === String(excludeSr)) {
          continue;
        }
        if (!existsIn.includes('Trending Tracks')) existsIn.push('Trending Tracks');
      }
    }
    
    res.json({
      isDuplicate: existsIn.length > 0,
      existsIn
    });
  } catch (err) {
    console.error('Error checking duplicate event ID:', err);
    res.status(500).json({ error: 'Failed to check duplicate event ID' });
  }
});

app.get('/api/:resource', async (req, res) => {
  const resource = String(req.params.resource);
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  const data = await getResource(resource);
  res.json(data);
});

app.post('/api/:resource', requireAdmin, sanitizeRequest, async (req, res) => {
  const resource = String(req.params.resource);
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  
  // Apply resource-specific validation
  if (resource === 'users') {
    const { username, role } = req.body || {};
    if (!username || String(username).trim() === '') {
      return res.status(400).json({ error: 'Validation failed', message: 'Username is required' });
    }
    const validRoles = ['admin', 'developer', 'viewer'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Validation failed', message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }
  } else if (resource === 'catalog' || resource === 'tracks') {
    const { trackName, trackTitle } = req.body || {};
    if (!trackName && !trackTitle) {
      return res.status(400).json({ error: 'Validation failed', message: 'Track name is required' });
    }
    // Sanitize date fields
    const dateFields = ['lastTestDate', 'eventDate', 'sessionDate', 'approvalDate'];
    dateFields.forEach(field => {
      if (req.body[field] === '' || req.body[field] === undefined) {
        req.body[field] = null;
      }
    });
  }
  
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
  
  // Audit log
  await logAudit({
    user: req.user,
    action: 'CREATE',
    resource,
    resourceId: newItem.id || newItem.sr,
    newData: newItem
  });
  
  res.json({ success: true, item: newItem });
});

app.put('/api/:resource/:id', requireAdmin, async (req, res) => {
  const resource = String(req.params.resource);
  const id = req.params.id;
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  const list = await getResource(resource) || [];
  
  // Find old item for audit
  let oldItem = null;
  if (resource === 'users') {
    oldItem = list.find(it => String(it && it.id) === id);
  } else {
    oldItem = list.find(it => String(it && it.sr) === id);
  }
  
  const updated = list.map((it) => {
    if (resource === 'users') {
      if (String(it && it.id) === id) return { ...it, ...req.body };
    } else {
      if (String(it && it.sr) === id) return { ...it, ...req.body };
    }
    return it;
  });
  await setResource(resource, updated);
  
  // Find new item for audit
  let newItem = null;
  if (resource === 'users') {
    newItem = updated.find(it => String(it && it.id) === id);
  } else {
    newItem = updated.find(it => String(it && it.sr) === id);
  }
  
  // Audit log
  if (oldItem) {
    await logAudit({
      user: req.user,
      action: 'UPDATE',
      resource,
      resourceId: id,
      oldData: oldItem,
      newData: newItem
    });
  }
  
  res.json({ success: true });
});

app.delete('/api/:resource/:id', requireAdmin, async (req, res) => {
  const resource = String(req.params.resource);
  const id = req.params.id;
  console.log(`DELETE /${resource}/${id} requested`);
  if (!VALID_RESOURCES.has(resource)) return res.status(404).json({ error: 'Unknown resource' });
  const list = await getResource(resource) || [];
  console.log(`Before delete: ${list.length} items`);
  
  // Find deleted item for audit
  let deletedItem = null;
  
  const filtered = list.filter((it) => {
    if (resource === 'users') {
      // Users use id field
      if (String(it && it.id) === id) {
        deletedItem = it;
        return false;
      }
      return true;
    }
    // For catalog/tracks/events, match either id OR sr
    const matchesId = String(it && it.id) === id;
    const matchesSr = String(it && it.sr) === id;
    const shouldKeep = !matchesId && !matchesSr;
    if (!shouldKeep) {
      deletedItem = it;
      console.log(`Deleting item: sr=${it.sr}, id=${it.id}, name=${it.trackName || it.name}`);
    }
    return shouldKeep;
  });
  // Note: We no longer renumber sr values to maintain stable IDs for frontend sync
  console.log(`After delete: ${filtered.length} items`);
  await setResource(resource, filtered);
  
  // Audit log
  if (deletedItem) {
    await logAudit({
      user: req.user,
      action: 'DELETE',
      resource,
      resourceId: id,
      oldData: deletedItem
    });
  }
  
  res.json({ success: true });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  
  // Schedule daily DevOps sync at 6:00 AM
  const syncSchedule = process.env.DEVOPS_SYNC_SCHEDULE || '0 6 * * *'; // Default: 6 AM daily
  if (process.env.AZURE_DEVOPS_ORG && process.env.AZURE_DEVOPS_PROJECT && process.env.AZURE_DEVOPS_PAT) {
    cron.schedule(syncSchedule, async () => {
      console.log('\n🕐 Running scheduled DevOps feedback sync...');
      try {
        const org = process.env.AZURE_DEVOPS_ORG;
        const project = process.env.AZURE_DEVOPS_PROJECT;
        const pat = process.env.AZURE_DEVOPS_PAT;
        const feedbackField = process.env.AZURE_DEVOPS_FEEDBACK_FIELD || 'Custom.Feedback';
        const eventDateField = process.env.AZURE_DEVOPS_EVENTDATE_FIELD || 'Custom.EventDate';
        const eventIdField = process.env.AZURE_DEVOPS_EVENTID_FIELD || 'Custom.EventID';
        
        const data = await readData();
        data.reviews = Array.isArray(data.reviews) ? data.reviews : [];
        data._devopsSync = data._devopsSync || {};
        data._devopsSync.processedWorkItemIds = data._devopsSync.processedWorkItemIds || [];
        
        const lastSyncDate = data._devopsSync.lastSync || null;
        const processedIds = data._devopsSync.processedWorkItemIds;
        const result = await processEventSummaryLogs(org, project, pat, feedbackField, eventDateField, eventIdField, lastSyncDate, 50, processedIds);
        
        // Download and save images
        for (const item of result.items) {
          try {
            const isDuplicate = data.reviews.some(r => 
              r.source === 'devops' && r.workItemId === item.workItemId && r.imageIndex === item.imageIndex
            );
            if (isDuplicate) continue;
            
            const ext = item.imageUrl.match(/\.(png|jpg|jpeg|gif|webp|bmp)$/i)?.[1] || 'png';
            const fileName = `devops_${item.workItemId}_${item.imageIndex}_${Date.now()}.${ext}`;
            const imageData = await downloadImage(item.imageUrl, pat);
            if (!imageData || imageData.length === 0) continue;
            
            // Store in blob or local based on STORAGE_MODE
            let imagePath, blobUrl = null, storedIn = 'local';
            if (process.env.STORAGE_MODE === 'blob') {
              try {
                blobUrl = await uploadImageToBlob(imageData, fileName, `image/${ext}`);
                imagePath = blobUrl;
                storedIn = 'blob';
                console.log(`[Scheduled] Uploaded to blob: ${fileName}`);
              } catch (blobErr) {
                console.error(`[Scheduled] Blob upload failed, falling back to local:`, blobErr.message);
                const localPath = path.join(UPLOAD_DIR, fileName);
                fs.writeFileSync(localPath, imageData);
                imagePath = `/uploads/${fileName}`;
              }
            } else {
              const localPath = path.join(UPLOAD_DIR, fileName);
              fs.writeFileSync(localPath, imageData);
              imagePath = `/uploads/${fileName}`;
            }
            
            let formattedDate = '';
            if (item.eventDate) {
              try {
                const d = new Date(item.eventDate);
                formattedDate = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
              } catch { formattedDate = ''; }
            }
            
            const eventNameParts = [];
            if (item.eventId) eventNameParts.push(item.eventId);
            if (formattedDate) eventNameParts.push(formattedDate);
            if (item.workItemTitle) eventNameParts.push(item.workItemTitle);
            
            data.reviews.push({
              id: `devops_${item.workItemId}_${Date.now()}_${data.reviews.length}`,
              originalName: fileName,
              eventName: eventNameParts.join(' | '),
              eventId: item.eventId,
              eventDate: item.eventDate,
              workItemTitle: item.workItemTitle,
              mime: `image/${ext}`,
              size: imageData.length,
              path: imagePath,
              blobUrl: blobUrl,
              storedIn: storedIn,
              uploadedAt: Date.now(),
              source: 'devops',
              workItemId: item.workItemId,
              imageIndex: item.imageIndex
            });
          } catch (err) {
            console.error(`Scheduled sync: Failed to download image from WI-${item.workItemId}:`, err.message);
          }
        }
        
        data._devopsSync.lastSync = result.syncTime;
        data._devopsSync.lastResult = { imported: result.items.length, processed: result.processed, skipped: result.skipped };
        // Track processed work item IDs locally
        if (result.processedWorkItemIds && result.processedWorkItemIds.length > 0) {
          data._devopsSync.processedWorkItemIds = [...new Set([...processedIds, ...result.processedWorkItemIds])];
        }
        await writeData(data);
        
        console.log(`✅ Scheduled sync complete: ${result.items.length} images imported`);
      } catch (err) {
        console.error('❌ Scheduled DevOps sync failed:', err.message);
      }
    });
    console.log(`📅 DevOps sync scheduled: ${syncSchedule}`);
  } else {
    console.log('⚠️ DevOps sync not scheduled (missing configuration)');
  }
  
  // Schedule daily GitHub sync for Trending Tracks at 6:30 AM
  const githubSyncSchedule = process.env.GITHUB_SYNC_SCHEDULE || '30 6 * * *'; // Default: 6:30 AM daily
  cron.schedule(githubSyncSchedule, async () => {
    console.log('\n🕐 Running scheduled GitHub sync for Trending Tracks...');
    try {
      await runGitHubSync();
    } catch (err) {
      console.error('❌ Scheduled GitHub sync failed:', err.message);
    }
  });
  console.log(`📅 GitHub sync for Trending Tracks scheduled: ${githubSyncSchedule}`);
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

// SECURITY: Enhanced global error handler to capture uncaught errors in routes
// Includes special handling for multer file upload errors
app.use((err, req, res, next) => {
  console.error('Express error handler caught:', err && err.stack ? err.stack : err);
  
  // Handle multer file upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        success: false, 
        error: `File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB` 
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        success: false, 
        error: 'Too many files. Maximum is 20 files per upload' 
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        success: false, 
        error: 'Unexpected file field' 
      });
    }
    return res.status(400).json({ 
      success: false, 
      error: `File upload error: ${err.message}` 
    });
  }
  
  // Handle file type validation errors
  if (err.message && err.message.includes('Invalid file type')) {
    return res.status(400).json({ 
      success: false, 
      error: err.message 
    });
  }
  
  // Handle CORS errors
  if (err.message && err.message.includes('Not allowed by CORS')) {
    return res.status(403).json({ 
      success: false, 
      error: 'CORS policy: Origin not allowed' 
    });
  }
  
  // Generic error response
  res.status(500).json({ 
    success: false, 
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : String(err && err.message ? err.message : err) 
  });
});
