import "server-only";

import type { WhatsAppAccountType } from "@/lib/integrations/whatsapp/provider-meta";
import { formatWhatsAppNumberDisplay } from "@/lib/integrations/whatsapp/number";
import { createClient, requireUserId } from "@/lib/supabase/server";

export interface WhatsAppConnection {
  id: string;
  whatsappNumber: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  phoneLabel?: string;
  accountType: WhatsAppAccountType;
  accountRegistered: boolean;
  connected: boolean;
  onboardingStatus: "pending_pairing" | "pending_verification" | "connected";
  connectedAt?: string;
}

export interface PublicWhatsAppStatus {
  id: string;
  whatsappNumber: string;
  phoneNumberId?: string;
  phoneNumber: string;
  phoneLabel?: string;
  accountType: WhatsAppAccountType;
  accountRegistered: boolean;
  connected: boolean;
  onboardingStatus: "pending_pairing" | "pending_verification" | "connected";
  connectedAt?: string;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToWhatsApp(row: any): WhatsAppConnection {
  const phone = row.user_phone_numbers as
    | { phone_number?: string; label?: string | null }
    | null
    | undefined;

  const whatsappNumber = (row.whatsapp_number as string | null) ?? "";
  const linkedPhone = phone?.phone_number ?? "";

  return {
    id: row.id,
    whatsappNumber,
    phoneNumberId: row.phone_number_id ?? undefined,
    phoneNumber: whatsappNumber || linkedPhone,
    phoneLabel: phone?.label ?? undefined,
    accountType: row.account_type,
    accountRegistered: Boolean(row.account_registered),
    connected: Boolean(row.connected),
    onboardingStatus: row.onboarding_status ?? "connected",
    connectedAt: row.connected_at ?? undefined,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export async function listWhatsAppConnections(): Promise<WhatsAppConnection[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("whatsapp_connections")
    .select(
      "id, whatsapp_number, phone_number_id, account_type, account_registered, connected, onboarding_status, connected_at, user_phone_numbers ( phone_number, label )"
    )
    .eq("user_id", userId)
    .order("connected_at", { ascending: false });

  return (data ?? []).map(rowToWhatsApp);
}

export async function removeWhatsAppConnection(
  connectionId: string
): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("whatsapp_connections")
    .delete()
    .eq("user_id", userId)
    .eq("id", connectionId);
}

export function toPublicWhatsAppStatus(
  connection: WhatsAppConnection
): PublicWhatsAppStatus {
  return {
    id: connection.id,
    whatsappNumber: connection.whatsappNumber,
    phoneNumberId: connection.phoneNumberId,
    phoneNumber:
      connection.whatsappNumber ||
      connection.phoneNumber ||
      formatWhatsAppNumberDisplay(connection.whatsappNumber),
    phoneLabel: connection.phoneLabel,
    accountType: connection.accountType,
    accountRegistered: connection.accountRegistered,
    connected: connection.connected,
    onboardingStatus: connection.onboardingStatus,
    connectedAt: connection.connectedAt,
  };
}
