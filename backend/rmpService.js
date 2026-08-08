// RMP (CloudLabs CE Request Portal) integration service
// Fetches event requests from the RMP admin API using a user-delegated Azure AD B2C
// id_token and maps them to roadmap items ("New Lab Onboarding") for the local catalog.
//
// Key API facts (verified against live RMP — see rmpintegration.md):
// - POST {base}/api/admin/v1.0/tenants/{tenantId}/myevents  — list/search requests
// - Results are scoped to the CALLING USER's RMP account (user-delegated auth only)
// - Empty search / no visibility = HTTP 500 with "No event found." → treat as empty
// - TotalRecords is repeated on every item; server may clamp page size
// - SearchRequest matches the human request CODE (RequestId), not the GUID

const RMP_API_BASE_URL = String(process.env.RMP_API_BASE_URL || 'https://api.cloudevents.ai').replace(/\/+$/, '');
const RMP_TENANT_ID = process.env.RMP_TENANT_ID || 'EAB203B6-FF38-4DFE-912F-D09EBD3E57E6';
// Comma string of numeric status codes (see STATUS_MAP). Empty = all statuses.
const RMP_STATUS_FILTER = process.env.RMP_STATUS_FILTER || '';
const RMP_PAGE_SIZE = Number(process.env.RMP_PAGE_SIZE || 100);
const RMP_TIMEOUT_MS = Number(process.env.RMP_TIMEOUT_MS || 30000);
// Safety cap on pagination. Must comfortably cover the full tenant history so
// the baseline marks EVERY request as seen (prod: ~3,850 requests; if RMP
// clamps PageSize to 50 that is ~80 pages).
const RMP_MAX_PAGES = Number(process.env.RMP_MAX_PAGES || 400);

// RMP status name → numeric code (G9: ApprovedActionRequired maps to Approved)
const STATUS_MAP = {
  Draft: 1,
  Submitted: 2,
  Approved: 3,
  ApprovedActionRequired: 3,
  Rejected: 4,
  Cancelled: 5,
  Canceled: 5, // live API uses single-L spelling
  'In Progress': 6,
  InProgress: 6,
  Pending: 7,
  PendingActionRequired: 7,
  Completed: 8,
};

