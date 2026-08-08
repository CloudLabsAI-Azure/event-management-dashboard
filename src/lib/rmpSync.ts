import { IPublicClientApplication } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';
import api from './api';

export interface RmpSyncResult {
  success?: boolean;
  fetched?: number;
  imported?: number;
  roadmapCount?: number;
  tttCount?: number;
  customCount?: number;
  baselined?: boolean;
  items?: Array<{ id: string; trackTitle?: string; trackName?: string; eventId: string; type?: string }>;
  skipped?: boolean;
  reason?: string;
  error?: string;
  requiresReauth?: boolean;
}

export interface RmpSyncStatus {
  lastSync: string | null;
  lastResult: { fetched: number; imported: number; triggeredBy: string } | null;
  processedCount: number;
  tokenAvailable: boolean;
  config: { apiBaseUrl: string; tenantId: string; statusFilter: string };
}

/**
 * Silently acquire the signed-in user's Azure AD B2C **id_token**.
 * RMP validates the id_token JWT — the B2C access token is opaque with
 * OIDC-only scopes and would be rejected. Returns null when there is no
 * MSAL account (e.g. local dev bypass) or silent acquisition fails.
 */
export async function acquireB2CIdToken(instance: IPublicClientApplication): Promise<string | null> {
  const accounts = instance.getAllAccounts();
  if (accounts.length === 0) return null;
  try {
    const response = await instance.acquireTokenSilent({
      ...loginRequest,
      account: accounts[0],
    });
    return response.idToken || null;
  } catch (err) {
    console.warn('RMP sync: silent B2C token acquisition failed', err);
    return null;
  }
}

/**
 * Trigger a server-side RMP → catalog sync using the current user's B2C token.
 * The backend also keeps the token in memory so the hourly cron can reuse it.
 */
export async function triggerRmpSync(instance: IPublicClientApplication): Promise<RmpSyncResult> {
  const b2cToken = await acquireB2CIdToken(instance);
  const res = await api.post('/api/rmp/sync', { b2cToken });
  return res.data as RmpSyncResult;
}

export async function getRmpSyncStatus(): Promise<RmpSyncStatus> {
  const res = await api.get('/api/rmp/sync-status');
  return res.data as RmpSyncStatus;
}

// Only auto-sync once per browser session.
let autoSyncAttempted = false;

/**
 * Fire-and-forget auto sync: called once after login. Also hands the server a
 * fresh B2C token for its hourly cron. Never surfaces errors to the user
 * (background behavior); returns the result when a sync actually ran.
 */
export async function maybeAutoSyncRmp(instance: IPublicClientApplication): Promise<RmpSyncResult | null> {
  if (autoSyncAttempted) return null;
  autoSyncAttempted = true;
  try {
    const result = await triggerRmpSync(instance);
    if (result.imported && result.imported > 0) {
      try { window.dispatchEvent(new CustomEvent('catalog:changed')); } catch { /* noop */ }
    }
    return result;
  } catch (err) {
    // Silent by design: user may not have RMP access, or no B2C session (dev bypass)
    console.warn('RMP auto-sync skipped:', err);
    return null;
  }
}
