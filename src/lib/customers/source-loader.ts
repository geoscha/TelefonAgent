import "server-only";

import * as XLSX from "xlsx";

import type { CustomerDataProviderId } from "@/lib/customers/types";
import {
  excelLoadCustomerRows,
  excelReadSheetRows,
  excelScanWorkbook,
  scoreSheetForCustomers,
} from "@/lib/integrations/property-software/excel";
import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";
import { createAdminClient } from "@/lib/supabase/admin";

/** Private Supabase Storage bucket holding uploaded customer import files. */
export const IMPORT_BUCKET = "customer-imports";

export interface TabularSheet {
  id: string;
  name: string;
  headers: string[];
  sampleRows: string[][];
  dataRowCount: number;
}

export interface SourceLocator {
  workbookId?: string;
  sheetId?: string;
}

// ── Generic spreadsheet helpers (upload / gsheet) ────────────────────────────

function sheetToMatrix(ws: XLSX.WorkSheet): string[][] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  return rows.map((row) =>
    (row ?? []).map((cell) => (cell == null ? "" : String(cell)))
  );
}

/** Header = row (within first 15) with the most non-empty, unique text cells. */
function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 15);
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < limit; i++) {
    const row = rows[i] ?? [];
    const filled = row.map((cell) => cell.trim()).filter(Boolean);
    if (filled.length < 2) continue;
    const unique = new Set(filled.map((cell) => cell.toLowerCase()));
    const textual = filled.filter((cell) => /[a-zà-ÿ]/i.test(cell)).length;
    const score = unique.size + textual;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best < 0 ? 0 : best;
}

function matrixToTabular(id: string, name: string, matrix: string[][]): TabularSheet {
  if (matrix.length === 0) {
    return { id, name, headers: [], sampleRows: [], dataRowCount: 0 };
  }
  const headerRowIndex = detectHeaderRow(matrix);
  const headers = (matrix[headerRowIndex] ?? []).map((cell) => cell.trim());
  const dataRows = matrix
    .slice(headerRowIndex + 1)
    .filter((row) => row.some((cell) => cell.trim().length > 0));
  return {
    id,
    name,
    headers,
    sampleRows: dataRows.slice(0, 8),
    dataRowCount: dataRows.length,
  };
}

/** Header row first, then data rows (matches applyColumnMapping expectations). */
function matrixToRows(matrix: string[][]): string[][] {
  if (matrix.length === 0) return [];
  const headerRowIndex = detectHeaderRow(matrix);
  return matrix.slice(headerRowIndex);
}

// ── Upload source (Supabase Storage + SheetJS) ───────────────────────────────

async function downloadUploadWorkbook(
  connection: PropertySoftwareConnection
): Promise<XLSX.WorkBook | null> {
  if (!connection.fileRef) return null;
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(IMPORT_BUCKET)
    .download(connection.fileRef);
  if (error || !data) {
    throw new Error("Hochgeladene Datei nicht erreichbar.");
  }
  const buffer = Buffer.from(await data.arrayBuffer());
  return XLSX.read(buffer, { type: "buffer" });
}

// ── Google Sheet source (CSV export, link-shared) ────────────────────────────

