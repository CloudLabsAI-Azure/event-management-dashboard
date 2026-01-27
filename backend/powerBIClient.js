// Power BI API client for data synchronization
import { ConfidentialClientApplication } from '@azure/msal-node';
import axios from 'axios';

class PowerBIClient {
  constructor(config) {
    this.config = config;
    this.msalClient = null;
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  // Initialize MSAL client
  initializeMSAL() {
    if (!this.msalClient) {
      this.msalClient = new ConfidentialClientApplication({
        auth: {
          clientId: this.config.clientId,
          authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
          clientSecret: this.config.clientSecret,
        },
      });
    }
  }

  // Get access token for Power BI API
  async getAccessToken() {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    this.initializeMSAL();

    const tokenRequest = {
      scopes: ['https://analysis.windows.net/powerbi/api/.default'],
    };

    try {
      const response = await this.msalClient.acquireTokenByClientCredential(tokenRequest);
      this.accessToken = response.accessToken;
      this.tokenExpiry = Date.now() + (response.expiresIn * 1000) - 60000; // Refresh 1 min early
      return this.accessToken;
    } catch (error) {
      console.error('Failed to acquire Power BI token:', error);
      throw new Error(`Power BI authentication failed: ${error.message}`);
    }
  }

  // Execute DAX query on a dataset
  async executeQuery(workspaceId, datasetId, daxQuery) {
    const token = await this.getAccessToken();
    const url = `https://api.powerbi.com/v1.0/myorg/groups/${workspaceId}/datasets/${datasetId}/executeQueries`;

    try {
      const response = await axios.post(
        url,
        {
          queries: [{ query: daxQuery }],
          serializerSettings: { includeNulls: true },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.data.results && response.data.results.length > 0) {
        return response.data.results[0].tables[0].rows;
      }

      return [];
    } catch (error) {
      console.error('Failed to execute Power BI query:', error.response?.data || error.message);
      throw new Error(`Power BI query failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Get all rows from a table
  async getTableData(workspaceId, datasetId, tableName) {
    // DAX query to get all rows from a table
    const daxQuery = `EVALUATE ${tableName}`;
    return await this.executeQuery(workspaceId, datasetId, daxQuery);
  }

  // Get filtered rows from a table
  async getFilteredTableData(workspaceId, datasetId, tableName, filter) {
    // DAX query with filter
    const daxQuery = `EVALUATE FILTER(${tableName}, ${filter})`;
    return await this.executeQuery(workspaceId, datasetId, daxQuery);
  }
}

export default PowerBIClient;
