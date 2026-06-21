import "server-only";

import type { PropertySoftwareProviderId } from "@/lib/integrations/property-software/provider-meta";
import type { SpreadsheetColumnMapping } from "@/lib/customers/types";
import { createClient, requireUserId } from "@/lib/supabase/server";

export interface PropertySoftwareConnection {
  provider: PropertySoftwareProviderId;
  connected: boolean;
  accountLabel?: string;
  baseUrl?: string;
  username?: string;
  password?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  connectedAt?: string;
  /** Excel onboarding: selected workbook / worksheet + AI column mapping. */
  workbookId?: string;
  workbookName?: string;
  worksheetId?: string;
  worksheetName?: string;
  columnMapping?: SpreadsheetColumnMapping | null;
  /** Optional second worksheet for Handwerker (spreadsheet sources). */
  craftsmanWorksheetId?: string | null;
  craftsmanWorksheetName?: string | null;
  craftsmanColumnMapping?: SpreadsheetColumnMapping | null;
  craftsmenKbText?: string | null;
  craftsmenElevenLabsDocId?: string | null;
  craftsmenElevenLabsDocName?: string | null;
  lastSyncedAt?: string | null;
  /** Upload source: Supabase Storage object path + original file name. */
  fileRef?: string;
  fileName?: string;
  /** Google Sheet source: share URL + optional tab gid. */
  gsheetUrl?: string;
  gsheetGid?: string;
  /** Last sync outcome (ok | error) + error detail (for import_sources parity). */
  syncStatus?: string | null;
  syncError?: string | null;
}

export interface PublicPropertySoftwareStatus {
  provider: PropertySoftwareProviderId;
  connected: boolean;
  accountLabel?: string;
  baseUrl?: string;
  connectedAt?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToConnection(row: any): PropertySoftwareConnection {
  return {
    provider: row.provider,
    connected: Boolean(row.connected),
    accountLabel: row.account_label ?? undefined,
    baseUrl: row.base_url ?? undefined,
    username: row.username ?? undefined,
    password: row.password ?? undefined,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    connectedAt: row.connected_at ?? undefined,
    workbookId: row.workbook_id ?? undefined,
    workbookName: row.workbook_name ?? undefined,
    worksheetId: row.worksheet_id ?? undefined,
    worksheetName: row.worksheet_name ?? undefined,
    columnMapping: (row.column_mapping as SpreadsheetColumnMapping) ?? undefined,
    craftsmanWorksheetId: row.craftsman_worksheet_id ?? undefined,
    craftsmanWorksheetName: row.craftsman_worksheet_name ?? undefined,
    craftsmanColumnMapping:
      (row.craftsman_column_mapping as SpreadsheetColumnMapping) ?? undefined,
    craftsmenKbText: row.craftsmen_kb_text ?? undefined,
    craftsmenElevenLabsDocId: row.craftsmen_elevenlabs_doc_id ?? undefined,
    craftsmenElevenLabsDocName: row.craftsmen_elevenlabs_doc_name ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    fileRef: row.file_ref ?? undefined,
    fileName: row.file_name ?? undefined,
    gsheetUrl: row.gsheet_url ?? undefined,
    gsheetGid: row.gsheet_gid ?? undefined,
    syncStatus: row.sync_status ?? undefined,
    syncError: row.sync_error ?? undefined,
  };
}

function patchToRow(
  patch: Partial<PropertySoftwareConnection>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.connected !== undefined) row.connected = patch.connected;
  if (patch.accountLabel !== undefined) row.account_label = patch.accountLabel;
  if (patch.baseUrl !== undefined) row.base_url = patch.baseUrl;
  if (patch.username !== undefined) row.username = patch.username;
  if (patch.password !== undefined) row.password = patch.password;
  if (patch.accessToken !== undefined) row.access_token = patch.accessToken;
  if (patch.refreshToken !== undefined) row.refresh_token = patch.refreshToken;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
  if (patch.connectedAt !== undefined) row.connected_at = patch.connectedAt;
  if (patch.workbookId !== undefined) row.workbook_id = patch.workbookId;
  if (patch.workbookName !== undefined) row.workbook_name = patch.workbookName;
  if (patch.worksheetId !== undefined) row.worksheet_id = patch.worksheetId;
  if (patch.worksheetName !== undefined) row.worksheet_name = patch.worksheetName;
  if (patch.columnMapping !== undefined) row.column_mapping = patch.columnMapping;
  if (patch.craftsmanWorksheetId !== undefined) {
    row.craftsman_worksheet_id = patch.craftsmanWorksheetId;
  }
  if (patch.craftsmanWorksheetName !== undefined) {
    row.craftsman_worksheet_name = patch.craftsmanWorksheetName;
  }
  if (patch.craftsmanColumnMapping !== undefined) {
    row.craftsman_column_mapping = patch.craftsmanColumnMapping;
  }
  if (patch.craftsmenKbText !== undefined) row.craftsmen_kb_text = patch.craftsmenKbText;
  if (patch.craftsmenElevenLabsDocId !== undefined) {
    row.craftsmen_elevenlabs_doc_id = patch.craftsmenElevenLabsDocId;
  }
  if (patch.craftsmenElevenLabsDocName !== undefined) {
    row.craftsmen_elevenlabs_doc_name = patch.craftsmenElevenLabsDocName;
  }
  if (patch.lastSyncedAt !== undefined) row.last_synced_at = patch.lastSyncedAt;
  if (patch.fileRef !== undefined) row.file_ref = patch.fileRef;
  if (patch.fileName !== undefined) row.file_name = patch.fileName;
  if (patch.gsheetUrl !== undefined) row.gsheet_url = patch.gsheetUrl;
  if (patch.gsheetGid !== undefined) row.gsheet_gid = patch.gsheetGid;
  if (patch.syncStatus !== undefined) row.sync_status = patch.syncStatus;
  if (patch.syncError !== undefined) row.sync_error = patch.syncError;
  return row;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/** Strip secrets — safe to return to the client. */
export function toPublicPropertySoftwareStatus(
  connection: PropertySoftwareConnection
): PublicPropertySoftwareStatus {
  return {
    provider: connection.provider,
    connected: connection.connected,
    accountLabel: connection.accountLabel,
    baseUrl: connection.baseUrl,
    connectedAt: connection.connectedAt,
  };
}

export async function getPropertySoftwareConnections(): Promise<
  Partial<Record<PropertySoftwareProviderId, PropertySoftwareConnection>>
> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("property_software_connections")
    .select("*")
    .eq("user_id", userId);
  const out: Partial<
    Record<PropertySoftwareProviderId, PropertySoftwareConnection>
  > = {};
  for (const row of data ?? []) {
    out[row.provider as PropertySoftwareProviderId] = rowToConnection(row);
  }
  return out;
}

export async function upsertPropertySoftwareConnection(
  provider: PropertySoftwareProviderId,
  patch: Partial<PropertySoftwareConnection>
): Promise<PropertySoftwareConnection> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("property_software_connections")
    .upsert(
      { user_id: userId, provider, ...patchToRow(patch) },
      { onConflict: "user_id,provider" }
    )
    .select("*")
    .single();
  return rowToConnection(data);
}

export async function removePropertySoftwareConnection(
  provider: PropertySoftwareProviderId
): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("property_software_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
}
