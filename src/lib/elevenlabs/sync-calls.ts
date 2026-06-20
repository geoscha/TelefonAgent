import "server-only";

import {
  ConversationsListRequestExcludeStatusesItem,
} from "@elevenlabs/elevenlabs-js/api/resources/conversationalAi/resources/conversations/types/ConversationsListRequestExcludeStatusesItem";

import { buildCallFromConversation } from "@/lib/calls/build-call";
import { reconcileCallTokenCharges } from "@/lib/billing/call-charges";
import { chargeCallTokens } from "@/lib/billing/tokens";
import { hasApiKey, getElevenLabsClient } from "@/lib/elevenlabs/client";
import {
  addCallForUser,
  getCallsForUser,
  getSettingsForUser,
  type ElevenLabsSettings,
} from "@/lib/store";

function collectAgentIds(settings: ElevenLabsSettings): string[] {
  const ids = new Set<string>();
  if (settings.agentId) ids.add(settings.agentId);
  for (const agent of settings.agents ?? []) {
    if (agent.id) ids.add(agent.id);
  }
  return Array.from(ids);
}

/** Pulls missing conversations from ElevenLabs into Supabase for one user. */
export async function syncCallsForUser(userId: string): Promise<number> {
  if (!hasApiKey()) return 0;

  const settings = await getSettingsForUser(userId);
  const agentIds = collectAgentIds(settings);
  if (agentIds.length === 0) return 0;

  const existing = await getCallsForUser(userId);
  const existingIds = new Set(existing.map((c) => c.id));

  const client = getElevenLabsClient();
  let synced = 0;

  for (const agentId of agentIds) {
    try {
      let cursor: string | undefined;
      let hasMore = true;

      while (hasMore) {
        const page = (await client.conversationalAi.conversations.list({
          agentId,
          pageSize: 100,
          cursor,
          excludeStatuses: [
            ConversationsListRequestExcludeStatusesItem.Initiated,
            ConversationsListRequestExcludeStatusesItem.InProgress,
            ConversationsListRequestExcludeStatusesItem.Processing,
          ],
        })) as {
          conversations?: { conversationId: string }[];
          nextCursor?: string;
          hasMore?: boolean;
        };

        for (const summary of page.conversations ?? []) {
          const id = summary.conversationId;
          if (!id || existingIds.has(id)) continue;

          try {
            const full = await client.conversationalAi.conversations.get(id);
            const call = await buildCallFromConversation(full);
            call.agentId = call.agentId ?? agentId;
            await addCallForUser(userId, call);
            const charge = await chargeCallTokens(userId, call.id, call.durationSeconds);
            if (!charge.ok && !charge.duplicate) {
              console.error("[sync-calls] charge failed:", {
                callId: call.id,
                cost: charge.cost,
                error: charge.error,
              });
            }
            existingIds.add(id);
            synced += 1;
          } catch (err) {
            console.warn(`[sync-calls] skip ${id}:`, err);
          }
        }

        cursor = page.nextCursor;
        hasMore = Boolean(page.hasMore && page.nextCursor);
        if (!page.conversations?.length) break;
      }
    } catch (err) {
      console.warn(`[sync-calls] agent ${agentId}:`, err);
    }
  }

  const allCalls = await getCallsForUser(userId);
  const reconciled = await reconcileCallTokenCharges(userId, allCalls);
  if (reconciled > 0) {
    console.info(`[sync-calls] reconciled ${reconciled} call charge(s) for ${userId}`);
  }

  return synced;
}

export async function syncCallsForCurrentUser(): Promise<number> {
  const { requireUserId } = await import("@/lib/supabase/server");
  const userId = await requireUserId();
  return syncCallsForUser(userId);
}
