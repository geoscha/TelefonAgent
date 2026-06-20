import "server-only";

import { describeElevenLabsError, getElevenLabsClient } from "@/lib/elevenlabs/client";
import { normalizePhoneNumber } from "@/lib/phone/normalize";

export { normalizePhoneNumber };

export type PhoneTelephonyProvider = "twilio" | "sip_trunk" | "exotel";

export interface ElevenLabsPhoneEntry {
  phoneNumber: string;
  phoneNumberId: string;
  assignedAgentId?: string;
}

export interface WorkspacePhoneDetail extends ElevenLabsPhoneEntry {
  provider: PhoneTelephonyProvider;
  supportsOutbound: boolean;
}

type RawPhoneListItem = {
  phoneNumber: string;
  phoneNumberId: string;
  provider?: PhoneTelephonyProvider;
  supportsOutbound?: boolean;
  outboundTrunk?: unknown;
  assignedAgent?: { agentId?: string };
};

function mapWorkspacePhoneDetail(item: RawPhoneListItem): WorkspacePhoneDetail {
  const provider = item.provider ?? "sip_trunk";
  const supportsOutbound =
    provider === "twilio"
      ? true
      : Boolean(item.supportsOutbound ?? item.outboundTrunk);

  return {
    phoneNumber: normalizePhoneNumber(item.phoneNumber),
    phoneNumberId: item.phoneNumberId,
    assignedAgentId: item.assignedAgent?.agentId,
    provider,
    supportsOutbound,
  };
}

/** Lists all phone numbers in the ElevenLabs workspace. */
export async function listWorkspacePhones(): Promise<ElevenLabsPhoneEntry[]> {
  const details = await listWorkspacePhoneDetails();
  return details.map(({ phoneNumber, phoneNumberId, assignedAgentId }) => ({
    phoneNumber,
    phoneNumberId,
    assignedAgentId,
  }));
}

/** Lists phone numbers including telephony provider and outbound capability. */
export async function listWorkspacePhoneDetails(): Promise<WorkspacePhoneDetail[]> {
  const client = getElevenLabsClient();
  const items = (await client.conversationalAi.phoneNumbers.list()) as RawPhoneListItem[];
  return items.map(mapWorkspacePhoneDetail);
}

/** Loads a single workspace phone number with provider metadata. */
export async function getWorkspacePhoneDetail(
  phoneNumberId: string
): Promise<WorkspacePhoneDetail> {
  const client = getElevenLabsClient();
  const item = (await client.conversationalAi.phoneNumbers.get(
    phoneNumberId
  )) as RawPhoneListItem;
  return mapWorkspacePhoneDetail(item);
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
    label: label ?? `Linker Agent ${agentId.slice(0, 8)}`,
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
  supportsInbound?: boolean;
  supportsOutbound?: boolean;
  assignedAgent?: { agentId?: string };
  outboundTrunk?: unknown;
  inboundTrunk?: unknown;
};

export interface ImportSipTrunkInput extends SipTrunkCreateInput {
  agentId: string;
}

/**
 * Imports the SIP number into ElevenLabs, validates agent/bot compatibility,
 * and only returns success when ElevenLabs accepts the number for telephony agents.
 */
export async function importAndValidateSipTrunkForAgent(
  input: ImportSipTrunkInput
): Promise<
  | { ok: true; phoneNumberId: string; phoneNumber: string }
  | { ok: false; error: string }
> {
  const normalized = normalizePhoneNumber(input.phoneNumber);
  const outboundConfigured = Boolean(input.outboundAddress?.trim());
  let phoneNumberId: string | undefined;
  let createdInElevenLabs = false;

  try {
    const workspace = await listWorkspacePhoneDetails();
    const existing = workspace.find((entry) => entry.phoneNumber === normalized);

    if (existing) {
      if (existing.provider !== "sip_trunk") {
        return {
          ok: false,
          error:
            "Diese Nummer ist in ElevenLabs bereits mit einem anderen Anbietertyp registriert und kann nicht als SIP Trunk genutzt werden.",
        };
      }
      phoneNumberId = existing.phoneNumberId;
    } else {
      const created = await createSipTrunkPhoneNumber(input);
      phoneNumberId = created.phoneNumberId;
      createdInElevenLabs = true;
    }

    const botReady = await validateSipTrunkForBotCalls({
      phoneNumberId,
      expectedNumber: normalized,
      agentId: input.agentId,
      outboundConfigured,
    });

    if (!botReady.ok) {
      if (createdInElevenLabs) {
        await deletePhoneNumberFromElevenLabs(phoneNumberId).catch((err) =>
          console.warn("[elevenlabs/phone] cleanup after SIP rejection:", err)
        );
      }
      return { ok: false, error: botReady.error };
    }

    return { ok: true, phoneNumberId, phoneNumber: normalized };
  } catch (err) {
    if (createdInElevenLabs && phoneNumberId) {
      await deletePhoneNumberFromElevenLabs(phoneNumberId).catch((cleanupErr) =>
        console.warn("[elevenlabs/phone] cleanup after SIP import error:", cleanupErr)
      );
    }
    const { message } = describeElevenLabsError(err);
    return {
      ok: false,
      error: message || SIP_INCOMPATIBLE_MESSAGE,
    };
  }
}

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
    return { ok: false, error: basic.error };
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

  if (detail.supportsInbound === false) {
    return {
      ok: false,
      error:
        "ElevenLabs akzeptiert diese Nummer nicht für eingehende Telefonagent-Anrufe.",
    };
  }

  try {
    await assignAgentToPhoneNumber(
      options.phoneNumberId,
      options.agentId,
      "Linker SIP Validierung"
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

/** Parses LINKER_NUMBER_POOL (comma-separated E.164) with legacy env fallbacks. */
export function configuredPoolNumbers(): string[] {
  const raw = (
    process.env.LINKER_NUMBER_POOL ??
    process.env.CURA_NUMBER_POOL
  )?.trim();
  const fromPool = raw
    ? raw.split(/[,;\n]+/).map((s) => normalizePhoneNumber(s.trim())).filter(Boolean)
    : [];
  const legacy = (
    process.env.LINKER_FORWARDING_NUMBER ??
    process.env.CURA_FORWARDING_NUMBER
  )?.trim();
  const fromLegacy = legacy ? [normalizePhoneNumber(legacy)] : [];
  return Array.from(new Set([...fromPool, ...fromLegacy]));
}
