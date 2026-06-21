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
import type { CustomerRecord } from "@/lib/customers/types";
import type { PropertySoftwareConnection } from "@/lib/integrations/property-software/store";
import { upsertPropertySoftwareConnection } from "@/lib/integrations/property-software/store";
import type { StoredAgent } from "@/lib/onboarding-types";
import { getSettingsForUser } from "@/lib/store";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireUserId } from "@/lib/supabase/server";

const CRAFTSMEN_DOC_PREFIX = "Handwerker-Stamm";

export function buildCraftsmenKnowledgeText(
  records: CustomerRecord[]
): string | null {
  if (records.length === 0) return null;

  const lines = records.map((record) => {
    const parts = [record.name];
    if (record.trade) parts.push(`Gewerk: ${record.trade}`);
    if (record.phone) parts.push(`Tel: ${record.phone}`);
    if (record.email) parts.push(`E-Mail: ${record.email}`);
    if (record.address) parts.push(`Adresse: ${record.address}`);
    if (record.propertyLabel && !record.trade) {
      parts.push(`Bereich: ${record.propertyLabel}`);
    }
    return `- ${parts.join(" · ")}`;
  });

  return [
    "Handwerker und Dienstleister der Liegenschaftsverwaltung.",
    "Nutze diese Liste bei Schadensmeldungen, um passende Gewerke zu finden und E-Mails an relevante Handwerker zu formulieren.",
    "",
    ...lines,
  ].join("\n");
}

function siteUrlFromEnv(): string | undefined {
  return process.env.SITE_URL?.replace(/\/$/, "");
}

async function resyncUserAgentsAfterCraftsmenChange(
  userId: string,
  agents: StoredAgent[]
): Promise<void> {
  const client = getElevenLabsClient();
  const siteUrl = siteUrlFromEnv();

  for (const agent of agents.filter((entry) => Boolean(entry.id?.trim()))) {
    try {
      const escalationContext = await loadAgentEscalationContext(agent.id, userId);
      await syncAgentConversationConfig(client, agent, {
        siteUrl,
        escalationContext,
        userId,
      });
    } catch (error) {
      console.warn("[craftsmen-kb] agent resync failed", {
        userId,
        agentId: agent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function syncCraftsmenKnowledgeBase(input: {
  provider: CustomerRecord["provider"];
  records: CustomerRecord[];
  connection: PropertySoftwareConnection;
}): Promise<void> {
  const userId = await requireUserId();
  const text = buildCraftsmenKnowledgeText(input.records);
  const docName = CRAFTSMEN_DOC_PREFIX;
  const previousDocId = input.connection.craftsmenElevenLabsDocId ?? undefined;

  if (!text?.trim()) {
    if (previousDocId) {
      await deleteElevenLabsDocument(previousDocId);
    }
    await upsertPropertySoftwareConnection(input.provider, {
      craftsmenKbText: null,
      craftsmenElevenLabsDocId: null,
      craftsmenElevenLabsDocName: null,
    });
    return;
  }

  const doc = await upsertElevenLabsTextDocument({
    docId: previousDocId,
    name: docName,
    text,
  });

  await upsertPropertySoftwareConnection(input.provider, {
    craftsmenKbText: text,
    craftsmenElevenLabsDocId: doc.id,
    craftsmenElevenLabsDocName: doc.name,
  });

  const settings = await getSettingsForUser(userId);
  const agents = settings.agents ?? [];
  if (agents.length > 0) {
    await resyncUserAgentsAfterCraftsmenChange(userId, agents);
  }
}

export async function getCraftsmenKnowledgeForUser(userId: string): Promise<{
  text: string | null;
  docId: string | null;
  docName: string | null;
}> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("property_software_connections")
    .select(
      "craftsmen_kb_text, craftsmen_elevenlabs_doc_id, craftsmen_elevenlabs_doc_name"
    )
    .eq("user_id", userId)
    .not("craftsmen_kb_text", "is", null);

  if (error) throw error;

  const row = (data ?? []).find((entry) =>
    typeof entry.craftsmen_kb_text === "string" && entry.craftsmen_kb_text.trim()
  );
  if (!row?.craftsmen_kb_text?.trim()) {
    return { text: null, docId: null, docName: null };
  }

  return {
    text: row.craftsmen_kb_text,
    docId: row.craftsmen_elevenlabs_doc_id ?? null,
    docName: row.craftsmen_elevenlabs_doc_name ?? CRAFTSMEN_DOC_PREFIX,
  };
}
