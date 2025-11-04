import { PublicClientApplication } from "@azure/msal-browser";
import { loginRequest } from "./msalConfig";

/**
 * Custom API utility that uses Azure B2C tokens for authentication
 */
class AzureApiClient {
  private msalInstance: PublicClientApplication | null = null;

  setMsalInstance(instance: PublicClientApplication) {
    this.msalInstance = instance;
  }

  private async getToken(): Promise<string | null> {
    if (!this.msalInstance) {
      console.warn('MSAL instance not set');
      return null;
    }

    try {
      const accounts = this.msalInstance.getAllAccounts();
      if (accounts.length === 0) {
        return null;
      }

      const response = await this.msalInstance.acquireTokenSilent({
        ...loginRequest,
        account: accounts[0],
      });

      return response.accessToken;
    } catch (error) {
      console.error('Failed to acquire token:', error);
      return null;
    }
  }

  async get(url: string, options: RequestInit = {}) {
    const token = await this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return {
        data: await response.json(),
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      console.error('API GET request failed:', error);
      throw error;
    }
  }

  async post(url: string, data?: any, options: RequestInit = {}) {
    const token = await this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        body: data ? JSON.stringify(data) : undefined,
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return {
        data: await response.json(),
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      console.error('API POST request failed:', error);
      throw error;
    }
  }

  async put(url: string, data?: any, options: RequestInit = {}) {
    const token = await this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'PUT',
        body: data ? JSON.stringify(data) : undefined,
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return {
        data: await response.json(),
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      console.error('API PUT request failed:', error);
      throw error;
    }
  }

  async delete(url: string, options: RequestInit = {}) {
    const token = await this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'DELETE',
        ...options,
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return {
        data: response.status === 204 ? null : await response.json(),
        status: response.status,
        statusText: response.statusText,
      };
    } catch (error) {
      console.error('API DELETE request failed:', error);
      throw error;
    }
  }
}

// Create and export a singleton instance
export const azureApiClient = new AzureApiClient();
export default azureApiClient;