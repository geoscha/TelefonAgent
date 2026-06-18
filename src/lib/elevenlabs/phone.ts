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

export interface SipTrunkCreateInput {
  phoneNumber: string;
  label: string;
  outboundAddress?: string;
  outboundTransport?: "tcp" | "tls" | "udp";
  outboundUsername?: string;
  outboundPassword?: string;
}

/** Imports a phone number via SIP trunk into the ElevenLabs workspace. */
export async function createSipTrunkPhoneNumber(
  input: SipTrunkCreateInput
): Promise<{ phoneNumberId: string; phoneNumber: string }> {
  const client = getElevenLabsClient();
  const normalized = normalizePhoneNumber(input.phoneNumber);

  const outboundTrunkConfig =
    input.outboundAddress?.trim()
      ? {
          address: input.outboundAddress.trim(),
          transport: input.outboundTransport ?? "tcp",
          ...(input.outboundUsername && input.outboundPassword
            ? {
                credentials: {
                  username: input.outboundUsername,
                  password: input.outboundPassword,
                },
              }
            : {}),
        }
      : undefined;

  const created = (await client.conversationalAi.phoneNumbers.create({
    provider: "sip_trunk",
    phoneNumber: normalized,
    label: input.label,
    inboundTrunkConfig: {},
    outboundTrunkConfig,
    supportsInbound: true,
    supportsOutbound: Boolean(outboundTrunkConfig),
  })) as { phoneNumberId?: string; phone_number_id?: string };

  const phoneNumberId = created.phoneNumberId ?? created.phone_number_id;
  if (!phoneNumberId) {
    throw new Error("ElevenLabs hat keine Telefonnummer-ID zurückgegeben.");
  }

  return { phoneNumberId, phoneNumber: normalized };
}

/** Verifies that an imported number exists in ElevenLabs and matches E.164. */
export async function validatePhoneNumberInElevenLabs(
  phoneNumberId: string,
  expectedNumber: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getElevenLabsClient();
  const normalized = normalizePhoneNumber(expectedNumber);

  try {
    const detail = (await client.conversationalAi.phoneNumbers.get(
      phoneNumberId
    )) as { phoneNumber?: string; phone_number?: string };

    const actual = normalizePhoneNumber(
      detail.phoneNumber ?? detail.phone_number ?? ""
    );

    if (!actual) {
      return {
        ok: false,
        error: "ElevenLabs konnte die Nummer nicht bestätigen.",
      };
    }

    if (actual !== normalized) {
      return {
        ok: false,
        error: `Nummer stimmt nicht überein (${actual} ≠ ${normalized}).`,
      };
    }

    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "ElevenLabs-Validierung fehlgeschlagen.";
    return { ok: false, error: message };
  }
}

/** Removes a phone number from the ElevenLabs workspace. */
export async function deletePhoneNumberFromElevenLabs(
  phoneNumberId: string
): Promise<void> {
  const client = getElevenLabsClient();
  await client.conversationalAi.phoneNumbers.delete(phoneNumberId);
}

export const SIP_INCOMPATIBLE_MESSAGE =
  "Diese Nummer ist nicht SIP-kompatibel. Stellen Sie sicher, dass sie als SIP-Trunk bei Ihrem Anbieter eingerichtet ist und Bot-Anrufe über ElevenLabs unterstützt.";

type SipTrunkPhoneDetail = {
  provider?: string;
  phoneNumber?: string;
  phoneNumberId?: string;
  assignedAgent?: { agentId?: string };
  outboundTrunk?: unknown;
  inboundTrunk?: unknown;
};

/**
 * Validates that a SIP number can be used for Conversational AI bot calls:
 * import confirmed, agent assignable, and (when outbound trunk configured) a test call succeeds.
 */
export async function validateSipTrunkForBotCalls(options: {
  phoneNumberId: string;
  expectedNumber: string;
  agentId: string;
  outboundConfigured: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = getElevenLabsClient();
  const normalized = normalizePhoneNumber(options.expectedNumber);

  const basic = await validatePhoneNumberInElevenLabs(
    options.phoneNumberId,
    normalized
  );
  if (!basic.ok) {
    return { ok: false, error: SIP_INCOMPATIBLE_MESSAGE };
  }

  let detail: SipTrunkPhoneDetail;
  try {
    detail = (await client.conversationalAi.phoneNumbers.get(
      options.phoneNumberId
    )) as SipTrunkPhoneDetail;
  } catch {
    return { ok: false, error: SIP_INCOMPATIBLE_MESSAGE };
  }

  if (detail.provider && detail.provider !== "sip_trunk") {
    return { ok: false, error: SIP_INCOMPATIBLE_MESSAGE };
  }

  try {
    await assignAgentToPhoneNumber(
      options.phoneNumberId,
      options.agentId,
      "Cura SIP Validierung"
    );
  } catch {
    return {
      ok: false,
      error:
        "Der Telefonagent konnte der Nummer nicht zugewiesen werden. Bitte prüfen Sie die SIP-Konfiguration.",
    };
  }

  let afterAssign: SipTrunkPhoneDetail;
  try {
    afterAssign = (await client.conversationalAi.phoneNumbers.get(
      options.phoneNumberId
    )) as SipTrunkPhoneDetail;
  } catch {
    return { ok: false, error: SIP_INCOMPATIBLE_MESSAGE };
  }

  if (afterAssign.assignedAgent?.agentId !== options.agentId) {
    return {
      ok: false,
      error:
        "Bot-Anrufe sind über diese Nummer nicht möglich — Agent-Zuweisung fehlgeschlagen.",
    };
  }

  if (!options.outboundConfigured) {
    return { ok: true };
  }

  const testTo =
    process.env.SIP_VALIDATION_TEST_NUMBER?.trim() || normalized;

  try {
    const callResult = (await client.conversationalAi.sipTrunk.outboundCall({
      agentId: options.agentId,
      agentPhoneNumberId: options.phoneNumberId,
      toNumber: normalizePhoneNumber(testTo),
      telephonyCallConfig: { ringingTimeoutSecs: 8 },
    })) as { success?: boolean; message?: string };

    if (!callResult.success) {
      return {
        ok: false,
        error:
          callResult.message?.trim() ||
          SIP_INCOMPATIBLE_MESSAGE,
      };
    }
  } catch (err) {
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : SIP_INCOMPATIBLE_MESSAGE;
    return { ok: false, error: message };
  }

  return { ok: true };
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