class RmpApiError extends Error {
  constructor(message, statusCode, details) {
    super(message);
    this.name = 'RmpApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Decode the `exp` claim from a JWT. Returns epoch milliseconds or null.
 */
function decodeJwtExpiry(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True if the token exists and doesn't expire within `skewMs` (default 60s).
 */
function isTokenUsable(token, skewMs = 60 * 1000) {
  if (!token) return false;
  const exp = decodeJwtExpiry(token);
  if (exp === null) return false; // not a decodable JWT — reject
  return exp - skewMs > Date.now();
}

/**
 * Single fetch wrapper for all RMP calls.
 * Never logs the token (prefix only).
 */
async function rmpFetch(path, { method = 'GET', body, token }) {
  const url = `${RMP_API_BASE_URL}${path}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept-Language': 'en-US',
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(RMP_TIMEOUT_MS),
    });
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new RmpApiError(`RMP request timed out after ${RMP_TIMEOUT_MS}ms`, 408, String(err));
    }
    throw new RmpApiError(`RMP network error: ${err && err.message ? err.message : err}`, 0, String(err));
  }

  const text = await res.text();
  if (!res.ok) {
    throw new RmpApiError(`RMP API error (HTTP ${res.status}) on ${method} ${path}`, res.status, text.slice(0, 500));
  }

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new RmpApiError(`RMP returned non-JSON response on ${method} ${path}`, res.status, text.slice(0, 500));
  }
}

/**
 * Fetch one page of the tenant's event requests.
 * Gotcha G6: empty result / no account visibility = HTTP 500 "No event found." → return [].
 */
async function getMyEventsPage(token, pageNumber, pageSize = RMP_PAGE_SIZE) {
  // IMPORTANT: unused filters must be null, not '' — the live RMP API treats
  // empty strings as non-matching filters and returns zero rows (verified
  // against the admin portal's own requests).
  const body = {
    PageNumber: pageNumber,
    PageSize: pageSize,
    SearchRequest: null,
    RequestorName: null,
    SearchTitle: null,
    SearchEventPM: null,
    IsPrivate: null,
    RequestStartDate: null,
    RequestEndDate: null,
    ScheduleStartDate: null,
    ScheduleEndDate: null,
    EventType: null,
    Status: RMP_STATUS_FILTER || null,
    EventFormat: null,
    TrackUniqueNames: null,
    BudgetStatus: null,
    FulfilmentStatus: null,
    RequestorEmail: null,
    CreatorEmail: null,
    CreatorName: null,
    CommercialSolutionArea: null,
  };
  try {
    const json = await rmpFetch(`/api/admin/v1.0/tenants/${RMP_TENANT_ID}/myevents`, {
      method: 'POST',
      body,
      token,
    });
    return Array.isArray(json && json.Data) ? json.Data : [];
  } catch (err) {
    if (err instanceof RmpApiError && err.statusCode === 500 && String(err.details || '').includes('No event found')) {
      return [];
    }
    throw err;
  }
}

/** PascalCase RMP item → camelCase internal shape. */
function mapRawRequest(raw) {
  const statusName = String(raw.Status || '');
  return {
    requestUniqueName: String(raw.RequestUniqueName || '').toUpperCase(),
    requestId: String(raw.RequestId || ''),
    title: String(raw.Title || ''),
    status: statusName,
    statusCode: STATUS_MAP[statusName] ?? null,
    eventType: String(raw.EventType || ''),
    eventFormat: String(raw.EventFormat || ''),
    scheduledDate: raw.ScheduledDate || null,
    requestDate: raw.RequestDate || null,
    requestorName: String(raw.RequestorName || ''),
    requestorEmail: String(raw.RequestorEmail || ''),
    eventUniqueName: raw.EventUniqueName || null,
    templateName: String(raw.TemplateName || ''),
    timeZoneLabel: String(raw.TimeZoneLabel || ''),
    isPrivate: !!raw.IsPrivate,
    totalRecords: Number(raw.TotalRecords || 0),
  };
}

/**
 * Fetch ALL event requests visible to the token's RMP account.
 * Probes page 1, derives page count from TotalRecords and the ACTUAL returned
 * page size (server may clamp), dedupes by RequestUniqueName.
 */
async function fetchAllRequests(token) {
  const firstPage = await getMyEventsPage(token, 1);
  const byId = new Map();
  for (const raw of firstPage) {
    const item = mapRawRequest(raw);
    if (item.requestUniqueName) byId.set(item.requestUniqueName, item);
  }
  if (firstPage.length === 0) return [];

  const totalRecords = Number(firstPage[0] && firstPage[0].TotalRecords || firstPage.length);
  const actualPageSize = firstPage.length;
  const totalPages = Math.min(Math.ceil(totalRecords / actualPageSize), RMP_MAX_PAGES);

  for (let page = 2; page <= totalPages; page++) {
    const rows = await getMyEventsPage(token, page, actualPageSize);
    if (rows.length === 0) break;
    let newCount = 0;
    for (const raw of rows) {
      const item = mapRawRequest(raw);
      if (item.requestUniqueName && !byId.has(item.requestUniqueName)) {
        byId.set(item.requestUniqueName, item);
        newCount++;
      }
    }
    if (newCount === 0) break; // page returned only duplicates — stop early
  }

  return [...byId.values()];
}

/**
 * Map an RMP request to a local roadmap item ("New Lab Onboarding").
 * `sr` is NOT set here — it must be assigned at insert time under the write lock.
 */
function mapRequestToRoadmapItem(req) {
  const nowIso = new Date().toISOString();
  const scheduled = req.scheduledDate ? ` scheduled ${String(req.scheduledDate).split('T')[0]}` : '';
  const requestor = req.requestorName ? ` by ${req.requestorName}` : '';
  return {
    id: `rmp_${req.requestUniqueName.toLowerCase()}`,
    type: 'roadmapItem',
    trackTitle: req.title || req.templateName || req.requestId,
    phase: 'Under assessment',
    eta: 'NA',
    eventId: req.requestId,
    programType: '',
    approvalDate: '',
    labType: 'New Lab Onboarding',
    notes: '',
    activityLog: [
      {
        date: nowIso,
        text: `Imported from RMP — status: ${req.status || 'Unknown'}${scheduled}, requested${requestor} (${req.requestorEmail || 'no email'})`,
        addedBy: 'RMP Sync',
      },
    ],
    source: 'rmp',
    rmpRequestUniqueName: req.requestUniqueName,
    rmpStatus: req.status,
    rmpEventType: req.eventType,
    rmpEventFormat: req.eventFormat,
    rmpScheduledDate: req.scheduledDate,
    rmpRequestDate: req.requestDate,
    rmpRequestorName: req.requestorName,
    rmpRequestorEmail: req.requestorEmail,
    rmpTemplateName: req.templateName,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Classify a request by its EventFormat (live values, 2026-08):
 *   'Onboarding & Maintenance'                → 'roadmap'  (Lab Development)
 *   'Train-The-Trainer'                       → 'ttt'      (TTT page)
 *   'Custom Tech Event'/'Custom Non-Tech …'  → 'custom'   (Custom Lab Requests)
 *   anything else (Hands-On Lab, hacks, …)    → null       (not imported)
 */
function classifyRequest(req) {
  const fmt = String(req.eventFormat || '').toLowerCase();
  const title = String(req.title || '').toLowerCase();
  if (fmt.includes('onboarding')) return 'roadmap';
  if (fmt.includes('train') && fmt.includes('trainer')) return 'ttt';
  if (/\bttt\b/.test(fmt) || /\bttt\b/.test(title)) return 'ttt';
  if (fmt.includes('custom')) return 'custom';
  return null;
}

/** Back-compat helper (used by tests): true when the request is a TTT session. */
function isTttRequest(req) {
  return classifyRequest(req) === 'ttt';
}

/**
 * Map an RMP request to a local TTT session item.
 * `sr` is NOT set here — it must be assigned at insert time under the write lock.
 */
function mapRequestToTttSession(req) {
  const nowIso = new Date().toISOString();
  const statusMap = { Completed: 'Completed', InProgress: 'In Progress', 'In Progress': 'In Progress' };
  return {
    id: `rmp_${req.requestUniqueName.toLowerCase()}`,
    type: 'tttSession',
    trackName: req.title || req.templateName || req.requestId,
    eventId: req.requestId,
    sessionDate: req.scheduledDate ? String(req.scheduledDate).split('T')[0] : null,
    status: statusMap[req.status] || 'Scheduled',
    notes: `[RMP] ${req.status || 'Unknown'} — requested by ${req.requestorName || 'unknown'} (${req.requestorEmail || 'no email'})`,
    source: 'rmp',
    rmpRequestUniqueName: req.requestUniqueName,
    rmpStatus: req.status,
    rmpEventType: req.eventType,
    rmpEventFormat: req.eventFormat,
    rmpScheduledDate: req.scheduledDate,
    rmpRequestDate: req.requestDate,
    rmpRequestorName: req.requestorName,
    rmpRequestorEmail: req.requestorEmail,
    rmpTemplateName: req.templateName,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Map an RMP request to a local Custom Lab Request item.
 * `sr` is NOT set here — it must be assigned at insert time under the write lock.
 */
function mapRequestToCustomLabRequest(req) {
  const nowIso = new Date().toISOString();
  return {
    id: `rmp_${req.requestUniqueName.toLowerCase()}`,
    type: 'customLabRequest',
    trackTitle: req.title || req.templateName || req.requestId,
    eventId: req.requestId,
    eventDate: req.scheduledDate ? String(req.scheduledDate).split('T')[0] : '',
    phase: 'Under assessment',
    sponsor: '',
    frequency: 'One Time',
    moveToRegularCatalog: 'TBD',
    holLabRequested: 'No',
    requestedBy: req.requestorName || '',
    notes: '',
    activityLog: [
      {
        date: nowIso,
        text: `Imported from RMP — format: ${req.eventFormat || 'Unknown'}, status: ${req.status || 'Unknown'}, requested by ${req.requestorName || 'unknown'} (${req.requestorEmail || 'no email'})`,
        addedBy: 'RMP Sync',
      },
    ],
    source: 'rmp',
    rmpRequestUniqueName: req.requestUniqueName,
    rmpStatus: req.status,
    rmpEventType: req.eventType,
    rmpEventFormat: req.eventFormat,
    rmpScheduledDate: req.scheduledDate,
    rmpRequestDate: req.requestDate,
    rmpRequestorName: req.requestorName,
    rmpRequestorEmail: req.requestorEmail,
    rmpTemplateName: req.templateName,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/**
 * Map an RMP request to the right local catalog item by EventFormat:
 * Onboarding & Maintenance → roadmapItem, Train-The-Trainer → tttSession,
 * Custom Tech/Non-Tech → customLabRequest. Returns null for formats we do
 * NOT import (Hands-On Lab, hacks, journey maps, …).
 */
function mapRequestToCatalogItem(req) {
  const kind = classifyRequest(req);
  if (kind === 'roadmap') return mapRequestToRoadmapItem(req);
  if (kind === 'ttt') return mapRequestToTttSession(req);
  if (kind === 'custom') return mapRequestToCustomLabRequest(req);
  return null;
}

function getRmpConfig() {
  return {
    apiBaseUrl: RMP_API_BASE_URL,
    tenantId: RMP_TENANT_ID,
    statusFilter: RMP_STATUS_FILTER || 'all',
  };
}

export {
  RmpApiError,
  STATUS_MAP,
  decodeJwtExpiry,
  isTokenUsable,
  fetchAllRequests,
  classifyRequest,
  mapRequestToRoadmapItem,
  mapRequestToTttSession,
  mapRequestToCustomLabRequest,
  mapRequestToCatalogItem,
  isTttRequest,
  getRmpConfig,
};
