// Temporary pause: request-based RMP lab imports are hidden unless explicitly
// re-enabled. The separate Admin Center catalogue release feed is unaffected.
export const RMP_REQUEST_IMPORTS_PAUSED_REASON = 'RMP lab onboarding imports are temporarily paused.';

export function rmpRequestImportsEnabled(env = process.env) {
  return String(env.RMP_REQUEST_IMPORTS_ENABLED || '').trim().toLowerCase() === 'true';
}

export function isRmpRequestImport(item) {
  if (!item || typeof item !== 'object') return false;
  return String(item.source || '').trim().toLowerCase() === 'rmp'
    || (typeof item.rmpRequestUniqueName === 'string' && item.rmpRequestUniqueName.trim() !== '');
}

const LAB_RESOURCES = ['catalog', 'tracks', 'events'];

/** Response-only projection. Never use this for internal read/modify/write. */
export function visibleLabResource(resource, items, enabled = false) {
  if (enabled || !LAB_RESOURCES.includes(resource) || !Array.isArray(items)) return items;
  return items.filter(item => !isRmpRequestImport(item));
}

export function visibleDashboardData(data, enabled = false) {
  const response = { ...data };
  for (const resource of LAB_RESOURCES) {
    if (Array.isArray(data[resource])) response[resource] = visibleLabResource(resource, data[resource], enabled);
  }
  return response;
}

/**
 * Legacy clients round-trip GET/POST /api/data. A filtered response must not
 * delete its hidden rows or overwrite them with a stale client's payload.
 * Manual rows retain their existing write behavior; hidden records/IDs survive.
 */
export function preserveHiddenRmpImports(payload, stored, enabled = false) {
  if (enabled) return payload;
  const result = { ...payload };
  for (const resource of LAB_RESOURCES) {
    const hidden = Array.isArray(stored[resource]) ? stored[resource].filter(isRmpRequestImport) : [];
    if (hidden.length === 0) continue;
    const ids = new Set(hidden.map(item => item.id || item._id).filter(Boolean).map(String));
    const serials = new Set(hidden.map(item => item.sr).filter(value => value !== undefined && value !== null).map(String));
    const incoming = Array.isArray(payload[resource]) ? payload[resource] : [];
    result[resource] = [
      ...incoming.filter(item => !ids.has(String(item?.id || item?._id)) && !serials.has(String(item?.sr))),
      ...hidden,
    ];
  }
  // Keep the request baseline intact so re-enabling does not reimport history.
  if (stored._rmpSync) result._rmpSync = stored._rmpSync;
  return result;
}