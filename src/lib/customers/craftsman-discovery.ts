import "server-only";

import { inferColumnMapping } from "@/lib/customers/ai-mapping";
import {
  buildMappingReport,
  dedupeCustomers,
  missingMappedHeaders,
  resolveColumnMapping,
} from "@/lib/customers/normalize";
import {
  discoverCraftsmanSheets,
  loadSpreadsheetRowsForSheet,
  scanSpreadsheetSource,
  scoreSheetForCraftsmen,
  type TabularSheet,
} from "@/lib/customers/source-loader";
import type {
  ColumnMappingConfidence,
  CustomerDataProviderId,
  CustomerRecord,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";
import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";

export interface CraftsmanPreviewRecord {
  name: string;
  trade?: string;
  phone?: string;
  email?: string;
  sheetName?: string;
}

export interface CraftsmanSheetSummary {
  id: string;
  name: string;
  score: number;
  dataRowCount: number;
}

export interface CraftsmanWorkbookPreview {
  sheets: CraftsmanSheetSummary[];
  totalCount: number;
  primarySheetId: string | null;
  primarySheetName: string | null;
  suggestedMapping: SpreadsheetColumnMapping | null;
  confidence: ColumnMappingConfidence;
  previewRecords: CraftsmanPreviewRecord[];
}

function mappingUsable(mapping?: SpreadsheetColumnMapping | null): boolean {
  if (!mapping) return false;
  return Object.values(mapping).some(
    (value) => typeof value === "string" && value.trim().length > 0
  );
}

function previewFromSheet(
  provider: CustomerDataProviderId,
  sheet: TabularSheet,
  mapping: SpreadsheetColumnMapping,
  sheetName: string
): CraftsmanPreviewRecord[] {
  const rows = [sheet.headers, ...sheet.sampleRows];
  return buildMappingReport(provider, rows, mapping, "craftsman").records.map(
    (record) => ({
      name: record.name,
      trade: record.trade,
      phone: record.phone,
      email: record.email,
      sheetName,
    })
  );
}

/** Scan all workbook tabs and build a merged Handwerker preview for the UI. */
export async function buildCraftsmanWorkbookPreview(input: {
  provider: CustomerDataProviderId;
  sheets: TabularSheet[];
  customerSheetId?: string | null;
}): Promise<CraftsmanWorkbookPreview | null> {
  const matches = discoverCraftsmanSheets(input.sheets, input.customerSheetId);
  if (matches.length === 0) return null;

  const sheetPreviews = await Promise.all(
    matches.map(async (match) => {
      const { mapping, confidence } = await inferColumnMapping(
        match.headers,
        match.sampleRows
      );
      return {
        id: match.id,
        name: match.name,
        score: match.score,
        dataRowCount: match.dataRowCount,
        mapping,
        confidence,
        records: previewFromSheet(
          input.provider,
          {
            id: match.id,
            name: match.name,
            headers: match.headers,
            sampleRows: match.sampleRows,
            dataRowCount: match.dataRowCount,
          },
          mapping,
          match.name
        ),
      };
    })
  );

  const primary = sheetPreviews[0];

  return {
    sheets: sheetPreviews.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
      score: sheet.score,
      dataRowCount: sheet.dataRowCount,
    })),
    totalCount: matches.reduce((sum, sheet) => sum + sheet.dataRowCount, 0),
    primarySheetId: primary?.id ?? null,
    primarySheetName: primary?.name ?? null,
    suggestedMapping: primary?.mapping ?? null,
    confidence: primary?.confidence ?? {},
    previewRecords: sheetPreviews.flatMap((sheet) => sheet.records),
  };
}

async function resolveMappingForSheet(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection,
  headers: string[],
  sampleRows: string[][]
): Promise<SpreadsheetColumnMapping> {
  let mapping = resolveColumnMapping(connection.craftsmanColumnMapping, headers);
  if (!mappingUsable(mapping)) {
    mapping = resolveColumnMapping(connection.columnMapping, headers);
  }
  if (!mappingUsable(mapping)) {
    const inferred = await inferColumnMapping(headers, sampleRows);
    mapping = inferred.mapping;
  }
  return mapping;
}

/** Load Handwerker from all relevant tabs in the workbook (multi-sheet aware). */
export async function loadCraftsmanRecordsFromSpreadsheets(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  const customerSheetId = connection.worksheetId ?? null;
  const sheets = await scanSpreadsheetSource(provider, connection);
  let candidates = discoverCraftsmanSheets(sheets, customerSheetId);

  if (connection.craftsmanWorksheetId) {
    const configured = sheets.find((sheet) => sheet.id === connection.craftsmanWorksheetId);
    if (configured) {
      candidates = [
        {
          id: configured.id,
          name: configured.name,
          score: scoreSheetForCraftsmen(configured),
          dataRowCount: configured.dataRowCount,
          headers: configured.headers,
          sampleRows: configured.sampleRows,
        },
      ];
    } else {
      candidates = candidates.filter(
        (sheet) => sheet.id === connection.craftsmanWorksheetId
      );
    }
  }

  const records: CustomerRecord[] = [];

  for (const candidate of candidates) {
    const rows = await loadSpreadsheetRowsForSheet(provider, connection, candidate.id);
    if (rows.length < 2) continue;

    const headers = rows[0] ?? [];
    const mapping = await resolveMappingForSheet(
      provider,
      connection,
      headers,
      rows.slice(1, 11)
    );

    const missing = missingMappedHeaders(mapping, headers);
    const nameHeaderGone =
      Boolean(mapping.name) &&
      missing.some((header) => header.toLowerCase() === mapping.name.toLowerCase());
    if (nameHeaderGone) continue;

    records.push(
      ...buildMappingReport(provider, rows, mapping, "craftsman").records.map(
        (record) => ({
          ...record,
          externalId: `${candidate.id}:${record.externalId ?? record.name}`,
          id: `${provider}:craftsman:${candidate.id}:${record.externalId ?? record.name}`,
        })
      )
    );
  }

  return dedupeCustomers(records);
}
