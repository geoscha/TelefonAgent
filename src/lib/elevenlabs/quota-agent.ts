import "server-only";

import { hasApiKey, getElevenLabsClient } from "@/lib/elevenlabs/client";
import { buildSystemPrompt } from "@/lib/elevenlabs/prompt";
import {
  type AgentUpsertInput,
  linkUserPhoneToAgent,
  upsertAgentForUser,
} from "@/lib/elevenlabs/sync-agent";
import type { StoredAgent } from "@/lib/onboarding-types";
import type { ElevenLabsSettings } from "@/lib/store";
import { snapshotCallStatsForUser } from "@/lib/calls/stats";
import {
  getSettingsForUser,
  updateSettingsForUser,
} from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";

function buildSnapshot(settings: ElevenLabsSettings): StoredAgent | null {
  if (!settings.voiceId?.trim() || !settings.greeting?.trim()) return null;

  const name = settings.agentName?.trim() || "Linker Telefonagent";
  return {
    id: settings.agentId ?? `archived-${Date.now()}`,
    name,
    voiceId: settings.voiceId,
    voiceName: settings.voiceName,
    language: settings.language ?? "de",
    greeting: settings.greeting,
    systemPrompt:
      settings.systemPrompt?.trim() || buildSystemPrompt(name),
  };
}

function pickRestoreInput(settings: ElevenLabsSettings): AgentUpsertInput | null {
  const fromFlat = buildSnapshot(settings);
  if (fromFlat) {
    return {
      name: fromFlat.name,
      voiceId: fromFlat.voiceId,
      voiceName: fromFlat.voiceName,
      language: fromFlat.language,
      greeting: fromFlat.greeting,
      systemPrompt: fromFlat.systemPrompt,
    };
  }

  const agents = settings.agents ?? [];
  for (let i = agents.length - 1; i >= 0; i--) {
    const a = agents[i];
    if (!a.voiceId?.trim() || !a.greeting?.trim()) continue;
    return {
      name: a.name,
      voiceId: a.voiceId,
      voiceName: a.voiceName,
      language: a.language,
      greeting: a.greeting,
      systemPrompt: a.systemPrompt,
    };
  }

  return null;
}

async function removeLiveElevenLabsAgent(
  settings: ElevenLabsSettings
): Promise<void> {
  if (!hasApiKey()) return;

  const client = getElevenLabsClient();
  const agentIds: string[] = [];
  if (settings.agentId) agentIds.push(settings.agentId);

  if (settings.elevenLabsPhoneNumberId) {
    try {
      await client.conversationalAi.phoneNumbers.update(
        settings.elevenLabsPhoneNumberId,
        { agentId: undefined }
      );
    } catch (err) {
      console.warn("[quota-agent] phone unlink failed:", err);
    }
  }

  for (const agentId of agentIds) {
    try {
      await client.conversationalAi.agents.delete(agentId);
    } catch (err) {
      console.warn(`[quota-agent] agent delete ${agentId}:`, err);
    }
  }
}

/** Deletes the live ElevenLabs agent but keeps settings for later restore. */
export async function suspendAgentForQuota(userId: string): Promise<boolean> {
  const settings = await getSettingsForUser(userId);
  if (settings.agentSuspendedAt && !settings.agentId) return false;
  if (!settings.agentId) return false;

  const snapshot = buildSnapshot(settings);
  const agents = [...(settings.agents ?? [])];
  if (snapshot) {
    const idx = agents.findIndex((a) => a.id === snapshot.id);
    if (idx >= 0) agents[idx] = snapshot;
    else agents.push(snapshot);
  }

  await removeLiveElevenLabsAgent(settings);
  await snapshotCallStatsForUser(userId);

  const row: Record<string, unknown> = {
    agent_id: null,
    agents,
    agent_suspended_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const admin = createAdminClient();
  await admin.from("app_settings").update(row).eq("user_id", userId);

  return true;
}

/** Recreates the ElevenLabs agent from archived settings after Pro upgrade. */
export async function restoreAgentAfterUpgrade(userId: string): Promise<boolean> {
  const settings = await getSettingsForUser(userId);
  if (settings.agentId) {
    if (settings.linkerForwardingNumber) {
      try {
        await linkUserPhoneToAgent(userId);
      } catch (err) {
        console.warn("[quota-agent] phone relink failed:", err);
      }
    }
    if (settings.agentSuspendedAt) {
      await createAdminClient()
        .from("app_settings")
        .update({
          agent_suspended_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
    }
    return false;
  }

  const input = pickRestoreInput(settings);
  if (!input) return false;

  const { agentId } = await upsertAgentForUser(userId, input);

  const stored: StoredAgent = {
    id: agentId,
    name: input.name,
    voiceId: input.voiceId,
    voiceName: input.voiceName,
    language: input.language ?? "de",
    greeting: input.greeting,
    systemPrompt: input.systemPrompt ?? buildSystemPrompt(input.name),
  };
  const agents = [
    ...(settings.agents ?? []).filter((a) => a.id !== stored.id),
    stored,
  ];

  await updateSettingsForUser(userId, { agents });

  await createAdminClient()
    .from("app_settings")
    .update({
      agent_suspended_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  const refreshed = await getSettingsForUser(userId);
  if (refreshed.linkerForwardingNumber) {
    await linkUserPhoneToAgent(userId);
  }

  return true;
}
