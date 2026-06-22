import "server-only";

import { getGovernancePromptBlock } from "@/lib/governance/runtime";
import { buildGovernancePromptBlock } from "@/lib/governance/compiler";
import { getPublishedGovernance } from "@/lib/governance/store";
import {
  applyLanguageInstructions,
  CHAT_INSTRUCTION_BLOCK,
  normalizeAgentLanguage,
} from "@/lib/elevenlabs/agent-config";
import { applyEuCompliancePrompt } from "@/lib/elevenlabs/compliance";
import {
  buildAppointmentBlock,
  buildCustomerAccessBlock,
} from "@/lib/elevenlabs/prompt";
import { normalizeAppointmentConfig } from "@/lib/integrations/appointment-config";
import type { StoredAgent } from "@/lib/onboarding-types";
import { buildExecutionContextBlock } from "@/lib/workflow-engine/executor";
import { isWorkflowEngineEnabledForUser } from "@/lib/workflow-engine/flags";
import type {
  PromptBuildInput,
  WorkflowDefinition,
  WorkflowEngineChannel,
} from "@/lib/workflow-engine/types";

const TEXT_CHANNEL_BLOCK = `# Kanal (schriftlich)
- Du antwortest per **E-Mail, WhatsApp oder Chat** — nicht am Telefon.
- Schreibe vollständige, klare Sätze. Keine abgebrochenen Antworten.
- Verwende bei E-Mails eine kurze Anrede und einen höflichen Abschluss.
- Bei WhatsApp darfst du etwas knapper formulieren, aber immer professionell (Sie-Form).`;

const VOICE_CHANNEL_BLOCK = `# Kanal (Telefon)
- Antworte live, kurz und natürlich (1–3 Sätze pro Turn).
- Eine Frage pro Schritt beim Slot-Filling.
- Nutze get_workflow_context wenn du den aktiven Workflow oder fehlende Felder brauchst.`;

function buildDateContextBlock(): string {
  const now = new Intl.DateTimeFormat("de-CH", {
    timeZone: "Europe/Zurich",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date());

  return `# Kontext
- Aktuelles Datum und Uhrzeit (Europe/Zurich): ${now}.`;
}

function buildAgentCapabilityBlocks(agent: StoredAgent): string {
  let prompt = applyEuCompliancePrompt(
    agent.systemPrompt,
    Boolean(agent.euComplianceEnabled)
  );

  if (agent.appointmentBookingEnabled) {
    prompt += buildAppointmentBlock(
      normalizeAppointmentConfig(agent.appointmentConfig),
      agent
    );
  }

  prompt += buildCustomerAccessBlock(agent);
  return prompt;
}

async function buildGlobalGovernanceBlock(
  channel: WorkflowEngineChannel,
  userId?: string,
  includeAllWorkflows?: boolean
): Promise<string> {
  if (includeAllWorkflows) {
    return getGovernancePromptBlock(channel, userId);
  }

  const compiled = await getPublishedGovernance();
  if (!compiled) return "";

  const global =
    channel === "voice"
      ? compiled.globalVoiceBlock
      : compiled.globalMessageBlock;

  return global;
}

function buildSingleWorkflowBlock(
  definition: WorkflowDefinition,
  channel: WorkflowEngineChannel,
  compiledBlock?: string
): string {
  if (compiledBlock) return compiledBlock;
  return channel === "voice"
    ? `# Aktiver Workflow\n${definition.voiceInstructions}\n\n${definition.businessRules}`
    : `# Aktiver Workflow\n${definition.messageInstructions}\n\n${definition.businessRules}`;
}

function channelAdapter(
  channel: WorkflowEngineChannel,
  channelNote?: string
): string {
  if (channel === "voice") {
    return VOICE_CHANNEL_BLOCK;
  }
  return TEXT_CHANNEL_BLOCK + (channelNote ?? "");
}

export async function buildUnifiedAgentPrompt(
  input: PromptBuildInput & {
    websiteKnowledgeBlock?: string | null;
    craftsmenKnowledgeBlock?: string | null;
    compiledWorkflowBlock?: string;
  }
): Promise<string> {
  const {
    agent,
    channel,
    userId,
    activeWorkflow,
    execution,
    includeLegacyAllWorkflows,
    websiteKnowledgeBlock,
    craftsmenKnowledgeBlock,
    compiledWorkflowBlock,
  } = input;

  const engineEnabled = await isWorkflowEngineEnabledForUser(userId);
  const useEngine = engineEnabled && activeWorkflow && !includeLegacyAllWorkflows;

  const parts: string[] = [buildAgentCapabilityBlocks(agent)];

  if (useEngine && activeWorkflow) {
    parts.push(
      await buildGlobalGovernanceBlock(channel, userId, false)
    );
    parts.push(
      buildSingleWorkflowBlock(activeWorkflow, channel, compiledWorkflowBlock)
    );
    if (execution) {
      parts.push(buildExecutionContextBlock(activeWorkflow, execution));
    }
  } else {
    parts.push(
      await buildGlobalGovernanceBlock(
        channel,
        userId,
        true
      )
    );
  }

  if (channel !== "voice") {
    if (websiteKnowledgeBlock) parts.push(websiteKnowledgeBlock);
    if (craftsmenKnowledgeBlock) parts.push(craftsmenKnowledgeBlock);
    parts.push(buildDateContextBlock());
    parts.push(channelAdapter(channel));
    parts.push(CHAT_INSTRUCTION_BLOCK);
  } else if (engineEnabled) {
    parts.push(channelAdapter(channel));
  }

  const base = parts.filter(Boolean).join("\n\n");
  return applyLanguageInstructions(base, normalizeAgentLanguage(agent.language));
}

export async function buildLegacyGovernanceOnlyBlock(
  channel: WorkflowEngineChannel,
  userId?: string
): Promise<string> {
  return getGovernancePromptBlock(channel, userId);
}

export async function buildRouterOnlyVoicePrompt(input: {
  agent: StoredAgent;
  userId?: string;
}): Promise<string> {
  const compiled = await getPublishedGovernance();
  const global = compiled?.globalVoiceBlock ?? "";

  return [
    buildAgentCapabilityBlocks(input.agent),
    global,
    `# Workflow-Routing (Voice)
- Zu Beginn jedes Gesprächs: Anliegen des Anrufers verstehen.
- Rufe get_workflow_context mit einer kurzen Zusammenfassung des Anliegens auf.
- Befolge danach ausschliesslich die Instruktionen aus get_workflow_context.
- Wechsle nicht zwischen Workflows ohne erneuten get_workflow_context-Aufruf.`,
    VOICE_CHANNEL_BLOCK,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export { buildGovernancePromptBlock };
