import "server-only";

import { aspsmsConnect } from "@/lib/integrations/sms/aspsms";
import type { SmsProviderId } from "@/lib/integrations/sms/provider-meta";
import { sevenSmsConnect } from "@/lib/integrations/sms/seven";
import type { SmsConnection } from "@/lib/integrations/sms/store";
import { twilioSmsConnect } from "@/lib/integrations/sms/twilio";

export interface SmsConnectInput {
  username?: string;
  password?: string;
  senderId?: string;
}

export async function connectSmsGateway(
  provider: SmsProviderId,
  input: SmsConnectInput
): Promise<Partial<SmsConnection>> {
  const username = input.username?.trim() ?? "";
  const password = input.password?.trim() ?? "";
  const senderId = input.senderId?.trim() ?? "";

  switch (provider) {
    case "twilio":
      return twilioSmsConnect(username, password, senderId);
    case "seven":
      return sevenSmsConnect(password, senderId || undefined);
    case "aspsms":
      return aspsmsConnect(username, password, senderId);
    default:
      throw new Error("Unbekannter SMS-Anbieter.");
  }
}
