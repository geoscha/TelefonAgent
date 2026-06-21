import "server-only";

import { createClient, requireUserId } from "@/lib/supabase/server";

export type WebsiteSyncStatus = "pending" | "ok" | "error";

export interface WebsiteIntegration {
  connected: boolean;
  url?: string;
  accountLabel?: string;
  knowledgeText?: string;
  elevenLabsDocId?: string;
  elevenLabsDocName?: string;
  pagesScraped?: number;
  lastSyncedAt?: string;
  syncStatus?: WebsiteSyncStatus;
  syncError?: string;
  connectedAt?: string;
}

export interface PublicWebsiteStatus {
  connected: boolean;
  url?: string;
  accountLabel?: string;
  pagesScraped?: number;
  lastSyncedAt?: string;
  syncStatus?: WebsiteSyncStatus;
  syncError?: string;
  connectedAt?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToIntegration(row: any): WebsiteIntegration {
  return {
    connected: Boolean(row.connected),
    url: row.url ?? undefined,
    accountLabel: row.account_label ?? undefined,
    knowledgeText: row.knowledge_text ?? undefined,
    elevenLabsDocId: row.elevenlabs_doc_id ?? undefined,
    elevenLabsDocName: row.elevenlabs_doc_name ?? undefined,
    pagesScraped: row.pages_scraped ?? undefined,
    lastSyncedAt: row.last_synced_at ?? undefined,
    syncStatus: row.sync_status ?? undefined,
    connectedAt: row.connected_at ?? undefined,
    syncError: row.sync_error ?? undefined,
  };
}

function patchToRow(patch: Partial<WebsiteIntegration>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.connected !== undefined) row.connected = patch.connected;
  if (patch.url !== undefined) row.url = patch.url;
  if (patch.accountLabel !== undefined) row.account_label = patch.accountLabel;
  if (patch.knowledgeText !== undefined) row.knowledge_text = patch.knowledgeText;
  if (patch.elevenLabsDocId !== undefined) {
    row.elevenlabs_doc_id = patch.elevenLabsDocId;
  }
  if (patch.elevenLabsDocName !== undefined) {
    row.elevenlabs_doc_name = patch.elevenLabsDocName;
  }
  if (patch.pagesScraped !== undefined) row.pages_scraped = patch.pagesScraped;
  if (patch.lastSyncedAt !== undefined) row.last_synced_at = patch.lastSyncedAt;
  if (patch.syncStatus !== undefined) row.sync_status = patch.syncStatus;
  if (patch.syncError !== undefined) row.sync_error = patch.syncError;
  if (patch.connectedAt !== undefined) row.connected_at = patch.connectedAt;
  return row;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function toPublicWebsiteStatus(
  integration: WebsiteIntegration
): PublicWebsiteStatus {
  return {
    connected: integration.connected,
    url: integration.url,
    accountLabel: integration.accountLabel,
    pagesScraped: integration.pagesScraped,
    lastSyncedAt: integration.lastSyncedAt,
    syncStatus: integration.syncStatus,
    syncError: integration.syncError,
    connectedAt: integration.connectedAt,
  };
}

export async function getWebsiteIntegration(): Promise<WebsiteIntegration | null> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("website_integrations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToIntegration(data) : null;
}

export async function getWebsiteIntegrationForUser(
  userId: string
): Promise<WebsiteIntegration | null> {
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("website_integrations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToIntegration(data) : null;
}

export async function upsertWebsiteIntegration(
  patch: Partial<WebsiteIntegration>
): Promise<WebsiteIntegration> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { data, error } = await supabase
    .from("website_integrations")
    .upsert(
      { user_id: userId, ...patchToRow(patch) },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return rowToIntegration(data);
}

export async function clearWebsiteIntegration(): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();

  const { error } = await supabase
    .from("website_integrations")
    .delete()
    .eq("user_id", userId);

  if (error) throw error;
}
