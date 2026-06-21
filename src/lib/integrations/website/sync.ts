import "server-only";

import {
  deleteElevenLabsDocument,
  upsertElevenLabsTextDocument,
} from "@/lib/elevenlabs/knowledge-base";
import {
  loadAgentEscalationContext,
  syncAgentConversationConfig,
} from "@/lib/elevenlabs/agent-sync";
import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import { extractWebsiteKnowledge } from "@/lib/integrations/website/extract-knowledge";
import {
  scrapeOperatorWebsite,
  validateWebsiteUrl,
} from "@/lib/integrations/website/scrape";
import {
  getWebsiteIntegration,
  upsertWebsiteIntegration,
  type WebsiteIntegration,
} from "@/lib/integrations/website/store";
import type { StoredAgent } from "@/lib/onboarding-types";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

function siteUrlFromEnv(): string | undefined {
  return process.env.SITE_URL?.replace(/\/$/, "");
}

export async function resyncUserAgentsAfterWebsiteChange(
  userId: string,
  agents: StoredAgent[]
): Promise<void> {
  const client = getElevenLabsClient();
  const siteUrl = siteUrlFromEnv();
  const targets = agents.filter((agent) => Boolean(agent.id?.trim()));

  for (const agent of targets) {
    try {
      const escalationContext = await loadAgentEscalationContext(agent.id, userId);
      await syncAgentConversationConfig(client, agent, {
        siteUrl,
        escalationContext,
        userId,
      });
    } catch (error) {
      console.warn("[website/sync] agent resync failed", {
        userId,
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function syncWebsiteIntegration(input: {
  url: string;
  previous?: WebsiteIntegration | null;
}): Promise<WebsiteIntegration> {
  const validated = validateWebsiteUrl(input.url);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  await upsertWebsiteIntegration({
    connected: true,
    url: validated.url,
    accountLabel: validated.hostname,
    syncStatus: "pending",
    syncError: undefined,
    connectedAt: input.previous?.connectedAt ?? new Date().toISOString(),
  });

  try {
    const scraped = await scrapeOperatorWebsite(validated.url);
    const knowledgeText = await extractWebsiteKnowledge(scraped);
    const docName = `Betreiber-Website (${scraped.hostname})`;

    const previousDocId =
      input.previous?.url === validated.url
        ? input.previous.elevenLabsDocId
        : undefined;

    if (
      input.previous?.elevenLabsDocId &&
      input.previous.url !== validated.url
    ) {
      await deleteElevenLabsDocument(input.previous.elevenLabsDocId);
    }

    const doc = await upsertElevenLabsTextDocument({
      docId: previousDocId,
      name: docName,
      text: knowledgeText,
    });

    const saved = await upsertWebsiteIntegration({
      connected: true,
      url: validated.url,
      accountLabel: scraped.hostname,
      knowledgeText,
      elevenLabsDocId: doc.id,
      elevenLabsDocName: doc.name,
      pagesScraped: scraped.pages.length,
      lastSyncedAt: new Date().toISOString(),
      syncStatus: "ok",
      syncError: undefined,
    });

    const settings = await getSettings();
    const agents = settings.agents ?? [];
    const userId = await requireUserId();
    await resyncUserAgentsAfterWebsiteChange(userId, agents);

    return saved;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Synchronisation fehlgeschlagen.";

    await upsertWebsiteIntegration({
      connected: true,
      url: validated.url,
      accountLabel: validated.hostname,
      syncStatus: "error",
      syncError: message,
    });

    throw new Error(message);
  }
}

export async function connectWebsiteIntegration(url: string): Promise<WebsiteIntegration> {
  const previous = await getWebsiteIntegration();
  return syncWebsiteIntegration({ url, previous });
}

export async function refreshWebsiteIntegration(): Promise<WebsiteIntegration> {
  const current = await getWebsiteIntegration();
  if (!current?.connected || !current.url) {
    throw new Error("Keine Website verbunden.");
  }
  return syncWebsiteIntegration({ url: current.url, previous: current });
}

export async function disconnectWebsiteIntegration(): Promise<void> {
  const current = await getWebsiteIntegration();
  if (current?.elevenLabsDocId) {
    await deleteElevenLabsDocument(current.elevenLabsDocId);
  }

  const { clearWebsiteIntegration } = await import(
    "@/lib/integrations/website/store"
  );
  await clearWebsiteIntegration();

  const settings = await getSettings();
  const agents = settings.agents ?? [];
  const userId = await requireUserId();
  await resyncUserAgentsAfterWebsiteChange(userId, agents);
}
