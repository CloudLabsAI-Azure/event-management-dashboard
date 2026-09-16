import { RmpApiError, getRmpConfig, isTokenUsable, myEventsBody, rmpFetch } from './rmpService.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = value => typeof value === 'string' ? value.trim() : '';
const FORMAT_CONFIG = { 'Train-The-Trainer': 'tttEventFormatId', 'Custom Tech Event': 'customTechEventFormatId' };

function calendarDate(value) {
  const date = text(value).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : null;
}

export function normalizeScheduledRange(input) {
  const from = input?.from;
  const to = input?.to;
  if ((from == null || from === '') && (to == null || to === '')) return null;
  if (typeof from !== 'string' || typeof to !== 'string' || from.length !== 10 || to.length !== 10 || calendarDate(from) !== from || calendarDate(to) !== to) {
    throw new RmpApiError('Choose valid scheduled start and end dates (YYYY-MM-DD).', 400);
  }
  if (from > to) throw new RmpApiError('Scheduled start date must not be after the end date.', 400);
  return { from, to };
}

/** Match an explicit source format, never a title, acronym or loose substring. */
export function hasEventFormat(value, expected) {
  const normalize = input => text(input).normalize('NFKC').toLowerCase().replace(/[\s_\u2010-\u2015-]+/g, ' ');
  return normalize(value) === normalize(expected);
}

function sessionTime(value) {
  const match = text(value).match(/^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,7})?)?$/);
  return match && Number(match[1]) < 24 && Number(match[2]) < 60 && Number(match[3] || 0) < 60 ? `${match[1]}:${match[2]}` : null;
}

const scheduledDate = row => calendarDate(row.ScheduledDate) || calendarDate(row.scheduleStartDate);

/** Display-only allowlist. No local phase, sponsor, settings, emails or tokens. */
export function mapRmpEventRequest(row, detail = null, eventFormat) {
  const requestId = text(row.RequestUniqueName).toUpperCase();
  if (!GUID.test(requestId) || !hasEventFormat(row.EventFormat, eventFormat)) throw new RmpApiError('Invalid request identity or format.', 502);
  const sessions = (Array.isArray(detail?.SessionRequests) ? detail.SessionRequests : []).map(session => ({
    title: text(session?.Title),
    date: calendarDate(session?.StartDate),
    endDate: calendarDate(session?.EndDate) || calendarDate(session?.StartDate),
    startTime: sessionTime(session?.StartTime),
    endTime: sessionTime(session?.EndTime),
  }));
  return {
    requestId, requestCode: text(row.RequestId),
    title: text(row.Title) || text(row.TemplateName) || text(row.RequestId),
    eventFormat,
    // My Events is authoritative. Details can retain an older approval status;
    // a past date does not prove delivery or a lab's development/release phase.
    status: text(row.Status) || 'Unknown',
    scheduledDate: scheduledDate(row),
    templateName: text(row.TemplateName),
    timeZone: text(detail?.TimeZone) || text(row.TimeZoneLabel),
    language: text(detail?.DeliveryLanguageName || detail?.Language),
    adminUrl: `https://admin.cloudevents.ai/events/${requestId}/view`,
    sessions, detailsAvailable: detail !== null,
  };
}

