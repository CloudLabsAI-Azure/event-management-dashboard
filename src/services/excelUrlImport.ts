// Excel URL import service - fetches Excel files from URLs and imports data
import * as XLSX from 'xlsx';
import apiClient from '@/lib/azureApiClient';

export interface ImportResult {
  inserted: number;
  updated?: number;
  deleted?: number;
  errors?: string[];
}

// Fetch Excel file from URL and parse it
async function fetchAndParseExcel(url: string): Promise<any[]> {
  try {
    // Fetch the Excel file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch Excel file: ${response.statusText}`);
    }

    // Get the file as array buffer
    const arrayBuffer = await response.arrayBuffer();

    // Parse the Excel file
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    // Get the first sheet
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON
    const data = XLSX.utils.sheet_to_json(worksheet);

    return data;
  } catch (error) {
    console.error('Error fetching/parsing Excel:', error);
    throw error;
  }
}

// Transform Excel data to API format based on resource type
function transformData(resourceType: string, excelData: any[]): any[] {
  switch (resourceType) {
    case 'catalog':
      return excelData.map((row: any) => ({
        eventName: row.eventName || row.EventName || '',
        catalogType: row.catalogType || row.CatalogType || '',
        catalogPublishDate: row.catalogPublishDate || row.CatalogPublishDate || '',
        eventURL: row.eventURL || row.EventURL || '',
        testingStatus: row.testingStatus || row.TestingStatus || '',
      }));

    case 'tracks':
      return excelData.map((row: any) => ({
        trackName: row.trackName || row.TrackName || '',
        testingStatus: row.testingStatus || row.TestingStatus || '',
        releaseNotes: row.releaseNotes || row.ReleaseNotes || '',
      }));

    case 'roadmap':
      return excelData.map((row: any) => ({
        trackTitle: row.trackTitle || row.TrackTitle || '',
        phase: row.phase || row.Phase || '',
        eta: row.eta || row.ETA || '',
      }));

    case 'localizedTrack':
      return excelData.map((row: any) => ({
        trackName: row.trackName || row.TrackName || '',
        language: row.language || row.Language || '',
        localizationStatus: row.localizationStatus || row.LocalizationStatus || '',
      }));

    default:
      return excelData;
  }
}

// Replace all - delete existing and import fresh
export async function replaceAllFromExcel(
  resourceType: string,
  excelUrl: string
): Promise<ImportResult> {
  try {
    // Fetch and parse Excel
    const excelData = await fetchAndParseExcel(excelUrl);

    // Transform data
    const transformedData = transformData(resourceType, excelData);

    // Send to backend replace-all endpoint
    const response = await apiClient.post(`/${resourceType}/replace-all`, {
      items: transformedData,
      type: resourceType === 'catalog' ? undefined : resourceType,
    });

    return {
      inserted: response.data.inserted || transformedData.length,
      deleted: response.data.deleted || 0,
    };
  } catch (error) {
    console.error('Replace all error:', error);
    throw error;
  }
}

// Smart merge - update existing, add new, optionally delete old
export async function smartMergeFromExcel(
  resourceType: string,
  excelUrl: string,
  deleteNotInExcel: boolean = false
): Promise<ImportResult> {
  try {
    // Fetch and parse Excel
    const excelData = await fetchAndParseExcel(excelUrl);

    // Transform data
    const transformedData = transformData(resourceType, excelData);

    // Send to backend smart-merge endpoint
    const response = await apiClient.post(`/${resourceType}/smart-merge`, {
      items: transformedData,
      deleteNotInExcel,
      type: resourceType === 'catalog' ? undefined : resourceType,
    });

    return {
      inserted: response.data.inserted || 0,
      updated: response.data.updated || 0,
      deleted: response.data.deleted || 0,
    };
  } catch (error) {
    console.error('Smart merge error:', error);
    throw error;
  }
}
