import "server-only";

import { inferColumnMapping, EMPTY_COLUMN_MAPPING } from "@/lib/customers/ai-mapping";
import { fetchProviderCustomers } from "@/lib/customers/fetch";
import { applyColumnMapping } from "@/lib/customers/normalize";
import { getActiveCustomerDataProvider } from "@/lib/customers/source";
import { replaceCustomerRecords } from "@/lib/customers/store";
import type {
  CustomerDataProviderId,
  CustomerRecord,
  SpreadsheetColumnMapping,
} from "@/lib/customers/types";
import { excelLoadCustomerRows } from "@/lib/integrations/property-software/excel";
import { PROPERTY_SOFTWARE_PROVIDER_META } from "@/lib/integrations/property-software/provider-meta";
import {
  getPropertySoftwareConnections,
  upsertPropertySoftwareConnection,
  type PropertySoftwareConnection,
} from "@/lib/integrations/property-software/store";

/** Re-sync providers whose mirror is older than this. */
const STALE_MS = 6 * 60 * 60 * 1000;

export interface CustomerSyncResult {
  provider: CustomerDataProviderId;
  name: string;
  records: number;
  error?: string;
}

function hasUsableMapping(
  mapping?: SpreadsheetColumnMapping | null
): boolean {
  if (!mapping) return false;
  return Object.values(mapping).some((index) => index >= 0);
}

/**
 * Load Excel rows, resolve (and persist) the AI column mapping, and turn the
 * sheet into normalized customer records. The mapping is inferred once and
 * cached on the connection so re-syncs are cheap and deterministic.
 */
async function loadExcelCustomers(
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  const rows = await excelLoadCustomerRows(connection);
  if (rows.length < 2) return [];

  let mapping = connection.columnMapping;
  if (!hasUsableMapping(mapping)) {
    mapping = await inferColumnMapping(rows[0], rows.slice(1, 11));
    await upsertPropertySoftwareConnection("excel", {
      columnMapping: mapping,
    });
  }

  return applyColumnMapping("excel", rows, mapping ?? EMPTY_COLUMN_MAPPING);
}

async function loadProviderCustomers(
  provider: CustomerDataProviderId,
  connection: PropertySoftwareConnection
): Promise<CustomerRecord[]> {
  if (provider === "excel") {
    return loadExcelCustomers(connection);
  }
  return fetchProviderCustomers(provider, connection);
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

  if (activeProvider === "excel" && !connection.workbookId) return null;

  if (
    options?.staleOnly &&
    !options.force &&
    connection.lastSyncedAt
  ) {
    const age = Date.now() - new Date(connection.lastSyncedAt).getTime();
    if (Number.isFinite(age) && age < STALE_MS) return null;
  }

  const name = PROPERTY_SOFTWARE_PROVIDER_META[activeProvider].name;

  try {
    const records = await loadProviderCustomers(activeProvider, connection);
    const count = await replaceCustomerRecords(activeProvider, records);
    await upsertPropertySoftwareConnection(activeProvider, {
      lastSyncedAt: new Date().toISOString(),
    });
    return { provider: activeProvider, name, records: count };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Synchronisierung fehlgeschlagen.";
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
