import { hasEventFormat, mapRmpEventRequest, registerRmpEventScanRoute, scanRmpEventRequests } from './rmpEventScanService.js';

export const isCustomTechFormat = value => hasEventFormat(value, 'Custom Tech Event');
export const mapCustomTechRequest = (row, detail = null) => mapRmpEventRequest(row, detail, 'Custom Tech Event');
export const scanRmpCustomTech = (token, options = {}) => scanRmpEventRequests(token, { ...options, eventFormat: 'Custom Tech Event' });

export function registerRmpCustomTechRoutes(app, { requireAuth, scan = scanRmpCustomTech, now = Date.now }) {
  registerRmpEventScanRoute(app, { path: '/api/rmp/custom-tech/sync', label: 'Custom Tech', requireAuth, scan, now });
}