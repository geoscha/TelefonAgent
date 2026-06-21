import "server-only";

import { aspsmsSendSms } from "@/lib/integrations/sms/aspsms";
import { sevenSendSms } from "@/lib/integrations/sms/seven";
import {
  getActiveSmsConnection,
  type SmsConnection,
} from "@/lib/integrations/sms/store";
import { twilioSendSms } from "@/lib/integrations/sms/twilio";

export async function sendSmsMessage(
  to: string,
  body: string,
  connection?: SmsConnection | null
): Promise<{ provider: string; messageId: string }> {
  const active = connection ?? (await getActiveSmsConnection());
  if (!active?.connected) {
    throw new Error("Kein SMS-Gateway verbunden.");
  }

  const text = body.trim();
  if (!text) {
    throw new Error("SMS-Text darf nicht leer sein.");
  }

  switch (active.provider) {
    case "twilio": {
      const result = await twilioSendSms(active, to, text);
      return { provider: active.provider, messageId: result.sid };
    }
    case "seven": {
      const result = await sevenSendSms(active, to, text);
      return { provider: active.provider, messageId: result.id };
    }
    case "aspsms": {
      const result = await aspsmsSendSms(active, to, text);
      return { provider: active.provider, messageId: result.id };
    }
    default:
      throw new Error("SMS-Versand für diesen Anbieter nicht verfügbar.");
  }
}
