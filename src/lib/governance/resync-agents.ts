import "server-only";

import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import {
  loadAgentEscalationContext,
  syncAgentConversationConfig,
} from "@/lib/elevenlabs/agent-sync";
import type { StoredAgent } from "@/lib/onboarding-types";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * After governance publish, push updated prompts to all ElevenLabs voice agents.
 * Runs best-effort; failures are logged but do not block publish.
 */
export async function resyncAllVoiceAgentsAfterGovernancePublish(): Promise<{
  attempted: number;
  synced: number;
  failed: number;
}> {
  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("app_settings")
    .select("user_id, agents, agent_id, system_prompt")
    .not("agents", "is", null);

  if (error) throw error;

  const client = getElevenLabsClient();
  const siteUrl = process.env.SITE_URL?.replace(/\/$/, "");

  let attempted = 0;
  let synced = 0;
  let failed = 0;

  for (const row of rows ?? []) {
    const userId = String(row.user_id);
    const agents = (row.agents as StoredAgent[] | null) ?? [];
    const targets = agents.filter((agent) => Boolean(agent.id?.trim()));

    if (targets.length === 0 && row.agent_id) {
      targets.push({
        id: String(row.agent_id),
        name: "Agent",
        greeting: "",
        systemPrompt: String(row.system_prompt ?? ""),
      } as StoredAgent);
    }

    for (const agent of targets) {
      attempted += 1;
      try {
        const escalationContext = await loadAgentEscalationContext(
          agent.id,
          userId
        );
        await syncAgentConversationConfig(client, agent, {
          siteUrl,
          escalationContext,
          userId,
        });
        synced += 1;
      } catch (syncError) {
        failed += 1;
        console.warn("[governance/resync] agent sync failed", {
          userId,
          agentId: agent.id,
          error:
            syncError instanceof Error
              ? syncError.message
              : String(syncError),
        });
      }
    }
  }

  return { attempted, synced, failed };
}
