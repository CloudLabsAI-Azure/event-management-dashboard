import { randomUUID } from 'node:crypto';
import { RmpApiError, isTokenUsable } from './rmpService.js';
import { isExplicitTttFormat, normalizeTttRange, scanRmpTtt } from './rmpTttService.js';
import { isExplicitTttSave, isRmpRequestImport } from './rmpRequestPolicy.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = value => typeof value === 'string' ? value.trim() : '';
const key = value => text(value).toUpperCase();
const eventCode = value => key(value) === 'TBD' ? '' : key(value);
export const MAX_TTT_IMPORT_REQUESTS = 500;

class TttImportError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function normalizeTttImportIds(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_TTT_IMPORT_REQUESTS || value.some(id => !GUID.test(text(id)))) {
    throw new TttImportError(`Select between 1 and ${MAX_TTT_IMPORT_REQUESTS} valid TTT requests to save.`);
  }
  return [...new Set(value.map(key))];
}

/** Build only from the server's verified scan projection, never client row data. */
function newTttSession(request, sr, timestamp) {
  return {
    id: randomUUID(), sr, type: 'tttSession',
    eventId: text(request.requestCode), trackName: text(request.title) || text(request.requestCode) || request.requestId,
    sessionDate: request.scheduledDate, status: text(request.status) || 'Unknown', notes: '',
    source: 'rmp', rmpImportMode: 'ttt-scan', rmpTttSavedAt: timestamp,
    rmpRequestUniqueName: key(request.requestId), rmpEventFormat: 'Train-The-Trainer',
    rmpStatus: text(request.status) || 'Unknown', rmpScheduledDate: request.scheduledDate,
    rmpTemplateName: text(request.templateName), rmpTimeZone: text(request.timeZone),
    rmpDeliveryLanguage: text(request.language), rmpDetailsAvailable: request.detailsAvailable === true,
    rmpAdminUrl: `https://admin.cloudevents.ai/events/${key(request.requestId)}/view`,
    rmpSessions: request.sessions.map(session => ({
      title: session.title, date: session.date, endDate: session.endDate,
      startTime: session.startTime, endTime: session.endTime,
    })),
    createdAt: timestamp, updatedAt: timestamp,
  };
}

/** Immutable merge; existing local fields, other resources and import baseline survive. */
export function planTttImport(data, requests, timestamp = new Date().toISOString()) {
  if (!data || !Array.isArray(data.catalog) || (data.tracks != null && !Array.isArray(data.tracks))) {
    throw new Error('Cannot safely read the existing dashboard catalog.');
  }
  const catalog = [...data.catalog];
  const tracks = data.tracks || [];
  let nextSr = catalog.reduce((max, item) => {
    const sr = Number(item?.sr);
    return Number.isSafeInteger(sr) && sr > max ? sr : max;
  }, 0) + 1;
  const changes = [];
  const summary = { created: 0, restored: 0, existing: 0, savedRequestIds: [], conflicts: [], detailErrors: 0 };
  const seen = new Set();
  for (const request of requests) {
    const requestId = key(request.requestId);
    if (!GUID.test(requestId) || !isExplicitTttFormat(request.eventFormat)) throw new Error('Unverified TTT source record.');
    if (seen.has(requestId)) continue;
    seen.add(requestId);
    const code = eventCode(request.requestCode);
    const matches = item => key(item?.rmpRequestUniqueName) === requestId || (code && eventCode(item?.eventId) === code);
    const candidates = catalog.filter(matches);
    const tttMatches = candidates.filter(item => item.type === 'tttSession'
      && (!text(item.rmpRequestUniqueName) || key(item.rmpRequestUniqueName) === requestId));
    // Prefer a visible/manual session to an older hidden duplicate. Never unhide
    // another copy when a dashboard session already represents this request.
    const existing = tttMatches.find(item => !isRmpRequestImport(item) || isExplicitTttSave(item)) || tttMatches[0];
    if (existing) {
      if (isRmpRequestImport(existing) && !isExplicitTttSave(existing)) {
        const updated = { ...existing, rmpImportMode: 'ttt-scan', rmpTttSavedAt: timestamp };
        catalog[catalog.indexOf(existing)] = updated;
        changes.push({ action: 'UPDATE', oldData: existing, newData: updated });
        summary.restored++;
      } else {
        summary.existing++;
      }
    } else if (candidates.length > 0 || tracks.some(matches)) {
      summary.conflicts.push({ requestId, requestCode: text(request.requestCode) });
      continue;
    } else {
      if (!Number.isSafeInteger(nextSr)) throw new Error('Cannot allocate a dashboard session number.');
      const item = newTttSession(request, nextSr++, timestamp);
      catalog.push(item);
      changes.push({ action: 'CREATE', newData: item });
      summary.created++;
    }
    summary.savedRequestIds.push(requestId);
    if (!request.detailsAvailable) summary.detailErrors++;
  }
  return { data: { ...data, catalog }, summary, changes };
}

