import "server-only";

import type { SmsProviderId } from "@/lib/integrations/sms/provider-meta";
import { createClient, requireUserId } from "@/lib/supabase/server";

export interface SmsConnection {
  provider: SmsProviderId;
  connected: boolean;
  accountLabel?: string;
  senderId?: string;
  username?: string;
  password?: string;
  connectedAt?: string;
}

export interface PublicSmsStatus {
  provider: SmsProviderId;
  connected: boolean;
  accountLabel?: string;
  senderId?: string;
  connectedAt?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToConnection(row: any): SmsConnection {
  return {
    provider: row.provider,
    connected: Boolean(row.connected),
    accountLabel: row.account_label ?? undefined,
    senderId: row.sender_id ?? undefined,
    username: row.username ?? undefined,
    password: row.password ?? undefined,
    connectedAt: row.connected_at ?? undefined,
  };
}

function patchToRow(patch: Partial<SmsConnection>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.connected !== undefined) row.connected = patch.connected;
  if (patch.accountLabel !== undefined) row.account_label = patch.accountLabel;
  if (patch.senderId !== undefined) row.sender_id = patch.senderId;
  if (patch.username !== undefined) row.username = patch.username;
  if (patch.password !== undefined) row.password = patch.password;
  if (patch.connectedAt !== undefined) row.connected_at = patch.connectedAt;
  return row;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function toPublicSmsStatus(connection: SmsConnection): PublicSmsStatus {
  return {
    provider: connection.provider,
    connected: connection.connected,
    accountLabel: connection.accountLabel,
    senderId: connection.senderId,
    connectedAt: connection.connectedAt,
  };
}

export async function getSmsConnections(): Promise<
  Partial<Record<SmsProviderId, SmsConnection>>
> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("sms_connections")
    .select("*")
    .eq("user_id", userId);
  const out: Partial<Record<SmsProviderId, SmsConnection>> = {};
  for (const row of data ?? []) {
    out[row.provider as SmsProviderId] = rowToConnection(row);
  }
  return out;
}

export async function upsertSmsConnection(
  provider: SmsProviderId,
  patch: Partial<SmsConnection>
): Promise<SmsConnection> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("sms_connections")
    .upsert(
      { user_id: userId, provider, ...patchToRow(patch) },
      { onConflict: "user_id,provider" }
    )
    .select("*")
    .single();
  return rowToConnection(data);
}

export async function removeSmsConnection(provider: SmsProviderId): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("sms_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
}

/** Only one SMS gateway active — disconnect others when connecting a new one. */
export async function ensureSingleSmsConnection(
  keepProvider: SmsProviderId
): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("sms_connections")
    .delete()
    .eq("user_id", userId)
    .neq("provider", keepProvider);
}

export async function getActiveSmsConnection(): Promise<SmsConnection | null> {
  const map = await getSmsConnections();
  for (const provider of Object.values(map)) {
    if (provider?.connected) return provider;
  }
  return null;
}
