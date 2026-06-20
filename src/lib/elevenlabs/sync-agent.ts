import "server-only";

import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";
import {
  buildAppointmentBlock,
  buildSystemPrompt,
} from "@/lib/elevenlabs/prompt";
import {
  buildConversationConfig,
  normalizeAgentLanguage,
} from "@/lib/elevenlabs/agent-config";
import {
  defaultGreeting,
  isLegacyAgentConfig,
} from "@/lib/elevenlabs/defaults";
import { assignAgentToPhoneNumber, listWorkspacePhones, normalizePhoneNumber } from "@/lib/elevenlabs/phone";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import type { ElevenLabsSettings } from "@/lib/store";
import { getSettingsForUser, updateSettingsForUser } from "@/lib/store";
import { getAssignedPoolNumber, syncNumberPoolFromEnv } from "@/lib/store/number-pool";

export interface AgentUpsertInput {
  name: string;
  voiceId: string;
  voiceName?: string;
  language?: string;
  greeting: string;
  systemPrompt?: string;
}

/** Creates or updates the user's ElevenLabs agent and persists settings. */
export async function upsertAgentForUser(
  userId: string,
  input: AgentUpsertInput
): Promise<{ agentId: string; settings: ElevenLabsSettings }> {
  const client = getElevenLabsClient();
  const settings = await getSettingsForUser(userId);
  const language = normalizeAgentLanguage(input.language);
  const systemPrompt =
    input.systemPrompt?.trim() || buildSystemPrompt(input.name);

  const effectivePrompt = settings.appointmentBookingEnabled
    ? systemPrompt + buildAppointmentBlock()
    : systemPrompt;

  const conversationConfig = buildConversationConfig({
    greeting: input.greeting,
    language,
    systemPrompt: effectivePrompt,
    voiceId: input.voiceId,
  });

  let agentId = settings.agentId;

  if (agentId) {
    await client.conversationalAi.agents.update(agentId, {
      name: input.name,
      conversationConfig,
    } as Parameters<typeof client.conversationalAi.agents.update>[1]);
  } else {
    const created = (await client.conversationalAi.agents.create({
      name: input.name,
      conversationConfig,
      tags: ["linker"],
    } as Parameters<typeof client.conversationalAi.agents.create>[0])) as {
      agentId: string;
    };
    agentId = created.agentId;
  }

  const updated = await updateSettingsForUser(userId, {
    agentId,
    agentName: input.name,
    voiceId: input.voiceId,
    voiceName: input.voiceName,
    language,
    greeting: input.greeting,
    systemPrompt,
    lastSync: new Date().toISOString(),
  });

  return { agentId, settings: updated };
}

/** Syncs DB agent settings to ElevenLabs without overwriting user-edited content. */
export async function ensureAgentConfigForUser(userId: string): Promise<void> {
  let settings = await getSettingsForUser(userId);
  if (!settings.agentId) return;

  // One-time cleanup of the old Boris/Ćevapi demo agent only.
  if (isLegacyAgentConfig(settings)) {
    const agentName = settings.agentName?.trim() || "Linker Telefonagent";
    settings = await updateSettingsForUser(userId, {
      agentName,
      greeting: defaultGreeting(agentName),
      systemPrompt: buildSystemPrompt(agentName),
    });
  }

  const agentName = settings.agentName?.trim() || "Linker Telefonagent";
  const patch: Partial<typeof settings> = {};
  if (!settings.greeting?.trim()) patch.greeting = defaultGreeting(agentName);
  if (!settings.systemPrompt?.trim()) {
    patch.systemPrompt = buildSystemPrompt(agentName);
  }
  if (!settings.agentName?.trim()) patch.agentName = agentName;
  if (Object.keys(patch).length > 0) {
    settings = await updateSettingsForUser(userId, patch);
  }

  if (!settings.voiceId?.trim()) return;

  await upsertAgentForUser(userId, {
    name: settings.agentName ?? agentName,
    voiceId: settings.voiceId,
    voiceName: settings.voiceName,
    language: normalizeAgentLanguage(settings.language),
    greeting: settings.greeting!,
    systemPrompt: settings.systemPrompt!,
  });
}

export interface PhoneAgentLinkResult {
  linked: boolean;
  phoneNumber?: string;
  phoneNumberId?: string;
  agentId?: string;
  agentName?: string;
  previousAgentId?: string;
}

/**
 * Ensures the user's ElevenLabs phone number points at their Linker agent.
 * Resolves stale/missing phone IDs and verifies the assignment after PATCH.
 */
