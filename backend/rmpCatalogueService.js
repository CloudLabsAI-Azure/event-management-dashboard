import { convert } from 'html-to-text';
import { RmpApiError, rmpFetch, getRmpConfig } from './rmpService.js';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = value => typeof value === 'string' ? value.trim() : '';

export function catalogueSourceKey(config = getRmpConfig()) {
  return `${config.apiBaseUrl.toLowerCase()}/${config.tenantId.toLowerCase()}`;
}

/** LaunchDate is a calendar date, not an instant to convert to browser timezone. */
export function catalogueDate(value) {
  const match = text(value).match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  if (!match) return null;
  const date = new Date(`${match[1]}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

/** Validate before constructing the portal's filter expression; never accept raw OData. */
export function normalizeCatalogueRange(input) {
  const from = input?.from;
  const to = input?.to;
  if ((from === undefined || from === null || from === '') && (to === undefined || to === null || to === '')) return null;
  if (typeof from !== 'string' || typeof to !== 'string' || from.length !== 10 || to.length !== 10 || catalogueDate(from) !== from || catalogueDate(to) !== to) {
    throw new RmpApiError('Choose valid start and end dates (YYYY-MM-DD).', 400);
  }
  if (from > to) throw new RmpApiError('Content release start date must not be after the end date.', 400);
  return { from, to };
}

export function catalogueRangeKey(range) {
  const valid = normalizeCatalogueRange(range);
  return valid ? `${valid.from}:${valid.to}` : 'all';
}

/** Exact syntax observed from the Admin Center Content Release Date picker. */
export function catalogueDateFilter(range) {
  const valid = normalizeCatalogueRange(range);
  return valid ? `(content_release_datefrom in (${valid.from})) and (content_release_dateto in (${valid.to}))` : '';
}

function safeUrl(value) {
  try {
    const url = new URL(text(value));
    // A source link must not carry embedded credentials or a signed access token.
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some(key => /token|secret|sig|code/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

/** Only allowlisted display fields are persisted; never store raw AdditionalInfo. */
export function mapCatalogueTrack(row, detail = null) {
  const id = text(row.TrackUniqueName).toUpperCase();
  if (!GUID.test(id) || !text(row.TrackName)) throw new RmpApiError('Invalid catalogue track identity.', 502);
  const highlights = text(row.Popularity).split(',').map(value => value.trim()).filter(Boolean);
  const isRetired = detail?.IsRetired === true || row.IsRetired === true;
  const isHidden = detail?.IsHide === true || row.IsHide === true;
  const isNewRelease = highlights.some(value => value.toLowerCase() === 'new release');
  if (!isRetired && isHidden) return null;

  let info = {};
  try { info = JSON.parse(text(detail?.AdditionalInfo) || text(row.AdditionalInfo) || '{}'); } catch { /* optional display metadata */ }
  return {
    id,
    title: text(detail?.TrackName) || text(row.TrackName),
    description: convert(text(detail?.TrackDescription) || text(row.TrackDescription), {
      wordwrap: false,
      selectors: [{ selector: 'img', format: 'skip' }, { selector: 'a', options: { ignoreHref: true } }],
    }).slice(0, 5000),
    // Historical content remains a release even when its New Release tag expires.
    kind: isRetired ? 'retired' : isNewRelease ? 'new-release' : 'catalogue-release',
    highlights,
    level: text(detail?.Level) || text(row.Level),
    eventType: text(row.EventFormat),
    topic: text(row.TrackTopic),
    registrationLanguages: text(detail?.Language) || text(row.Language),
    labLanguages: text(info?.AvailableLabLanguage),
    releaseDate: catalogueDate(detail?.LaunchDate),
    // The observed API has no retirement date. LaunchDate is NOT retirementDate.
    retirementDate: null,
    lastContentModifiedDate: catalogueDate(detail?.LastContentModifiedDate),
    releaseNotesUrl: safeUrl(detail?.ReleaseNoteUrl),
    detailsUrl: `https://admin.cloudevents.ai/catalogue/${id}`,
    detailAvailable: detail !== null,
  };
}

