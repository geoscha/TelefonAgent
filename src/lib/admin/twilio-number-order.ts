import "server-only";

import { isConfiguredDemoOutboundPhone } from "@/lib/admin/demo-config";
import {
  createElevenLabsClientForCredentials,
  getElevenLabsCredentials,
  getTwilioCredentials,
} from "@/lib/admin/integration-profiles";
import { getExistingPoolPhoneSet } from "@/lib/admin/number-pool";
import { normalizePhoneNumber } from "@/lib/elevenlabs/phone";
import { purchaseTwilioPhoneNumber } from "@/lib/integrations/twilio-api";
import { processPendingPhoneAssignments } from "@/lib/phone/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";

export interface OrderTwilioNumberResult {
  phoneNumber: string;
  twilioSid: string;
  elevenLabsPhoneNumberId: string;
  assignedCount: number;
}

export interface OrderTwilioNumberOptions {
  twilioAccountId?: string;
  elevenLabsAccountId?: string;
  countryCode?: string;
  addressSid?: string;
  bundleSid?: string;
  numberType?: "Mobile" | "Local";
  endUserType?: "individual" | "business";
}

async function importTwilioNumberToElevenLabs(
  phoneNumber: string,
  options: OrderTwilioNumberOptions
): Promise<string> {
  const twilio = await getTwilioCredentials(options.twilioAccountId);
  const elevenLabs = await getElevenLabsCredentials(
    options.elevenLabsAccountId
  );
  const client = createElevenLabsClientForCredentials(elevenLabs);

  const created = (await client.conversationalAi.phoneNumbers.create({
    provider: "twilio",
    phoneNumber,
    label: `Linker ${phoneNumber}`,
    sid: twilio.accountSid,
    token: twilio.authToken,
    supportsInbound: true,
    supportsOutbound: true,
  })) as { phoneNumberId?: string };

  const phoneNumberId = created.phoneNumberId;
  if (!phoneNumberId) {
    throw new Error(
      "Nummer wurde bei Twilio gekauft, aber ElevenLabs-Import lieferte keine ID."
    );
  }

  return phoneNumberId;
}

/**
 * Buys a Twilio number, imports it into ElevenLabs, and adds it to the admin pool.
 */
export async function orderTwilioNumberToPool(
  rawPhoneNumber: string,
  options: OrderTwilioNumberOptions = {}
): Promise<OrderTwilioNumberResult> {
  const phoneNumber = normalizePhoneNumber(rawPhoneNumber.trim());
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new Error("Ungültige Telefonnummer.");
  }

  if (await isConfiguredDemoOutboundPhone(phoneNumber)) {
    throw new Error("Diese Nummer ist als Live-Demo reserviert.");
  }

  const existing = await getExistingPoolPhoneSet();
  if (existing.has(phoneNumber)) {
    throw new Error("Diese Nummer ist bereits im Pool.");
  }

  const purchased = await purchaseTwilioPhoneNumber(phoneNumber, {
    twilioAccountId: options.twilioAccountId,
    countryCode: options.countryCode,
    addressSid: options.addressSid,
    bundleSid: options.bundleSid,
    numberType: options.numberType,
    endUserType: options.endUserType,
  });
  const normalized = normalizePhoneNumber(purchased.phoneNumber);

  let elevenLabsPhoneNumberId: string;
  try {
    elevenLabsPhoneNumberId = await importTwilioNumberToElevenLabs(
      normalized,
      options
    );
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "ElevenLabs-Import fehlgeschlagen.";
    throw new Error(
      `${detail} Die Nummer ${normalized} wurde trotzdem bei Twilio gekauft — bitte im Twilio-Dashboard prüfen.`
    );
  }

  const admin = createAdminClient();
  const { error } = await admin.from("forwarding_number_pool").insert({
    phone_number: normalized,
    elevenlabs_phone_number_id: elevenLabsPhoneNumberId,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Diese Nummer ist bereits im Pool.");
    }
    throw error;
  }

  const assignedCount = await processPendingPhoneAssignments();

  return {
    phoneNumber: normalized,
    twilioSid: purchased.sid,
    elevenLabsPhoneNumberId,
    assignedCount,
  };
}
