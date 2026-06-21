import "server-only";

import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";

const TOKEN_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";

export const EXCEL_SCOPES = [
  "offline_access",
  "openid",
  "email",
  "User.Read",
  "Files.Read",
  "Files.Read.All",
];

export function excelRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/integrations/property-software/excel/callback`;
}

export function isExcelConfigured(): boolean {
  return Boolean(
    process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
  );
}

export function excelAuthUrl(state: string, appUrl: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    redirect_uri: excelRedirectUri(appUrl),
    response_type: "code",
    scope: EXCEL_SCOPES.join(" "),
    response_mode: "query",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function excelExchangeCode(
  code: string,
  appUrl: string
): Promise<Partial<PropertySoftwareConnection>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      redirect_uri: excelRedirectUri(appUrl),
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(
      `Microsoft Token-Austausch fehlgeschlagen: ${await res.text()}`
    );
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  const email = await excelAccountLabel(tok.access_token);

  return {
    connected: true,
    accountLabel: email,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: tok.expires_in
      ? Date.now() + tok.expires_in * 1000
      : undefined,
    connectedAt: new Date().toISOString(),
  };
}

async function excelAccountLabel(accessToken: string): Promise<string> {
  try {
    const r = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return "Microsoft Excel";
    const data = (await r.json()) as {
      mail?: string;
      userPrincipalName?: string;
      displayName?: string;
    };
    return data.mail ?? data.userPrincipalName ?? data.displayName ?? "Microsoft Excel";
  } catch {
    return "Microsoft Excel";
  }
}

async function excelAccessToken(
  connection: PropertySoftwareConnection
): Promise<string> {
  if (
    connection.accessToken &&
    (!connection.expiresAt || connection.expiresAt > Date.now() + 60_000)
  ) {
    return connection.accessToken;
  }

  if (!connection.refreshToken) {
    throw new Error("Excel-Verbindung abgelaufen — bitte erneut verbinden.");
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Excel-Zugriff konnte nicht erneuert werden.");
  }

  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };

  connection.accessToken = tok.access_token;
  if (tok.refresh_token) connection.refreshToken = tok.refresh_token;
  connection.expiresAt = tok.expires_in
    ? Date.now() + tok.expires_in * 1000
    : undefined;

  return tok.access_token;
}

export interface ExcelDriveItem {
  id: string;
  name: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  size?: number;
}

function isExcelFileName(name: string): boolean {
  return /\.xlsx?$/i.test(name);
}

async function graphGet<T>(
  token: string,
  url: string
): Promise<T> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Microsoft Graph Fehler (${response.status}).`);
  }
  return (await response.json()) as T;
}

/** Walk OneDrive folders and collect Excel workbooks (more reliable than search). */
async function excelCollectFromFolder(
  token: string,
  folderId: string,
  out: ExcelDriveItem[],
  depth = 0
): Promise<void> {
  if (depth > 8) return;

  let url =
    folderId === "root"
      ? "https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,webUrl,lastModifiedDateTime,size,folder,file"
      : `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children?$select=id,name,webUrl,lastModifiedDateTime,size,folder,file`;

  while (url) {
    const data = await graphGet<{
      value?: Array<{
        id: string;
        name?: string;
        webUrl?: string;
        lastModifiedDateTime?: string;
        size?: number;
        folder?: unknown;
        file?: unknown;
      }>;
      "@odata.nextLink"?: string;
    }>(token, url);

    for (const item of data.value ?? []) {
      const name = item.name ?? "";
      if (item.folder) {
        await excelCollectFromFolder(token, item.id, out, depth + 1);
        continue;
      }
      if (!isExcelFileName(name)) continue;
      out.push({
        id: item.id,
        name,
        webUrl: item.webUrl,
        lastModifiedDateTime: item.lastModifiedDateTime,
        size: item.size,
      });
    }

    url = data["@odata.nextLink"] ?? "";
  }
}

export async function excelListWorkbooks(
  connection: PropertySoftwareConnection
): Promise<ExcelDriveItem[]> {
  const token = await excelAccessToken(connection);
  const found = new Map<string, ExcelDriveItem>();

  // Primary: recursive folder scan of personal OneDrive.
  const scanned: ExcelDriveItem[] = [];
  await excelCollectFromFolder(token, "root", scanned);
  for (const item of scanned) {
    found.set(item.id, item);
  }

  // Fallback: Graph search (may surface files the walk missed).
  try {
    const search = await graphGet<{ value?: ExcelDriveItem[] }>(
      token,
      "https://graph.microsoft.com/v1.0/me/drive/root/search(q='xlsx')"
    );
    for (const item of search.value ?? []) {
      if (!isExcelFileName(item.name ?? "")) continue;
      found.set(item.id, item);
    }
  } catch {
    // Search is best-effort — folder scan is the main path.
  }

  return Array.from(found.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "de-CH", { sensitivity: "base" })
  );
}

export interface ExcelWorksheet {
  id: string;
  name: string;
}