export async function reconcileUserPhoneAgentLink(
  userId: string
): Promise<PhoneAgentLinkResult> {
  await ensureAgentConfigForUser(userId);

  const settings = await getSettingsForUser(userId);
  if (!settings.agentId) return { linked: false };

  await syncNumberPoolFromEnv();
  const workspace = await listWorkspacePhones();
  const userPhones = await listUserPhoneNumbers(userId);
  const primaryPhone =
    userPhones.find((p) => p.isPrimary) ??
    userPhones.find((p) => p.validationStatus === "valid") ??
    userPhones[0];

  let phoneNumberId =
    primaryPhone?.elevenLabsPhoneNumberId ?? settings.elevenLabsPhoneNumberId;
  let phoneNumber = primaryPhone?.phoneNumber ?? settings.linkerForwardingNumber;

  if (!phoneNumberId) {
    const pool = await getAssignedPoolNumber(userId);
    if (pool) {
      phoneNumberId = pool.elevenLabsPhoneNumberId;
      phoneNumber = pool.phoneNumber;
    }
  }

  if (!phoneNumberId && phoneNumber) {
    const match = workspace.find(
      (w) => w.phoneNumber === normalizePhoneNumber(phoneNumber!)
    );
    if (match) {
      phoneNumberId = match.phoneNumberId;
      phoneNumber = match.phoneNumber;
    }
  }

  if (!phoneNumberId) {
    throw new Error(
      "ElevenLabs-Telefonnummer nicht gefunden. Bitte LINKER_NUMBER_POOL und Migration 0002 prüfen."
    );
  }

  const before = workspace.find((w) => w.phoneNumberId === phoneNumberId);
  const previousAgentId = before?.assignedAgentId;

  if (
    phoneNumberId !== settings.elevenLabsPhoneNumberId ||
    phoneNumber !== settings.linkerForwardingNumber
  ) {
    await updateSettingsForUser(userId, {
      elevenLabsPhoneNumberId: phoneNumberId,
      linkerForwardingNumber: phoneNumber,
    });
  }

  await assignAgentToPhoneNumber(
    phoneNumberId,
    settings.agentId,
    settings.agentName ?? "Linker Telefonagent"
  );

  for (const extra of userPhones) {
    if (
      extra.elevenLabsPhoneNumberId &&
      extra.elevenLabsPhoneNumberId !== phoneNumberId &&
      extra.validationStatus === "valid"
    ) {
      await assignAgentToPhoneNumber(
        extra.elevenLabsPhoneNumberId,
        settings.agentId,
        settings.agentName ?? "Linker Telefonagent"
      );
    }
  }

  const afterList = await listWorkspacePhones();
  const after = afterList.find((w) => w.phoneNumberId === phoneNumberId);
  if (after?.assignedAgentId !== settings.agentId) {
    throw new Error(
      `Telefonnummer konnte nicht auf «${settings.agentName ?? "Linker Telefonagent"}» umgestellt werden.`
    );
  }

  return {
    linked: true,
    phoneNumber,
    phoneNumberId,
    agentId: settings.agentId,
    agentName: settings.agentName,
    previousAgentId,
  };
}

/** Links a specific agent to their assigned user phone number in ElevenLabs. */
export async function linkAgentToPhone(
  userId: string,
  agentId: string,
  userPhoneRecordId?: string
): Promise<void> {
  const phones = await listUserPhoneNumbers(userId);
  if (phones.length === 0) return;

  const phone = userPhoneRecordId
    ? phones.find((p) => p.id === userPhoneRecordId)
    : undefined;

  if (!phone?.elevenLabsPhoneNumberId) return;

  const settings = await getSettingsForUser(userId);
  await assignAgentToPhoneNumber(
    phone.elevenLabsPhoneNumberId,
    agentId,
    settings.agentName ?? "Linker Telefonagent"
  );
}

/** Unlinks a user phone record from any ElevenLabs agent. */
export async function unlinkPhoneRecordFromElevenLabs(
  userId: string,
  userPhoneRecordId: string
): Promise<void> {
  const phones = await listUserPhoneNumbers(userId);
  const phone = phones.find((p) => p.id === userPhoneRecordId);
  if (!phone?.elevenLabsPhoneNumberId) return;

  const { hasApiKey, getElevenLabsClient } = await import("@/lib/elevenlabs/client");
  if (!hasApiKey()) return;

  const client = getElevenLabsClient();
  await client.conversationalAi.phoneNumbers.update(phone.elevenLabsPhoneNumberId, {
    agentId: undefined,
  });
}

/** Links the user's assigned phone number to their agent in ElevenLabs. */
export async function linkUserPhoneToAgent(userId: string): Promise<void> {
  const settings = await getSettingsForUser(userId);
  if (!settings.agentId) return;
  await reconcileUserPhoneAgentLink(userId);
}

/** Unlinks all of a user's ElevenLabs phone numbers from any agent. */
export async function unlinkUserPhonesFromAgent(userId: string): Promise<void> {
  const { hasApiKey, getElevenLabsClient } = await import("@/lib/elevenlabs/client");
  if (!hasApiKey()) return;

  const client = getElevenLabsClient();
  const phones = await listUserPhoneNumbers(userId);
  const settings = await getSettingsForUser(userId);
  const ids = new Set<string>();

  for (const phone of phones) {
    if (phone.elevenLabsPhoneNumberId) {
      ids.add(phone.elevenLabsPhoneNumberId);
    }
  }
  if (settings.elevenLabsPhoneNumberId) {
    ids.add(settings.elevenLabsPhoneNumberId);
  }

  for (const phoneNumberId of Array.from(ids)) {
    try {
      await client.conversationalAi.phoneNumbers.update(phoneNumberId, {
        agentId: undefined,
      });
    } catch (err) {
      console.warn(`[sync-agent] unlink ${phoneNumberId}:`, err);
    }
  }
}

export { describeElevenLabsError };
