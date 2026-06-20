import "server-only";

import type { MailProviderId } from "@/lib/integrations/mail/provider-meta";
import { createClient, requireUserId } from "@/lib/supabase/server";

export interface MailConnection {
  provider: MailProviderId;
  connected: boolean;
  accountLabel?: string;
  connectedAt?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  appPassword?: string;
}

export interface PublicMailStatus {
  provider: MailProviderId;
  connected: boolean;
  configured: boolean;
  accountLabel?: string;
  connectedAt?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToMail(row: any): MailConnection {
  return {
    provider: row.provider,
    connected: Boolean(row.connected),
    accountLabel: row.account_label ?? undefined,
    connectedAt: row.connected_at ?? undefined,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    appPassword: row.app_password ?? undefined,
  };
}

function mailPatchToRow(patch: Partial<MailConnection>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.connected !== undefined) row.connected = patch.connected;
  if (patch.accountLabel !== undefined) row.account_label = patch.accountLabel;
  if (patch.connectedAt !== undefined) row.connected_at = patch.connectedAt;
  if (patch.accessToken !== undefined) row.access_token = patch.accessToken;
  if (patch.refreshToken !== undefined) row.refresh_token = patch.refreshToken;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
  if (patch.appPassword !== undefined) row.app_password = patch.appPassword;
  return row;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getMailConnections(): Promise<
  Partial<Record<MailProviderId, MailConnection>>
> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("mail_connections")
    .select("*")
    .eq("user_id", userId);
  const out: Partial<Record<MailProviderId, MailConnection>> = {};
  for (const row of data ?? []) {
    out[row.provider as MailProviderId] = rowToMail(row);
  }
  return out;
}

export async function upsertMailConnection(
  provider: MailProviderId,
  patch: Partial<MailConnection>
): Promise<MailConnection> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("mail_connections")
    .upsert(
      { user_id: userId, provider, ...mailPatchToRow(patch) },
      { onConflict: "user_id,provider" }
    )
    .select("*")
    .single();
  return rowToMail(data);
}

export async function removeMailConnection(
  provider: MailProviderId
): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("mail_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
}

export async function ensureSingleMailConnection(
  keepProvider: MailProviderId
): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("mail_connections")
    .delete()
    .eq("user_id", userId)
    .neq("provider", keepProvider);
}