export function parseGoogleSheetUrl(
  url: string
): { id: string; gid: string } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!idMatch) return null;
  const gidMatch = url.match(/[#&?]gid=(\d+)/);
  return { id: idMatch[1], gid: gidMatch?.[1] ?? "0" };
}

export function googleSheetCsvUrl(id: string, gid: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

async function fetchGoogleSheetMatrix(
  connection: PropertySoftwareConnection
): Promise<string[][]> {
  if (!connection.gsheetUrl) return [];
  const parsed = parseGoogleSheetUrl(connection.gsheetUrl);
  if (!parsed) throw new Error("Ungültige Google-Sheet-URL.");
  const gid = connection.gsheetGid || parsed.gid;
  const res = await fetch(googleSheetCsvUrl(parsed.id, gid), {
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      "Google Sheet nicht erreichbar — Freigabe «Jeder mit dem Link (Betrachter)» prüfen."
    );
  }
  const text = await res.text();
  if (text.trimStart().startsWith("<")) {
    // Google returned an HTML login/permission page instead of CSV.
    throw new Error(
      "Google Sheet ist nicht öffentlich lesbar — Freigabe «Jeder mit dem Link» aktivieren."
    );
  }
  const workbook = XLSX.read(text, { type: "string" });
  const first = workbook.SheetNames[0];
  return first ? sheetToMatrix(workbook.Sheets[first]) : [];
}

// ── Unified API ──────────────────────────────────────────────────────────────

export function isSpreadsheetSource(
  provider: CustomerDataProviderId
): provider is "excel" | "upload" | "gsheet" {
  return provider === "excel" || provider === "upload" || provider === "gsheet";
}

/** List the candidate sheets of a spreadsheet source with headers + samples. */
export async function scanSpreadsheetSource(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection,
  locator?: SourceLocator
): Promise<TabularSheet[]> {
  if (provider === "excel") {
    const workbookId = locator?.workbookId ?? connection.workbookId;
    if (!workbookId) return [];
    const scans = await excelScanWorkbook(connection, workbookId);
    return scans.map((scan) => ({
      id: scan.id,
      name: scan.name,
      headers: scan.headers,
      sampleRows: scan.sampleRows,
      dataRowCount: scan.dataRowCount,
    }));
  }

  if (provider === "upload") {
    const workbook = await downloadUploadWorkbook(connection);
    if (!workbook) return [];
    return workbook.SheetNames.map((name) =>
      matrixToTabular(name, name, sheetToMatrix(workbook.Sheets[name]))
    );
  }

  if (provider === "gsheet") {
    const matrix = await fetchGoogleSheetMatrix(connection);
    return [matrixToTabular("0", "Google Sheet", matrix)];
  }

  return [];
}

/** Best sheet (most customer-like headers + data) when none is selected. */
export function pickBestSheet(sheets: TabularSheet[]): TabularSheet | null {
  const withData = sheets.filter((sheet) => sheet.headers.length > 0);
  if (withData.length === 0) return sheets[0] ?? null;
  return [...withData].sort(
    (a, b) =>
      scoreSheetForCustomers({ ...b, headerRowIndex: 0 }) -
      scoreSheetForCustomers({ ...a, headerRowIndex: 0 })
  )[0];
}

/** Score a worksheet tab for craftsman master data. */
export function scoreSheetForCraftsmen(sheet: TabularSheet): number {
  if (sheet.headers.length === 0 || sheet.dataRowCount === 0) return 0;
  const lower = sheet.headers.map((header) => header.toLowerCase());
  const tabName = sheet.name.toLowerCase();
  let score = 0;

  if (/handwerker|craftsman|partner|gewerk|dienstleister|pikett|lieferant/.test(tabName)) {
    score += 250;
  }

  const headerGroups = [
    ["name", "firma", "unternehmen", "betrieb", "nachname"],
    ["telefon", "tel", "natel", "handy", "mobile", "phone"],
    ["mail", "email", "e-mail"],
    ["gewerk", "fachbereich", "branche", "trade", "kategorie", "bereich"],
    ["strasse", "adresse", "address", "ort", "plz"],
  ];
  score +=
    headerGroups.filter((keys) =>
      lower.some((header) => keys.some((key) => header.includes(key)))
    ).length * 80;

  return score + Math.min(sheet.dataRowCount, 50);
}

/** Pick the most craftsman-like sheet, excluding the tenant/customer sheet. */
export function pickBestCraftsmanSheet(
  sheets: TabularSheet[],
  excludeSheetId?: string | null
): TabularSheet | null {
  const discovered = discoverCraftsmanSheets(sheets, excludeSheetId);
  if (discovered.length === 0) return null;
  const best = discovered[0];
  return (
    sheets.find((sheet) => sheet.id === best.id) ?? {
      id: best.id,
      name: best.name,
      headers: best.headers,
      sampleRows: best.sampleRows,
      dataRowCount: best.dataRowCount,
    }
  );
}

export interface DiscoveredCraftsmanSheet {
  id: string;
  name: string;
  score: number;
  dataRowCount: number;
  headers: string[];
  sampleRows: string[][];
}

function isCraftsmanCandidateSheet(
  sheet: TabularSheet,
  excludeSheetId?: string | null
): boolean {
  if (!sheet.headers.length || sheet.dataRowCount === 0) return false;
  if (excludeSheetId && sheet.id === excludeSheetId) return false;

  const craftsmanScore = scoreSheetForCraftsmen(sheet);
  const tenantScore = scoreSheetForCustomers({ ...sheet, headerRowIndex: 0 });
  const tabName = sheet.name.toLowerCase();
  const tabHint =
    /handwerker|craftsman|partner|gewerk|dienstleister|pikett|lieferant|sanit|elektro|maler|schreiner|heizung/.test(
      tabName
    );

  if (tabHint && craftsmanScore >= 40) return true;
  if (craftsmanScore < 80) return false;
  if (tenantScore > craftsmanScore + 60) return false;
  return true;
}

/** Score every tab and return all sheets that look like Handwerker master data. */
export function discoverCraftsmanSheets(
  sheets: TabularSheet[],
  excludeSheetId?: string | null
): DiscoveredCraftsmanSheet[] {
  return sheets
    .filter((sheet) => isCraftsmanCandidateSheet(sheet, excludeSheetId))
    .map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      score: scoreSheetForCraftsmen(sheet),
      dataRowCount: sheet.dataRowCount,
      headers: sheet.headers,
      sampleRows: sheet.sampleRows,
    }))
    .sort((a, b) => b.score - a.score);
}

