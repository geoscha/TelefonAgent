import "server-only";

import {
  getWorkspacePhoneDetail,
  listWorkspacePhoneDetails,
  normalizePhoneNumber,
} from "@/lib/elevenlabs/phone";
import { createAdminClient } from "@/lib/supabase/admin";

export interface DemoOutboundConfig {
  phoneNumber: string | null;
  elevenLabsPhoneId: string | null;
}

export interface DemoOutboundConfigPublic {
  phoneNumber: string | null;
  elevenLabsPhoneId: string | null;
  configured: boolean;
}

async function readDemoConfigRow(): Promise<{
  phoneNumber: string | null;
  elevenLabsPhoneId: string | null;
}> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("demo_outbound_phone_number, demo_outbound_elevenlabs_phone_id")
    .eq("id", 1)
    .maybeSingle();

  const phoneRaw = (data?.demo_outbound_phone_number as string | null)?.trim();
  const phoneNumber = phoneRaw ? normalizePhoneNumber(phoneRaw) : null;
  const elevenLabsPhoneId =
    (data?.demo_outbound_elevenlabs_phone_id as string | null)?.trim() || null;

  return { phoneNumber, elevenLabsPhoneId };
}

/** Normalised demo outbound E.164 from admin settings (not the user number pool). */
export async function getConfiguredDemoOutboundPhone(): Promise<string | null> {
  const { phoneNumber } = await readDemoConfigRow();
  return phoneNumber;
}

export async function isConfiguredDemoOutboundPhone(
  phone: string
): Promise<boolean> {
  const configured = await getConfiguredDemoOutboundPhone();
  if (!configured) return false;
  return normalizePhoneNumber(phone) === configured;
}

export async function getDemoOutboundConfig(): Promise<DemoOutboundConfig> {
  const fromDb = await readDemoConfigRow();
  const envPhoneId = process.env.DEMO_AGENT_PHONE_NUMBER_ID?.trim();

  return {
    phoneNumber: fromDb.phoneNumber,
    elevenLabsPhoneId: envPhoneId || fromDb.elevenLabsPhoneId,
  };
}

export async function getDemoOutboundConfigPublic(): Promise<DemoOutboundConfigPublic> {
  const config = await getDemoOutboundConfig();
  return {
    phoneNumber: config.phoneNumber,
    elevenLabsPhoneId: config.elevenLabsPhoneId,
    configured: Boolean(config.phoneNumber || config.elevenLabsPhoneId),
  };
}

async function resolveElevenLabsPhoneId(
  phoneNumber: string,
  explicitId?: string | null
): Promise<string | null> {
  if (explicitId?.trim()) return explicitId.trim();

  try {
    const phones = await listWorkspacePhoneDetails();
    const match = phones.find((p) => p.phoneNumber === phoneNumber);
    return match?.phoneNumberId ?? null;
  } catch {
    return null;
  }
}

export async function updateDemoOutboundConfig(input: {
  phoneNumber: string;
}): Promise<DemoOutboundConfigPublic> {
  const phoneNumber = normalizePhoneNumber(input.phoneNumber.trim());
  if (!/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new Error("Bitte eine gültige Telefonnummer im Format +41… eingeben.");
  }

  const elevenLabsPhoneId = await resolveElevenLabsPhoneId(phoneNumber);
  if (elevenLabsPhoneId) {
    try {
      const detail = await getWorkspacePhoneDetail(elevenLabsPhoneId);
      if (detail.phoneNumber !== phoneNumber) {
        throw new Error(
          "Die ElevenLabs-Telefonnummer stimmt nicht mit der Eingabe überein."
        );
      }
      if (!detail.supportsOutbound) {
        throw new Error(
          "Diese Nummer unterstützt in ElevenLabs keine ausgehenden Anrufe."
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("unterstützt")) {
        throw error;
      }
    }
  }

  const admin = createAdminClient();
  const row = {
    demo_outbound_phone_number: phoneNumber,
    demo_outbound_elevenlabs_phone_id: elevenLabsPhoneId,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await admin
    .from("admin_config")
    .select("id")
    .eq("id", 1)
    .maybeSingle();

  if (!existing) {
    const { envAdminCredentials, hashAdminCode } = await import(
      "@/lib/admin/crypto"
    );
    const env = envAdminCredentials();
    await admin.from("admin_config").insert({
      id: 1,
      username: env.username,
      code_hash: hashAdminCode(env.code),
      ...row,
    });
  } else {
    const { error } = await admin.from("admin_config").update(row).eq("id", 1);
    if (error) throw error;
  }

  await admin
    .from("forwarding_number_pool")
    .delete()
    .eq("phone_number", phoneNumber)
    .is("assigned_user_id", null);

  return getDemoOutboundConfigPublic();
}

export async function clearDemoOutboundConfig(): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("admin_config")
    .update({
      demo_outbound_phone_number: null,
      demo_outbound_elevenlabs_phone_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw error;
}