/**
 * Read the same trackList + partnertrack endpoints as the Admin Center Catalog.
 * No myevents/request data, guessed dates, or missing-track retirement inference.
 */
export async function fetchRmpCatalogue(token, {
  request = rmpFetch, config = getRmpConfig(), pageSize = 100, maxPages = 100, range = null,
} = {}) {
  const dateRange = normalizeCatalogueRange(range);
  const filter = catalogueDateFilter(dateRange);
  const prefix = `/api/admin/v1.0/tenants/${config.tenantId}`;
  const readPage = async (page, size) => {
    // Keep literal $ keys; encoded %24 keys are ignored by the portal API.
    const result = await request(`${prefix}/trackList?$filter=${encodeURIComponent(filter)}&$pagenumber=${page}&$pagesize=${size}`, { token });
    if (result?.Status !== 'Success' || !Array.isArray(result.Data)) {
      throw new RmpApiError('RMP returned an invalid catalogue page.', 502);
    }
    return result.Data;
  };
  const first = await readPage(1, pageSize);
  if (first.length === 0) {
    // Observed range-with-no-matches contract: HTTP200, Status:Success, Data:[].
    // This empty result belongs only to its range, not the unfiltered catalogue.
    if (dateRange) return { version: 1, sourceKey: catalogueSourceKey(config), range: dateRange, lastSyncedAt: new Date().toISOString(), totalTracks: 0, detailErrors: 0, items: [] };
    throw new RmpApiError('No catalogue visibility could be confirmed for this account.', 403);
  }
  const total = Number(first[0].TotalRows);
  if (!Number.isSafeInteger(total) || total < first.length) throw new RmpApiError('Invalid catalogue pagination total.', 502);
  const actualSize = first.length;
  const pages = Math.ceil(total / actualSize);
  if (pages > maxPages) throw new RmpApiError('Catalogue exceeds the safe pagination limit; previous snapshot retained.', 502);

  const tracks = new Map();
  const addPage = rows => {
    for (const row of rows) {
      const id = text(row?.TrackUniqueName).toUpperCase();
      if (!GUID.test(id) || Number(row.TotalRows) !== total || typeof row.IsRetired !== 'boolean') {
        throw new RmpApiError('Catalogue changed during pagination or contains invalid records. Retry the sync.', 502);
      }
      tracks.set(id, row);
    }
  };
  addPage(first);
  for (let page = 2; page <= pages; page++) {
    const rows = await readPage(page, actualSize);
    const before = tracks.size;
    addPage(rows);
    if (tracks.size === before) throw new RmpApiError('Incomplete catalogue pagination; previous snapshot retained.', 502);
  }
  if (tracks.size !== total) throw new RmpApiError('Incomplete catalogue snapshot; previous snapshot retained.', 502);

  const candidates = [...tracks.values()].filter(row => row.IsRetired === true || row.IsHide !== true);
  const items = [];
  let detailErrors = 0;
  // Bound concurrency; collect all pages before publishing any snapshot.
  for (let offset = 0; offset < candidates.length; offset += 5) {
    const batch = candidates.slice(offset, offset + 5);
    const details = await Promise.allSettled(batch.map(async row => {
      const result = await request(`${prefix}/partnertrack/${text(row.TrackUniqueName).toUpperCase()}`, { token });
      const detail = Array.isArray(result?.Data) ? result.Data[0] : result?.Data;
      if (result?.Status !== 'Success' || text(detail?.TrackUniqueName).toUpperCase() !== text(row.TrackUniqueName).toUpperCase()) {
        throw new RmpApiError('Catalogue detail identity did not match.', 502);
      }
      return detail;
    }));
    for (let i = 0; i < batch.length; i++) {
      const result = details[i];
      if (result.status === 'rejected' && result.reason instanceof RmpApiError && result.reason.statusCode === 401) throw result.reason;
      if (result.status === 'rejected') detailErrors++;
      const item = mapCatalogueTrack(batch[i], result.status === 'fulfilled' ? result.value : null);
      if (item) items.push(item);
    }
  }
  return {
    version: 1, sourceKey: catalogueSourceKey(config), range: dateRange, lastSyncedAt: new Date().toISOString(),
    totalTracks: total, detailErrors, items,
  };
}