/** Complete, caller-scoped My Events reads; never invokes the bulk importer. */
export async function scanRmpEventRequests(token, {
  eventFormat, range = null, request = rmpFetch, config = getRmpConfig(),
  pageSize = 100, maxPages = 100, signal = AbortSignal.timeout(90_000),
} = {}) {
  const scheduledRange = normalizeScheduledRange(range);
  if (!Object.hasOwn(FORMAT_CONFIG, eventFormat)) throw new RmpApiError('Unsupported read-only event format.', 400);
  if (!isTokenUsable(token)) throw new RmpApiError('Sign in again to read RMP with your own account.', 401);
  const eventFormatId = text(config[FORMAT_CONFIG[eventFormat]]);
  if (eventFormatId && !GUID.test(eventFormatId)) throw new RmpApiError('The configured event format must be an RMP GUID.', 502);
  const prefix = `/api/admin/v1.0/tenants/${config.tenantId}`;
  const readPage = async (number, size) => {
    signal.throwIfAborted();
    try {
      const result = await request(`${prefix}/myevents`, {
        method: 'POST', token, signal,
        body: {
          ...myEventsBody(number, size, null),
          ScheduleStartDate: scheduledRange ? `${scheduledRange.from}T00:00:00` : null,
          ScheduleEndDate: scheduledRange ? `${scheduledRange.to}T00:00:00` : null,
          EventFormat: eventFormatId || null,
        },
      });
      if (result?.Status !== 'Success' || !Array.isArray(result.Data) || result.Data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new RmpApiError('RMP returned an invalid event page.', 502);
      return result.Data;
    } catch (error) {
      if (number === 1 && error instanceof RmpApiError && error.statusCode === 500 && String(error.details || '').includes('No event found')) return [];
      throw error;
    }
  };
  const first = await readPage(1, pageSize);
  const result = (items, scannedRequests, detailErrors = 0) => ({ range: scheduledRange, scannedAt: new Date().toISOString(), items, scannedRequests, detailErrors, readOnly: true, scope: 'current-account' });
  if (first.length === 0) return result([], 0);
  const total = Number(first[0].TotalRecords);
  if (!Number.isSafeInteger(total) || total < first.length) throw new RmpApiError('RMP event pagination total is invalid.', 502);
  const actualSize = first.length;
  const pages = Math.ceil(total / actualSize);
  if (pages > maxPages) throw new RmpApiError('Too many events to scan completely. Choose a narrower scheduled date range.', 422);
  const rows = new Map();
  const addPage = page => {
    for (const row of page) {
      const id = text(row?.RequestUniqueName).toUpperCase();
      if (!GUID.test(id) || Number(row.TotalRecords) !== total) throw new RmpApiError('RMP events changed during pagination. Retry the scan.', 502);
      rows.set(id, row);
    }
  };
  addPage(first);
  for (let page = 2; page <= pages; page++) {
    const before = rows.size;
    addPage(await readPage(page, actualSize));
    if (rows.size === before) throw new RmpApiError('RMP scan was incomplete. Retry rather than using partial counts.', 502);
  }
  if (rows.size !== total) throw new RmpApiError('RMP scan was incomplete. Retry rather than using partial counts.', 502);

  const matching = [...rows.values()].filter(row => {
    if (!hasEventFormat(row.EventFormat, eventFormat)) return false;
    const scheduled = scheduledDate(row);
    return !scheduledRange || (scheduled && scheduled >= scheduledRange.from && scheduled <= scheduledRange.to);
  });
  const items = [];
  let detailErrors = 0;
  for (let offset = 0; offset < matching.length; offset += 5) {
    signal.throwIfAborted();
    const batch = matching.slice(offset, offset + 5);
    const results = await Promise.allSettled(batch.map(async row => {
      const id = text(row.RequestUniqueName).toUpperCase();
      const response = await request(`/api/tenants/${config.tenantId}/eventrequests/${id}`, { token, signal });
      const detail = response?.Data;
      if (response?.Status !== 'Success' || text(detail?.UniqueName).toUpperCase() !== id) throw new RmpApiError('Detail did not match its source request.', 502);
      return detail;
    }));
    signal.throwIfAborted();
    for (let i = 0; i < batch.length; i++) {
      const response = results[i];
      if (response.status === 'rejected' && response.reason instanceof RmpApiError && response.reason.statusCode === 401) throw response.reason;
      if (response.status === 'rejected') detailErrors++;
      items.push(mapRmpEventRequest(batch[i], response.status === 'fulfilled' ? response.value : null, eventFormat));
    }
  }
  return result(items, total, detailErrors);
}

/** Per-feed limits; no server token or result cache shared across callers. */
export function registerRmpEventScanRoute(app, { path, label, requireAuth, scan, now = Date.now }) {
  const users = new Map();
  let active = 0;
  app.post(path, requireAuth, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    let entry;
    try {
      const range = normalizeScheduledRange(req.body);
      const candidate = text(req.body?.b2cToken);
      if (!isTokenUsable(candidate)) return res.status(401).json({ error: `Sign in with your RMP-enabled account to read ${label}. Another user's cached token is not used.`, requiresReauth: true });
      const userKey = typeof req.user?.id === 'number' && Number.isFinite(req.user.id) ? String(req.user.id) : text(req.user?.id);
      if (!userKey) return res.status(401).json({ error: 'A dashboard session is required.' });
      for (const [key, value] of users) if (!value.running && value.retryAt <= now()) users.delete(key);
      const previous = users.get(userKey);
      if (active >= 2 || users.size >= 500 || previous?.running || (previous && previous.retryAt > now())) {
        res.setHeader('Retry-After', '30');
        return res.status(429).json({ error: 'A scan is already running or was just requested. Retry in 30 seconds.' });
      }
      entry = { running: true, retryAt: now() + 30_000 };
      users.set(userKey, entry);
      active++;
      res.json(await scan(candidate, { range }));
    } catch (error) {
      const status = error instanceof RmpApiError ? error.statusCode : error?.name === 'TimeoutError' || error?.name === 'AbortError' ? 408 : 502;
      if (status === 400 || status === 422) return res.status(status).json({ error: error.message });
      if (status === 401 || status === 403) return res.status(status).json({ error: 'RMP rejected this account or its token. Check your tenant access and sign in again.', requiresReauth: status === 401, requiresRmpAccess: status === 403 });
      res.status(status === 408 ? 504 : 502).json({ error: 'The RMP scan could not complete. No records were imported or changed. Try a narrower date range or retry.' });
    } finally {
      if (entry) { entry.running = false; entry.retryAt = now() + 30_000; active--; }
    }
  });
}