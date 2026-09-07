import { IPublicClientApplication } from '@azure/msal-browser';
import { loginRequest } from './msalConfig';
import api from './api';

export interface RmpSyncResult {
  success?: boolean;
  fetched?: number;
  imported?: number;
  updated?: number;
  roadmapCount?: number;
  tttCount?: number;
  customCount?: number;
  localizedCount?: number;
  baselined?: boolean;
  items?: Array<{ id: string; trackTitle?: string; trackName?: string; eventId: string; type?: string }>;
  skipped?: boolean;
  reason?: string;
  error?: string;
  requiresReauth?: boolean;
  requiresRmpAccess?: boolean;
}

export interface RmpSyncStatus {
  lastSync: string | null;
  lastResult: { fetched: number; imported: number; updated?: number; baselined?: boolean; triggeredBy: string } | null;
  processedCount: number;
  tokenAvailable: boolean;
  tokenExpiresAt: string | null;
  tokenVerifiedAt: string | null;
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
 * The backend caches it only after RMP confirms access, for hourly cron reuse.
 */
export async function triggerRmpSync(instance: IPublicClientApplication): Promise<RmpSyncResult> {
  const b2cToken = await acquireB2CIdToken(instance);
  const res = await api.post('/api/rmp/sync', { b2cToken });
  const result = res.data as RmpSyncResult;
  if (!result.skipped) {
    window.dispatchEvent(new CustomEvent('rmp:synced'));
    if ((result.imported || 0) > 0 || (result.updated || 0) > 0) {
      window.dispatchEvent(new CustomEvent('catalog:changed'));
    }
  }
  return result;
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
    return await triggerRmpSync(instance);
  } catch (err) {
    // Silent by design: user may not have RMP access, or no B2C session (dev bypass)
    console.warn('RMP auto-sync skipped:', err);
    return null;
  }
}
