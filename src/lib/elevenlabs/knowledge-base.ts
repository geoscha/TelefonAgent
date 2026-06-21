import "server-only";

import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import { normalizeKnowledgeBase } from "@/lib/elevenlabs/agent-config";
import {
  composeKnowledgeReferenceText,
  parseSystemPrompt,
} from "@/lib/elevenlabs/prompt-sections";
import type { WebsiteIntegration } from "@/lib/integrations/website/store";
import type { StoredAgent } from "@/lib/onboarding-types";

type KnowledgeBaseLocator = {
  type: string;
  name: string;
  id: string;
  usageMode?: string;
};

const PROMPT_KB_DOC_NAME = "Assistent FAQ";

export async function upsertElevenLabsTextDocument(input: {
  docId?: string;
  name: string;
  text: string;
}): Promise<{ id: string; name: string }> {
  const client = getElevenLabsClient();

  if (input.docId) {
    try {
      await client.conversationalAi.knowledgeBase.documents.update(input.docId, {
        name: input.name,
        content: input.text,
      });
      return { id: input.docId, name: input.name };
    } catch (error) {
      console.warn("[knowledge-base] update failed, recreating doc", error);
    }
  }

  const created = (await client.conversationalAi.knowledgeBase.documents.createFromText(
    {
      name: input.name,
      text: input.text,
    }
  )) as { id?: string; name?: string };

  const id = created.id;
  const name = created.name ?? input.name;

  if (!id) {
    throw new Error("ElevenLabs Knowledge-Base-Dokument konnte nicht erstellt werden.");
  }

  return { id, name };
}

export async function deleteElevenLabsDocument(docId: string): Promise<void> {
  const client = getElevenLabsClient();
  try {
    await client.conversationalAi.knowledgeBase.documents.delete(docId, {
      force: true,
    });
  } catch (error) {
    console.warn("[knowledge-base] delete failed", { docId, error });
  }
}

export function buildAgentKnowledgeBaseLocators(
  agent: StoredAgent,
  website?: WebsiteIntegration | null,
  promptKbDoc?: { id: string; name: string } | null,
  craftsmenKbDoc?: { id: string; name: string } | null
): KnowledgeBaseLocator[] {
  const locators: KnowledgeBaseLocator[] = [];

  if (website?.connected && website.elevenLabsDocId) {
    locators.push({
      type: "text",
      id: website.elevenLabsDocId,
      name:
        website.elevenLabsDocName ??
        `Betreiber-Website (${website.accountLabel ?? "Website"})`,
    });
  }

  if (craftsmenKbDoc?.id) {
    locators.push({
      type: "text",
      id: craftsmenKbDoc.id,
      name: craftsmenKbDoc.name,
    });
  }

  if (promptKbDoc?.id) {
    locators.push({
      type: "text",
      id: promptKbDoc.id,
      name: promptKbDoc.name,
    });
  }

  return normalizeKnowledgeBase(locators);
}

export function buildPromptKnowledgeText(agent: StoredAgent): string | null {
  return composeKnowledgeReferenceText(parseSystemPrompt(agent.systemPrompt));
}

export async function upsertPromptKnowledgeDocument(
  agent: StoredAgent,
  existingDocId?: string
): Promise<{ id: string; name: string } | null> {
  const text = buildPromptKnowledgeText(agent);
  if (!text?.trim()) {
    if (existingDocId) {
      await deleteElevenLabsDocument(existingDocId);
    }
    return null;
  }

  return upsertElevenLabsTextDocument({
    docId: existingDocId,
    name: `${PROMPT_KB_DOC_NAME} (${agent.name})`,
    text,
  });
}
