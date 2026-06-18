import "server-only";

import { hasApiKey, getElevenLabsClient } from "@/lib/elevenlabs/client";
import type { StoredAgent } from "@/lib/onboarding-types";
import { normalizePhoneNumber } from "@/lib/elevenlabs/phone";
import { createAdminClient } from "@/lib/supabase/admin";

interface UserSettingsSnapshot {
  agentId?: string;
  agents?: StoredAgent[];
  curaForwardingNumber?: string;
  elevenLabsPhoneNumberId?: string;
}

async function loadSettingsSnapshot(
  userId: string
): Promise<UserSettingsSnapshot> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select(
      "agent_id, agents, cura_forwarding_number, elevenlabs_phone_number_id"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return {};

  return {
    agentId: data.agent_id ?? undefined,
    agents: Array.isArray(data.agents) ? (data.agents as StoredAgent[]) : [],
    curaForwardingNumber: data.cura_forwarding_number ?? undefined,
    elevenLabsPhoneNumberId: data.elevenlabs_phone_number_id ?? undefined,
  };
}

/** Removes ElevenLabs agents and releases pool numbers before account deletion. */
export async function teardownUserResources(userId: string): Promise<void> {
  const settings = await loadSettingsSnapshot(userId);
  const admin = createAdminClient();

  const agentIds = new Set<string>();
  if (settings.agentId) agentIds.add(settings.agentId);
  for (const agent of settings.agents ?? []) {
    if (agent.id) agentIds.add(agent.id);
  }

  if (hasApiKey()) {
    try {
      const client = getElevenLabsClient();

      if (settings.elevenLabsPhoneNumberId) {
        try {
          await client.conversationalAi.phoneNumbers.update(
            settings.elevenLabsPhoneNumberId,
            { agentId: undefined }
          );
        } catch (err) {
          console.warn("[teardown] phone unlink failed:", err);
        }
      }

      for (const agentId of Array.from(agentIds)) {
        try {
          await client.conversationalAi.agents.delete(agentId);
        } catch (err) {
          console.warn(`[teardown] agent delete ${agentId}:`, err);
        }
      }
    } catch (err) {
      console.warn("[teardown] ElevenLabs cleanup skipped:", err);
    }
  }

  await admin
    .from("forwarding_number_pool")
    .update({ assigned_user_id: null, assigned_at: null })
    .eq("assigned_user_id", userId);

  if (settings.curaForwardingNumber) {
    await admin
      .from("forwarding_number_pool")
      .update({ assigned_user_id: null, assigned_at: null })
      .eq("phone_number", normalizePhoneNumber(settings.curaForwardingNumber));
  }
}