export async function excelListWorksheets(
  connection: PropertySoftwareConnection,
  workbookId: string
): Promise<ExcelWorksheet[]> {
  const token = await excelAccessToken(connection);
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(
      `Excel-Arbeitsblätter konnten nicht geladen werden (${response.status}).`
    );
  }

  const data = (await response.json()) as {
    value?: Array<{ id: string; name?: string }>;
  };

  return (data.value ?? []).map((sheet) => ({
    id: sheet.id,
    name: sheet.name?.trim() || "Blatt",
  }));
}

/** Read the used range of a specific worksheet as a raw value matrix. */
export async function excelReadSheetRows(
  connection: PropertySoftwareConnection,
  workbookId: string,
  worksheetId: string
): Promise<string[][]> {
  const token = await excelAccessToken(connection);
  const rangeRes = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/items/${workbookId}/workbook/worksheets/${worksheetId}/usedRange(valuesOnly=true)`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
  );

  if (!rangeRes.ok) {
    throw new Error(`Excel-Daten konnten nicht gelesen werden (${rangeRes.status}).`);
  }

  const range = (await rangeRes.json()) as { values?: unknown[][] };
  return (range.values ?? []).map((row) =>
    row.map((cell) => (cell == null ? "" : String(cell)))
  );
}

export interface ExcelSheetScan {
  id: string;
  name: string;
  headerRowIndex: number;
  headers: string[];
  sampleRows: string[][];
  dataRowCount: number;
}

/** A row qualifies as a header if it has several non-empty text-ish cells. */
function looksLikeHeaderRow(row: string[]): boolean {
  const filled = row.filter((cell) => cell.trim().length > 0);
  if (filled.length < 2) return false;
  const textual = filled.filter((cell) => /[a-zà-ÿ]/i.test(cell));
  return textual.length >= Math.max(2, Math.floor(filled.length / 2));
}

/**
 * Find the most plausible header row in the first rows of a sheet — many
 * exports have a title/blank rows before the actual table.
 */
function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 15);
  let best = -1;
  let bestFilled = 0;
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    if (!looksLikeHeaderRow(row)) continue;
    const filled = row.filter((cell) => cell.trim().length > 0).length;
    if (filled > bestFilled) {
      best = i;
      bestFilled = filled;
    }
  }
  return best;
}

/**
 * Scan every worksheet of a workbook and return headers + sample data.
 * Customer data is often on a sub-sheet, so all tabs are inspected.
 */
export async function excelScanWorkbook(
  connection: PropertySoftwareConnection,
  workbookId: string
): Promise<ExcelSheetScan[]> {
  const worksheets = await excelListWorksheets(connection, workbookId);
  const scans: ExcelSheetScan[] = [];

  for (const sheet of worksheets) {
    let rows: string[][] = [];
    try {
      rows = await excelReadSheetRows(connection, workbookId, sheet.id);
    } catch {
      rows = [];
    }

    const headerRowIndex = detectHeaderRow(rows);
    if (headerRowIndex < 0) {
      scans.push({
        id: sheet.id,
        name: sheet.name,
        headerRowIndex: -1,
        headers: [],
        sampleRows: [],
        dataRowCount: 0,
      });
      continue;
    }

    const headers = (rows[headerRowIndex] ?? []).map((cell) => cell.trim());
    const dataRows = rows.slice(headerRowIndex + 1).filter((row) =>
      row.some((cell) => cell.trim().length > 0)
    );

    scans.push({
      id: sheet.id,
      name: sheet.name,
      headerRowIndex,
      headers,
      sampleRows: dataRows.slice(0, 8),
      dataRowCount: dataRows.length,
    });
  }

  return scans;
}

/** Score a sheet by how many customer fields its headers cover + data size. */
export function scoreSheetForCustomers(scan: ExcelSheetScan): number {
  if (scan.headers.length === 0 || scan.dataRowCount === 0) return 0;
  const lower = scan.headers.map((h) => h.toLowerCase());
  const hits = [
    ["name", "mieter", "kunde", "nachname"],
    ["telefon", "tel", "natel", "handy", "mobile", "phone"],
    ["mail", "email", "e-mail"],
    ["strasse", "adresse", "liegenschaft", "address", "ort", "plz"],
    ["objekt", "wohnung", "mietobjekt"],
    ["mietbeginn", "einzug", "mietende", "auszug"],
  ].filter((keys) =>
    lower.some((header) => keys.some((key) => header.includes(key)))
  ).length;

  return hits * 100 + Math.min(scan.dataRowCount, 50);
}

export async function excelLoadCustomerRows(
  connection: PropertySoftwareConnection
): Promise<string[][]> {
  const workbookId = connection.workbookId;
  if (!workbookId) return [];

  let sheetId = connection.worksheetId;
  if (!sheetId) {
    const worksheets = await excelListWorksheets(connection, workbookId);
    sheetId = worksheets[0]?.id;
  }
  if (!sheetId) return [];

  const rows = await excelReadSheetRows(connection, workbookId, sheetId);

  // Strip leading title/blank rows so the header row comes first.
  const headerRowIndex = detectHeaderRow(rows);
  if (headerRowIndex > 0) {
    return rows.slice(headerRowIndex);
  }
  return rows;
}
