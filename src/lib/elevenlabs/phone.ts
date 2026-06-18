import "server-only";

import { getElevenLabsClient } from "@/lib/elevenlabs/client";

/** Normalise to E.164-ish for matching (+digits only). */
export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+41" + digits.slice(1);
  return "+" + digits;
}

export interface ElevenLabsPhoneEntry {
  phoneNumber: string;
  phoneNumberId: string;
  assignedAgentId?: string;
}

/** Lists all phone numbers in the ElevenLabs workspace. */
export async function listWorkspacePhones(): Promise<ElevenLabsPhoneEntry[]> {
  const client = getElevenLabsClient();
  const items = await client.conversationalAi.phoneNumbers.list();
  return items.map((item) => ({
    phoneNumber: normalizePhoneNumber(item.phoneNumber),
    phoneNumberId: item.phoneNumberId,
    assignedAgentId: item.assignedAgent?.agentId,
  }));
}

/** Assigns an ElevenLabs Conversational AI agent to a phone number. */
export async function assignAgentToPhoneNumber(
  phoneNumberId: string,
  agentId: string,
  label?: string
): Promise<void> {
  const client = getElevenLabsClient();
  await client.conversationalAi.phoneNumbers.update(phoneNumberId, {
    agentId,
    label: label ?? `Cura Agent ${agentId.slice(0, 8)}`,
  });
}

/** Parses CURA_NUMBER_POOL (comma-separated E.164) with legacy CURA_FORWARDING_NUMBER fallback. */
export function configuredPoolNumbers(): string[] {
  const raw = process.env.CURA_NUMBER_POOL?.trim();
  const fromPool = raw
    ? raw.split(/[,;\n]+/).map((s) => normalizePhoneNumber(s.trim())).filter(Boolean)
    : [];
  const legacy = process.env.CURA_FORWARDING_NUMBER?.trim();
  const fromLegacy = legacy ? [normalizePhoneNumber(legacy)] : [];
  return Array.from(new Set([...fromPool, ...fromLegacy]));
}
