/**
 * SharePoint Excel Reader (Frontend)
 *
 * Uses the logged-in user's Graph token to read Excel data
 * from a SharePoint workbook via Microsoft Graph API.
 */

import { acquireGraphToken } from './graphAuth';

// Defaults parsed from the user's SharePoint URL
const DEFAULTS = {
  siteHost: 'microsoft.sharepoint.com',
  sitePath: '/teams/EventsPgM-CatalogandOfferings',
  driveItemId: 'eebd2a65-d655-46a5-a48a-e0995de9cb7b',
};

// Excel header → internal field name mapping
const COLUMN_MAP: Record<string, string> = {
  'ID':                        'formId',
  'Start time':                'startTime',
  'Completion time':           'completionTime',
  'Email':                     'email',
  'Name':                      'name',
  'Last modified time':        'lastModified',
  'What would you like to do?': 'requestType',
  'What is the name of the lab you are requesting?': 'labName',
  'Please provide a 3-4 sentence description of the hands-on-lab/workshop session': 'description',
  'Does this replace or update an existing lab?': 'replacesExisting',
  'Name the lab this replaces': 'replacedLab',
  'What is the estimated number of expected customers who would attend a delivery of this lab/workshop?': 'expectedCustomers',
  'Which platform(s) does your lab cover? (select all that apply)': 'platforms',
  'What is the primary goal of your lab/workshop?': 'goal',
  'How long is the lab/workshop content?': 'duration',
  'Please attach a copy of the lab manual guide if you have one.': 'attachmentUrl',
  'What Microsoft funding scenario does this lab apply to? (select all that apply)': 'fundingScenario',
  'Would you like to be considered as an alpha team member for the lab development process?': 'alphaTeamInterest',
  'If there are specific non-technical/ non-content specs for this lab (ex: modality, tool, other), please provide details': 'nonTechSpecs',
};

async function graphGet(url: string, token: string): Promise<any> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Graph API ${res.status}: ${body.substring(0, 300)}`);
  }
  return res.json();
}

/**
 * Read the Excel workbook from SharePoint using the user's delegated token.
 * Returns an array of mapped lab backlog items.
 */
export async function readSharePointExcel(): Promise<{ items: any[]; rowCount: number }> {
  const token = await acquireGraphToken(['Sites.Read.All']);

  // Step 1: Resolve the SharePoint site
  const siteHost = import.meta.env.VITE_SHAREPOINT_SITE_HOST || DEFAULTS.siteHost;
  const sitePath = import.meta.env.VITE_SHAREPOINT_SITE_PATH || DEFAULTS.sitePath;
  const site = await graphGet(
    `https://graph.microsoft.com/v1.0/sites/${siteHost}:${sitePath}`,
    token
  );
  const siteId = site.id;

  // Step 2: Get the workbook used range
  const driveItemId = import.meta.env.VITE_SHAREPOINT_DRIVE_ITEM_ID || DEFAULTS.driveItemId;
  const workbookUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/items/${driveItemId}/workbook`;

  // Get first worksheet name
  const sheetsResp = await graphGet(`${workbookUrl}/worksheets`, token);
  const sheets: any[] = sheetsResp.value || [];
  if (sheets.length === 0) throw new Error('No worksheets found in the workbook');
  const sheetName = sheets[0].name;

  // Read used range
  const range = await graphGet(
    `${workbookUrl}/worksheets('${encodeURIComponent(sheetName)}')/usedRange`,
    token
  );
  const rows: any[][] = range.values || [];
  if (rows.length < 2) return { items: [], rowCount: 0 };

  // Step 3: Map columns
  const headers: string[] = rows[0].map((h: any) => String(h || '').trim());
  const headerIdx: Record<string, number> = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });

  // Resolve column index for each field
  const fieldMap: Record<string, number> = {};
  for (const [excelHeader, fieldName] of Object.entries(COLUMN_MAP)) {
    let idx = headerIdx[excelHeader];
    if (idx === undefined) {
      // case-insensitive fallback
      const lower = excelHeader.toLowerCase();
      for (const [h, i] of Object.entries(headerIdx)) {
        if (h.toLowerCase() === lower) { idx = i; break; }
      }
    }
    if (idx === undefined) {
      // startsWith fallback (for truncated headers)
      const lower = excelHeader.toLowerCase().substring(0, 30);
      for (const [h, i] of Object.entries(headerIdx)) {
        if (h.toLowerCase().startsWith(lower)) { idx = i; break; }
      }
    }
    if (idx !== undefined) fieldMap[fieldName] = idx;
  }

  // Handle second funding scenario column (duplicate Forms header)
  let funding2Idx: number | undefined;
  const fundingIdx = fieldMap['fundingScenario'];
  for (const [h, i] of Object.entries(headerIdx)) {
    if (h.toLowerCase().startsWith('what microsoft funding scenario') && i !== fundingIdx) {
      funding2Idx = i;
      break;
    }
  }

  // Step 4: Parse rows
  const items: any[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every((c: any) => c === null || c === '' || c === undefined)) continue;

    const item: Record<string, any> = { sr: r };
    for (const [fieldName, colIdx] of Object.entries(fieldMap)) {
      const raw = row[colIdx];
      item[fieldName] = raw != null ? String(raw).trim() : '';
    }
    if (funding2Idx !== undefined) {
      const raw = row[funding2Idx];
      item.fundingScenario2 = raw != null ? String(raw).trim() : '';
    }
    if (item.formId && !isNaN(item.formId)) item.formId = Number(item.formId);
    items.push(item);
  }

  return { items, rowCount: rows.length - 1 };
}
