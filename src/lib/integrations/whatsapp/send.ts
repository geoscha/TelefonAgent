import "server-only";

import {
  getWhatsAppAccessToken,
  getWhatsAppPhoneNumberId,
  isWhatsAppCloudConfigured,
} from "@/lib/integrations/whatsapp/config";
import { parseWhatsAppNumber } from "@/lib/integrations/whatsapp/number";

export async function sendWhatsAppTextMessage(input: {
  to: string;
  body: string;
  phoneNumberId?: string;
}): Promise<void> {
  if (!isWhatsAppCloudConfigured()) {
    throw new Error(
      "WhatsApp Cloud API ist nicht konfiguriert (META_WHATSAPP_ACCESS_TOKEN / META_WHATSAPP_PHONE_NUMBER_ID)."
    );
  }

  const token = getWhatsAppAccessToken();
  const phoneNumberId = input.phoneNumberId ?? getWhatsAppPhoneNumberId();
  if (!token || !phoneNumberId) {
    throw new Error("WhatsApp Cloud API ist nicht konfiguriert.");
  }

  const to = parseWhatsAppNumber(input.to).replace(/\D/g, "");
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: input.body },
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp senden fehlgeschlagen: ${detail}`);
  }
}