/** Retry the MERGE against a fresh ETag, never overwrite with a stale full blob. */
export function createRmpTttImporter({ readSnapshot, writeSnapshot, withLock, isConflict = () => false }) {
  return requests => withLock(async () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, etag } = await readSnapshot();
      const plan = planTttImport(data, requests);
      if (plan.changes.length === 0) return plan;
      try {
        await writeSnapshot(plan.data, etag);
        return plan;
      } catch (error) {
        if (!isConflict(error)) throw error;
        if (attempt === 2) throw new TttImportError('The dashboard changed while saving. Refresh Dashboard sessions and retry.', 409);
      }
    }
  }, 'rmp-ttt-import');
}

/** Admin-only local save. Upstream remains read-only and caller-scoped. */
export function registerRmpTttImportRoutes(app, { requireAdmin, importRequests, logAudit, scan = scanRmpTtt }) {
  const activeUsers = new Set();
  app.post('/api/rmp/ttt/import', requireAdmin, async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    let userKey;
    try {
      const requestIds = normalizeTttImportIds(req.body?.requestIds);
      let range;
      try { range = normalizeTttRange(req.body); }
      catch { throw new TttImportError('Choose valid scheduled start and end dates before saving.'); }
      const candidate = text(req.body?.b2cToken);
      if (!isTokenUsable(candidate)) return res.status(401).json({ error: 'Sign in with your RMP-enabled account to save TTT sessions.', requiresReauth: true });
      const id = typeof req.user?.id === 'number' && Number.isFinite(req.user.id) ? String(req.user.id) : text(req.user?.id);
      if (!id) return res.status(401).json({ error: 'A dashboard session is required.' });
      if (activeUsers.size >= 2 || activeUsers.has(id)) {
        res.setHeader('Retry-After', '30');
        return res.status(429).json({ error: 'A TTT save is already running. Wait for it to finish before retrying.' });
      }
      userKey = id;
      activeUsers.add(id);
      // Re-read with THIS caller's token. Ignore forged titles, statuses, formats,
      // source URLs and records that are no longer visible in the scanned range.
      const source = await scan(candidate, { range });
      const byId = new Map(source.items.map(item => [key(item.requestId), item]));
      if (requestIds.some(requestId => !byId.has(requestId))) {
        throw new TttImportError('Some selected requests are no longer visible in this timeframe. Scan again before saving. No sessions were changed.', 422);
      }
      const plan = await importRequests(requestIds.map(requestId => byId.get(requestId)));
      // Audit failures must not report an already committed save as a failed write.
      for (const change of plan.changes) {
        try {
          await logAudit({ user: req.user, resource: 'catalog', resourceId: change.newData.id || change.newData.sr,
            ...change, reason: 'Explicit save from the RMP TTT scan' });
        } catch { console.warn('TTT sessions saved, but an audit entry could not be written.'); }
      }
      res.json({ success: true, ...plan.summary });
    } catch (error) {
      if (error instanceof TttImportError) return res.status(error.statusCode).json({ error: error.message });
      if (error instanceof RmpApiError) {
        if (error.statusCode === 401 || error.statusCode === 403) {
          return res.status(error.statusCode).json({ error: 'RMP rejected this account or token. Check access and sign in again. No sessions were saved.', requiresReauth: error.statusCode === 401, requiresRmpAccess: error.statusCode === 403 });
        }
        return res.status(error.statusCode === 408 ? 504 : 502).json({ error: 'RMP could not verify the selected requests. No sessions were saved. Retry with a narrower timeframe.' });
      }
      res.status(503).json({ error: 'Saving could not be confirmed. Refresh Dashboard sessions before retrying; existing sessions will not be duplicated.' });
    } finally {
      if (userKey) activeUsers.delete(userKey);
    }
  });
}