import { RmpApiError } from './rmpService.js';
import { catalogueSourceKey, catalogueRangeKey, normalizeCatalogueRange, fetchRmpCatalogue } from './rmpCatalogueService.js';

/** Shared, sanitized publication snapshot; never an OAuth-token store. */
export function createRmpCatalogueSync({
  tokenCache, readSnapshot, writeSnapshot, fetchCatalogue = fetchRmpCatalogue,
  sourceKey = catalogueSourceKey(), now = Date.now, ttlMs = 15 * 60_000, retryMs = 60_000, range = null,
}) {
  const dateRange = normalizeCatalogueRange(range);
  let snapshot = null;
  let loading = null;
  let loaded = false;
  let running = null;
  let lastAttemptAt = null;
  let lastAttemptToken = null; // memory only, never returned/persisted
  let lastError = null;

  async function load() {
    if (loaded) return;
    if (!loading) loading = (async () => {
      try {
        const value = await readSnapshot();
        if (value?.version === 1 && value.sourceKey === sourceKey && catalogueRangeKey(value.range) === catalogueRangeKey(dateRange) && Array.isArray(value.items) && Number.isFinite(Date.parse(value.lastSyncedAt))) snapshot = value;
        loaded = true;
      } finally { loading = null; }
    })();
    await loading;
  }

  function state() {
    const stale = !snapshot || now() - Date.parse(snapshot.lastSyncedAt) >= ttlMs;
    return {
      items: snapshot?.items || [], lastSyncedAt: snapshot?.lastSyncedAt || null,
      totalTracks: snapshot?.totalTracks ?? null, detailErrors: snapshot?.detailErrors || 0,
      refreshing: !!running, stale, error: lastError,
      range: dateRange,
      tokenAvailable: !!tokenCache.get(), sourceUrl: dateRange
        ? `https://admin.cloudevents.ai/catalogue?content_release_datefrom=${dateRange.from}&content_release_dateto=${dateRange.to}&pagenumber=1&pagesize=10`
        : 'https://admin.cloudevents.ai/catalogue',
    };
  }

  function start(force = false) {
    if (running) return running;
    const cached = tokenCache.get();
    if (!cached || (!force && !state().stale)) return null;
    if (lastAttemptToken === cached.token && lastAttemptAt !== null && now() - lastAttemptAt < retryMs) return null;
    lastAttemptAt = now();
    lastAttemptToken = cached.token;
    lastError = null;
    running = (async () => {
      try {
        const next = await fetchCatalogue(cached.token, { range: dateRange });
        if (next?.version !== 1 || next.sourceKey !== sourceKey || catalogueRangeKey(next.range) !== catalogueRangeKey(dateRange) || !Array.isArray(next.items) || !Number.isFinite(Date.parse(next.lastSyncedAt))) throw new Error('Invalid catalogue snapshot');
        // Persist first; a failed upload never advertises an unsaved snapshot.
        await writeSnapshot(next);
        snapshot = next;
      } catch (error) {
        if (error instanceof RmpApiError && error.statusCode === 401) tokenCache.invalidate(cached.token);
        lastError = error instanceof RmpApiError && (error.statusCode === 401 || error.statusCode === 403)
          ? 'Catalogue access could not be confirmed. Sign in with an RMP catalogue-enabled account.'
          : 'Catalogue refresh failed. The last successful snapshot has been retained; retry shortly.';
      } finally { running = null; }
    })();
    return running;
  }

  async function get({ refresh = true } = {}) {
    await load();
    if (refresh) start();
    return state();
  }
  async function queueRefresh({ force = false } = {}) {
    await load();
    start(force);
    return state();
  }
  async function refresh({ force = false } = {}) {
    await load();
    await start(force);
    return state();
  }
  return { get, queueRefresh, refresh };
}

/** Range caches never replace the shared all-catalogue snapshot or each other. */
export function createRmpCatalogueStore(options) {
  const services = new Map();
  const maxRanges = options.maxRanges ?? 12;
  const activeKeys = new Set();
  let queue = Promise.resolve();
  const upstream = options.fetchCatalogue || fetchRmpCatalogue;

  const serviceFor = input => {
    const range = normalizeCatalogueRange(input);
    const key = catalogueRangeKey(range);
    if (services.has(key)) {
      const entry = services.get(key);
      services.delete(key);
      services.set(key, entry);
      return entry;
    }
    if (services.size >= maxRanges + 1) {
      const evict = [...services.keys()].find(candidate => candidate !== 'all' && !activeKeys.has(candidate));
      if (!evict) throw new RmpApiError('Catalogue refresh queue is busy. Retry shortly.', 429);
      services.delete(evict);
    }
    const service = createRmpCatalogueSync({
      ...options, range,
      // Only the full snapshot is stored durably. Arbitrary per-range results
      // are bounded TTL caches; a filtered empty result cannot wipe the full set.
      readSnapshot: range ? async () => null : options.readSnapshot,
      writeSnapshot: range ? async () => {} : options.writeSnapshot,
      fetchCatalogue: (token, requestOptions) => {
        activeKeys.add(key);
        const task = queue.then(() => upstream(token, requestOptions));
        queue = task.catch(() => {}).finally(() => activeKeys.delete(key));
        return task;
      },
    });
    services.set(key, service);
    return service;
  };
  return {
    get: ({ range = null, ...args } = {}) => serviceFor(range).get(args),
    queueRefresh: ({ range = null, ...args } = {}) => serviceFor(range).queueRefresh(args),
    refresh: ({ range = null, ...args } = {}) => serviceFor(range).refresh(args),
  };
}

export function registerRmpCatalogueRoutes(app, { requireAuth, tokenCache, catalogueSync }) {
  const respondError = (error, res) => {
    if (error instanceof RmpApiError && [400, 429].includes(error.statusCode)) return res.status(error.statusCode).json({ error: error.message });
    return res.status(503).json({ error: 'Could not load the RMP catalogue snapshot.' });
  };
  app.get('/api/rmp/catalogue', requireAuth, async (req, res) => {
    try {
      res.setHeader('Cache-Control', 'private, no-store');
      const range = normalizeCatalogueRange(req.query);
      res.json(await catalogueSync.get({ range }));
    } catch (error) { respondError(error, res); }
  });
  app.post('/api/rmp/catalogue/sync', requireAuth, async (req, res) => {
    try {
      const range = normalizeCatalogueRange(req.body);
      const candidate = typeof req.body?.b2cToken === 'string' ? req.body.b2cToken.trim() : '';
      if (candidate) await tokenCache.cacheIfAuthorized(candidate, req.user?.email);
      if (!tokenCache.get()) return res.status(401).json({ error: 'Sign in with an RMP-enabled account to refresh the catalogue.', requiresReauth: true });
      const state = await catalogueSync.queueRefresh({ force: true, range });
      res.status(state.refreshing ? 202 : 200).json(state);
    } catch (error) {
      if (error instanceof RmpApiError && [400, 429].includes(error.statusCode)) return respondError(error, res);
      if (error instanceof RmpApiError && (error.statusCode === 401 || error.statusCode === 403)) {
        return res.status(error.statusCode).json({ error: 'RMP access could not be confirmed. Existing catalogue data was not changed.', requiresReauth: error.statusCode === 401, requiresRmpAccess: error.statusCode === 403 });
      }
      res.status(503).json({ error: 'Could not start the catalogue refresh. Please retry.' });
    }
  });
}