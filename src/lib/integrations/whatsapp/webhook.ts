import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { parseWhatsAppNumber } from "@/lib/integrations/whatsapp/number";

interface WhatsAppWebhookMessage {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface WhatsAppWebhookChange {
  value?: {
    metadata?: { phone_number_id?: string; display_phone_number?: string };
    messages?: WhatsAppWebhookMessage[];
  };
}

interface WhatsAppWebhookPayload {
  entry?: Array<{
    changes?: WhatsAppWebhookChange[];
  }>;
}

async function findConnectionForInbound(input: {
  businessPhoneNumberId?: string;
  businessDisplayNumber?: string;
}) {
  const supabase = createAdminClient();

  if (input.businessPhoneNumberId) {
    const { data } = await supabase
      .from("whatsapp_connections")
      .select("id, user_id, whatsapp_number, meta_phone_number_id")
      .eq("meta_phone_number_id", input.businessPhoneNumberId)
      .eq("connected", true)
      .maybeSingle();
    if (data) return data;
  }

  if (input.businessDisplayNumber) {
    const normalized = parseWhatsAppNumber(input.businessDisplayNumber);
    const { data } = await supabase
      .from("whatsapp_connections")
      .select("id, user_id, whatsapp_number, meta_phone_number_id")
      .eq("whatsapp_number", normalized)
      .eq("connected", true)
      .maybeSingle();
    if (data) return data;
  }

  const { data: fallback } = await supabase
    .from("whatsapp_connections")
    .select("id, user_id, whatsapp_number, meta_phone_number_id")
    .eq("connected", true)
    .order("connected_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback;
}

export async function handleWhatsAppWebhookPayload(
  payload: WhatsAppWebhookPayload
): Promise<number> {
  let saved = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const connection = await findConnectionForInbound({
        businessPhoneNumberId: value?.metadata?.phone_number_id,
        businessDisplayNumber: value?.metadata?.display_phone_number,
      });

      if (!connection) continue;

      for (const message of value?.messages ?? []) {
        if (message.type !== "text" || !message.text?.body?.trim()) continue;

        const sender = message.from ? `+${message.from.replace(/\D/g, "")}` : "Unbekannt";
        const threadId = `whatsapp:${connection.id}:${sender}`;

        const preview = message.text.body.trim().slice(0, 160);
        const supabase = createAdminClient();
        await supabase.from("inbound_messages").insert({
          user_id: connection.user_id,
          channel_type: "whatsapp",
          channel_ref: connection.id,
          thread_id: threadId,
          direction: "inbound",
          sender_label: sender,
          sender_address: sender,
          body: message.text.body.trim(),
          preview,
          read: false,
        });

        saved += 1;
      }
    }
  }

  return saved;
}
