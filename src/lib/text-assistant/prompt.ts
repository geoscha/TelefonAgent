import "server-only";

import {
  applyLanguageInstructions,
  CHAT_INSTRUCTION_BLOCK,
  normalizeAgentLanguage,
} from "@/lib/elevenlabs/agent-config";
import { buildLiveAgentSystemPrompt } from "@/lib/elevenlabs/agent-sync";
import { getGovernancePromptBlock } from "@/lib/governance/runtime";
import {
  getWebsiteIntegration,
  getWebsiteIntegrationForUser,
} from "@/lib/integrations/website/store";
import { getCraftsmenKnowledgeForUser } from "@/lib/customers/craftsmen-kb";
import type { StoredAgent } from "@/lib/onboarding-types";
import { isWorkflowEngineEnabledForUser } from "@/lib/workflow-engine/flags";
import { buildUnifiedAgentPrompt } from "@/lib/workflow-engine/prompt-builder";
import { resolveWorkflowSession } from "@/lib/workflow-engine/session";
import type { TextChannelKind } from "@/lib/text-assistant/prompt-types";

export type { TextChannelKind } from "@/lib/text-assistant/prompt-types";

const TEXT_CHANNEL_BLOCK = `# Kanal (schriftlich)
- Du antwortest per **E-Mail, WhatsApp oder Chat** — nicht am Telefon.
- Schreibe vollständige, klare Sätze. Keine abgebrochenen Antworten.
- Verwende bei E-Mails eine kurze Anrede und einen höflichen Abschluss.
- Bei WhatsApp darfst du etwas knapper formulieren, aber immer professionell (Sie-Form).
- Du hast dieselben Informationen, Termin-Tools und Regeln wie der Telefon-Assistent.`;

function buildDateContextBlock(): string {
  const now = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  return `# Kontext
- Aktuelles Datum und Uhrzeit (Europe/Zurich): ${now}.
- Leite das laufende Jahr **immer** aus diesem Datum ab — nenne von dir aus nie ein anderes Jahr.
- Ein genanntes Datum (z. B. «23. Juni») meint die **nächste passende Zukunft**, ausser es liegt eindeutig in der Vergangenheit.
- «heute», «morgen», «übermorgen», «nächste Woche Montag» usw. auf Basis des heutigen Datums in ein konkretes Kalenderdatum (YYYY-MM-DD) umrechnen.`;
}

function buildCraftsmenKnowledgeBlock(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;

  return `# Wissensdatenbank (Handwerker-Stamm)
- Nutze diese Handwerkerliste bei Schadensmeldungen und wenn E-Mails an relevante Gewerke formuliert werden sollen.
- Wähle passende Handwerker nach Gewerk und Kontaktdaten.

${text.trim()}`;
}

function buildWebsiteKnowledgeBlock(
  integration: Awaited<ReturnType<typeof getWebsiteIntegration>>
): string | null {
  if (!integration?.connected || !integration.knowledgeText?.trim()) {
    return null;
  }

  return `# Wissensdatenbank (Betreiber-Website)
- Nutze die folgenden Fakten für Auskünfte zur Verwaltung und deren Website.
- Wenn etwas nicht in dieser Wissensdatenbank steht: ehrlich sagen und Rückruf/Nachricht anbieten.

${integration.knowledgeText.trim()}`;
}

/** Legacy path — kept for callers that pass governance block directly. */
export function buildTextAssistantSystemPrompt(
  agent: StoredAgent,
  channel?: TextChannelKind,
  governanceBlock?: string,
  websiteKnowledgeBlock?: string | null,
  craftsmenKnowledgeBlock?: string | null
): string {
  const channelNote =
    channel === "email"
      ? "\n- Aktueller Kanal: **E-Mail**."
      : channel === "whatsapp"
        ? "\n- Aktueller Kanal: **WhatsApp**."
        : channel === "sms"
          ? "\n- Aktueller Kanal: **SMS**."
          : "";

  const base = [
    buildLiveAgentSystemPrompt(agent, undefined, governanceBlock),
    websiteKnowledgeBlock,
    craftsmenKnowledgeBlock,
    buildDateContextBlock(),
    TEXT_CHANNEL_BLOCK + channelNote,
    CHAT_INSTRUCTION_BLOCK,
  ]
    .filter(Boolean)
    .join("\n\n");

  return applyLanguageInstructions(base, normalizeAgentLanguage(agent.language));
}

export async function buildTextAssistantSystemPromptAsync(
  agent: StoredAgent,
  channel?: TextChannelKind,
  userId?: string,
  options?: {
    userMessage?: string;
    sourceRef?: string;
    category?: import("@/lib/messages/inquiry-types").MessageInquiryCategory | null;
    llmSlug?: string | null;
  }
): Promise<string> {
  const websiteIntegration = userId
    ? await getWebsiteIntegrationForUser(userId)
    : await getWebsiteIntegration().catch(() => null);
  const craftsmenKnowledge = userId
    ? await getCraftsmenKnowledgeForUser(userId)
    : { text: null, docId: null, docName: null };
  const websiteKnowledgeBlock = buildWebsiteKnowledgeBlock(websiteIntegration);
  const craftsmenKnowledgeBlock = buildCraftsmenKnowledgeBlock(
    craftsmenKnowledge.text
  );

  const engineEnabled = userId
    ? await isWorkflowEngineEnabledForUser(userId)
    : false;

  if (engineEnabled && options?.userMessage?.trim()) {
    const session = await resolveWorkflowSession({
      userId,
      channel: "message",
      text: options.userMessage,
      sourceRef: options.sourceRef,
      agentId: agent.id,
      category: options.category,
      llmSlug: options.llmSlug,
    });

    if (session.engineEnabled && session.definition) {
      return buildUnifiedAgentPrompt({
        agent,
        channel: "message",
        userId,
        activeWorkflow: session.definition,
        execution: session.execution ?? undefined,
        websiteKnowledgeBlock,
        craftsmenKnowledgeBlock,
        compiledWorkflowBlock: session.compiledMessageBlock,
      });
    }
  }

  const governanceBlock = await getGovernancePromptBlock("message", userId);
  return buildTextAssistantSystemPrompt(
    agent,
    channel,
    governanceBlock,
    websiteKnowledgeBlock,
    craftsmenKnowledgeBlock
  );
}
