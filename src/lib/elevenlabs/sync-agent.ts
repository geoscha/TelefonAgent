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
      tags: ["cura"],
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
    const agentName = settings.agentName?.trim() || "Cura Telefonagent";
    settings = await updateSettingsForUser(userId, {
      agentName,
      greeting: defaultGreeting(agentName),
      systemPrompt: buildSystemPrompt(agentName),
    });
  }

  const agentName = settings.agentName?.trim() || "Cura Telefonagent";
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
 * Ensures the user's ElevenLabs phone number points at their Cura agent.
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

  let phoneNumberId = settings.elevenLabsPhoneNumberId;
  let phoneNumber = settings.curaForwardingNumber;

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
      "ElevenLabs-Telefonnummer nicht gefunden. Bitte CURA_NUMBER_POOL und Migration 0002 prüfen."
    );
  }

  const before = workspace.find((w) => w.phoneNumberId === phoneNumberId);
  const previousAgentId = before?.assignedAgentId;

  if (
    phoneNumberId !== settings.elevenLabsPhoneNumberId ||
    phoneNumber !== settings.curaForwardingNumber
  ) {
    await updateSettingsForUser(userId, {
      elevenLabsPhoneNumberId: phoneNumberId,
      curaForwardingNumber: phoneNumber,
    });
  }

  await assignAgentToPhoneNumber(
    phoneNumberId,
    settings.agentId,
    settings.agentName ?? "Cura Telefonagent"
  );

  const afterList = await listWorkspacePhones();
  const after = afterList.find((w) => w.phoneNumberId === phoneNumberId);
  if (after?.assignedAgentId !== settings.agentId) {
    throw new Error(
      `Telefonnummer konnte nicht auf «${settings.agentName ?? "Cura Telefonagent"}» umgestellt werden.`
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

/** Links the user's assigned phone number to their agent in ElevenLabs. */
export async function linkUserPhoneToAgent(userId: string): Promise<void> {
  await reconcileUserPhoneAgentLink(userId);
}

export { describeElevenLabsError };
