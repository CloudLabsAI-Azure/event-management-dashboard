/**
 * Graph Auth Helper
 * 
 * Separate MSAL instance for Azure AD (not B2C) to access Microsoft Graph API.
 * Used for reading SharePoint Excel files with the user's work account.
 *
 * Setup:
 *   1. Register a SPA app in Entra ID (Azure AD)
 *   2. Add redirect URI: your app's origin (e.g. http://localhost:5173)
 *   3. Add API permission: Microsoft Graph → Delegated → Sites.Read.All
 *   4. Grant admin consent
 *   5. Set VITE_GRAPH_CLIENT_ID in your .env
 */

import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

// Separate MSAL instance for Azure AD Graph access
let graphMsalInstance: PublicClientApplication | null = null;

const GRAPH_CLIENT_ID = import.meta.env.VITE_GRAPH_CLIENT_ID || '';
const GRAPH_TENANT_ID = import.meta.env.VITE_GRAPH_TENANT_ID || 'organizations';

function getGraphMsal(): PublicClientApplication {
  if (!graphMsalInstance) {
    if (!GRAPH_CLIENT_ID) {
      throw new Error('VITE_GRAPH_CLIENT_ID is not configured. Register a SPA app in Entra ID and set this env var.');
    }

    const authority = GRAPH_TENANT_ID === 'organizations'
      ? 'https://login.microsoftonline.com/organizations'
      : `https://login.microsoftonline.com/${GRAPH_TENANT_ID}`;

    graphMsalInstance = new PublicClientApplication({
      auth: {
        clientId: GRAPH_CLIENT_ID,
        authority,
        redirectUri: window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage',
        storeAuthStateInCookie: false,
      },
    });
  }
  return graphMsalInstance;
}

/**
 * Acquire a Graph API token via popup.
 * If the user has already consented, it'll be silent. Otherwise, a popup appears.
 */
export async function acquireGraphToken(scopes: string[] = ['Sites.Read.All']): Promise<string> {
  const msal = getGraphMsal();
  await msal.initialize();

  const accounts = msal.getAllAccounts();

  // Try silent first if we have a cached account
  if (accounts.length > 0) {
    try {
      const result = await msal.acquireTokenSilent({ scopes, account: accounts[0] });
      return result.accessToken;
    } catch (err) {
      if (!(err instanceof InteractionRequiredAuthError)) {
        console.warn('Silent token acquisition failed, falling back to popup');
      }
    }
  }

  // Interactive popup
  const result = await msal.acquireTokenPopup({ scopes });
  return result.accessToken;
}

/**
 * Check if Graph auth is configured
 */
export function isGraphAuthConfigured(): boolean {
  return !!GRAPH_CLIENT_ID;
}