/** Load full rows for one worksheet/tab in the active workbook. */
export async function loadSpreadsheetRowsForSheet(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection,
  sheetId: string,
  workbookId?: string
): Promise<string[][]> {
  return loadSpreadsheetRows(provider, connection, {
    workbookId: workbookId ?? connection.workbookId,
    sheetId,
  });
}

/** Load full rows (header row at index 0) for the configured/selected sheet. */
export async function loadSpreadsheetRows(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection,
  locator?: SourceLocator
): Promise<string[][]> {
  if (provider === "excel") {
    const workbookId = locator?.workbookId ?? connection.workbookId;
    const sheetId = locator?.sheetId ?? connection.worksheetId;
    if (workbookId && sheetId) {
      const raw = await excelReadSheetRows(connection, workbookId, sheetId);
      return matrixToRows(raw);
    }
    return excelLoadCustomerRows(connection);
  }

  if (provider === "upload") {
    const workbook = await downloadUploadWorkbook(connection);
    if (!workbook) return [];
    const wanted = locator?.sheetId ?? connection.worksheetId;
    const sheetName =
      wanted && workbook.SheetNames.includes(wanted)
        ? wanted
        : pickBestSheet(
            workbook.SheetNames.map((name) =>
              matrixToTabular(name, name, sheetToMatrix(workbook.Sheets[name]))
            )
          )?.name ?? workbook.SheetNames[0];
    if (!sheetName) return [];
    return matrixToRows(sheetToMatrix(workbook.Sheets[sheetName]));
  }

  if (provider === "gsheet") {
    return matrixToRows(await fetchGoogleSheetMatrix(connection));
  }

  return [];
}

/** Resolve the customer worksheet id used for Mieter/Kunden sync. */
export function resolveCustomerSheetId(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection,
  locator?: SourceLocator
): string | null {
  if (provider === "excel") {
    return locator?.sheetId ?? connection.worksheetId ?? null;
  }
  if (provider === "upload") {
    return locator?.sheetId ?? connection.worksheetId ?? null;
  }
  return null;
}

/** Load full rows for the Handwerker worksheet (legacy single-sheet helper). */
export async function loadCraftsmanSpreadsheetRows(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<string[][]> {
  if (!isSpreadsheetSource(provider)) return [];

  const customerSheetId = resolveCustomerSheetId(provider, connection);
  const sheets = await scanSpreadsheetSource(provider, connection);
  const discovered = discoverCraftsmanSheets(sheets, customerSheetId);

  const target =
    (connection.craftsmanWorksheetId &&
      discovered.find((sheet) => sheet.id === connection.craftsmanWorksheetId)) ??
    discovered[0];

  if (!target) return [];

  return loadSpreadsheetRowsForSheet(provider, connection, target.id);
}
