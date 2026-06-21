import "server-only";

import { inferColumnMapping } from "@/lib/customers/ai-mapping";
import { fetchProviderCustomers } from "@/lib/customers/fetch";
import {
  buildMappingReport,
  missingMappedHeaders,
  resolveColumnMapping,
} from "@/lib/customers/normalize";
import { getActiveCustomerDataProvider } from "@/lib/customers/source";
import { loadCraftsmanRecordsFromSpreadsheets } from "@/lib/customers/craftsman-discovery";
import { syncCraftsmenKnowledgeBase } from "@/lib/customers/craftsmen-kb";
import { replaceCustomerRecords } from "@/lib/customers/store";
import type {
  CustomerDataProviderId,
  CustomerRecord,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";
import { PROPERTY_SOFTWARE_PROVIDER_META } from "@/lib/integrations/property-software/provider-meta";
import {
  getPropertySoftwareConnections,
  upsertPropertySoftwareConnection,
  type PropertySoftwareConnection,
} from "@/lib/integrations/property-software/store";
import {
  isSpreadsheetSource,
  loadSpreadsheetRows,
} from "@/lib/customers/source-loader";

/** Re-sync the active customer source whose mirror is older than this (1h). */
const STALE_MS = 60 * 60 * 1000;

export interface CustomerSyncResult {
  provider: CustomerDataProviderId;
  name: string;
  records: number;
  error?: string;
}

/** Error thrown when the stored mapping no longer matches the source headers. */
export class MappingMismatchError extends Error {}

function hasUsableMapping(
  mapping?: SpreadsheetColumnMapping | null
): boolean {
  if (!mapping) return false;
  return Object.values(mapping).some(
    (value) => typeof value === "string" && value.trim().length > 0
  );
}

/**
 * Load + normalize a spreadsheet source (Excel/Upload/Google Sheet) using the
 * stored, header-name column mapping. STOPS (throws MappingMismatchError) when
 * the mapping's columns are gone, so a renamed/deleted header never silently
 * wipes the existing mirror.
 */
async function loadSpreadsheetCustomers(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  const rows = await loadSpreadsheetRows(provider, connection);
  if (rows.length < 2) {
    throw new MappingMismatchError(
      "Keine Datenzeilen in der Quelle gefunden — Sync gestoppt (Daten bleiben unverändert)."
    );
  }

  const headers = rows[0] ?? [];

  // First sync (or no confirmed mapping yet): infer once and persist by name.
  let mapping = resolveColumnMapping(connection.columnMapping, headers);
  if (!hasUsableMapping(mapping)) {
    const inferred = await inferColumnMapping(headers, rows.slice(1, 11));
    mapping = inferred.mapping;
    await upsertPropertySoftwareConnection(provider, { columnMapping: mapping });
  }

  // Mapping validation: if mapped headers no longer exist, abort without wiping.
  const missing = missingMappedHeaders(mapping, headers);
  const nameHeaderGone =
    Boolean(mapping.name) &&
    missing.some((header) => header.toLowerCase() === mapping.name.toLowerCase());
  if (nameHeaderGone || (missing.length > 0 && missing.length >= countMapped(mapping))) {
    throw new MappingMismatchError(
      `Spalten in der Quelle wurden umbenannt oder entfernt (${missing.join(
        ", "
      )}). Sync gestoppt — bitte Zuordnung im Kunden-Tab prüfen.`
    );
  }

  return buildMappingReport(provider, rows, mapping).records;
}

async function loadSpreadsheetCraftsmen(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  if (!isSpreadsheetSource(provider)) return [];
  return loadCraftsmanRecordsFromSpreadsheets(provider, connection);
}

function countMapped(mapping: SpreadsheetColumnMapping): number {
  return Object.values(mapping).filter(
    (value) => typeof value === "string" && value.trim().length > 0
  ).length;
}

async function loadProviderCustomers(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  if (isSpreadsheetSource(provider)) {
    return loadSpreadsheetCustomers(provider, connection);
  }
  return fetchProviderCustomers(provider, connection);
}

function sourceReady(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): boolean {
  if (provider === "excel") return Boolean(connection.workbookId);
  if (provider === "upload") return Boolean(connection.fileRef);
  if (provider === "gsheet") return Boolean(connection.gsheetUrl);
  return true;
}

/**
 * Mirror tenant/customer master data from the active source into Supabase.
 * Only one customer database is active at a time.
 */
export async function syncActiveCustomerSource(options?: {
  staleOnly?: boolean;
  force?: boolean;
}): Promise<CustomerSyncResult | null> {
  const activeProvider = await getActiveCustomerDataProvider();
  if (!activeProvider) return null;

  const connections = await getPropertySoftwareConnections();
  const connection = connections[activeProvider];
  if (!connection?.connected) return null;

  if (!sourceReady(activeProvider, connection)) return null;

  if (options?.staleOnly && !options.force && connection.lastSyncedAt) {
    const age = Date.now() - new Date(connection.lastSyncedAt).getTime();
    if (Number.isFinite(age) && age < STALE_MS) return null;
  }

  const name = PROPERTY_SOFTWARE_PROVIDER_META[activeProvider].name;

  try {
    const customerRecords = await loadProviderCustomers(activeProvider, connection);
    let craftsmanRecords: CustomerRecord[] = [];
    if (isSpreadsheetSource(activeProvider)) {
      craftsmanRecords = await loadSpreadsheetCraftsmen(activeProvider, connection);
    }
    const count = await replaceCustomerRecords(activeProvider, [
      ...customerRecords.map((record) => ({ ...record, recordType: "customer" as const })),
      ...craftsmanRecords,
    ]);
    await syncCraftsmenKnowledgeBase({
      provider: activeProvider,
      records: craftsmanRecords,
      connection,
    });
    await upsertPropertySoftwareConnection(activeProvider, {
      lastSyncedAt: new Date().toISOString(),
      syncStatus: "ok",
      syncError: null,
    });
    return { provider: activeProvider, name, records: count };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Synchronisierung fehlgeschlagen.";
    // Record the error but DO NOT touch the existing mirror (no partial wipe).
    await upsertPropertySoftwareConnection(activeProvider, {
      syncStatus: "error",
      syncError: message,
    });
    return { provider: activeProvider, name, records: 0, error: message };
  }
}

/** @deprecated Use syncActiveCustomerSource — kept for route compatibility. */
export async function syncAllCustomers(options?: {
  staleOnly?: boolean;
}): Promise<CustomerSyncResult[]> {
  const result = await syncActiveCustomerSource(options);
  return result ? [result] : [];
}

/** Most recent successful sync timestamp for the active customer source. */
export async function getLastCustomerSyncAt(): Promise<string | undefined> {
  const activeProvider = await getActiveCustomerDataProvider();
  if (!activeProvider) return undefined;

  const connections = await getPropertySoftwareConnections();
  return connections[activeProvider]?.lastSyncedAt ?? undefined;
}
