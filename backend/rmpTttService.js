import { hasEventFormat, mapRmpEventRequest, registerRmpEventScanRoute, scanRmpEventRequests } from './rmpEventScanService.js';
export { normalizeScheduledRange as normalizeTttRange } from './rmpEventScanService.js';

export const isExplicitTttFormat = value => hasEventFormat(value, 'Train-The-Trainer');
export const mapTttScanRequest = (row, detail = null) => mapRmpEventRequest(row, detail, 'Train-The-Trainer');
export const scanRmpTtt = (token, options = {}) => scanRmpEventRequests(token, { ...options, eventFormat: 'Train-The-Trainer' });

export function registerRmpTttRoutes(app, { requireAuth, scan = scanRmpTtt, now = Date.now }) {
  registerRmpEventScanRoute(app, { path: '/api/rmp/ttt/scan', label: 'TTT', requireAuth, scan, now });
}