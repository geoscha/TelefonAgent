import "server-only";

import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import {
  buildBuiltInToolsDefaults,
  buildConversationConfig,
  buildTransferToNumberTool,
  ELEVENLABS_APPOINTMENT_MAX_TOKENS,
  ELEVENLABS_CHAT_MAX_TOKENS,
  ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS,
} from "@/lib/elevenlabs/agent-config";
import { ensureAppointmentToolIds } from "@/lib/elevenlabs/appointment-tool-sync";
import { applyEuComplianceGreeting, applyEuCompliancePrompt } from "@/lib/elevenlabs/compliance";
import { buildAppointmentBlock } from "@/lib/elevenlabs/prompt";
import { parseSystemPrompt } from "@/lib/elevenlabs/prompt-sections";
import {
  agentUsesMedicalGuardrails,
  buildMedicalGuardrailBlock,
  normalizeEscalationPhone,
} from "@/lib/integrations/medical-guardrails";
import { normalizeAppointmentConfig } from "@/lib/integrations/appointment-config";
import type { StoredAgent } from "@/lib/onboarding-types";

export function buildLiveAgentSystemPrompt(agent: StoredAgent): string {
  const branche = parseSystemPrompt(agent.systemPrompt).branche;
  let prompt = applyEuCompliancePrompt(
    agent.systemPrompt,
    Boolean(agent.euComplianceEnabled)
  );

  if (agentUsesMedicalGuardrails(agent, branche)) {
    prompt += buildMedicalGuardrailBlock(
      normalizeEscalationPhone(agent.escalationPhoneNumber)
    );
  }

  if (agent.appointmentBookingEnabled) {
    prompt += buildAppointmentBlock(
      normalizeAppointmentConfig(agent.appointmentConfig)
    );
  }

  return prompt;
}

function buildBuiltInTools(agent: StoredAgent) {
  const branche = parseSystemPrompt(agent.systemPrompt).branche;
  const medical = agentUsesMedicalGuardrails(agent, branche);
  const escalationPhone = normalizeEscalationPhone(agent.escalationPhoneNumber);
  return buildBuiltInToolsDefaults(
    medical && escalationPhone
      ? {
          transferToNumber: buildTransferToNumberTool(escalationPhone),
        }
      : undefined
  );
}

export function buildLiveAgentConversationConfig(
  agent: StoredAgent,
  toolIds: string[] = []
) {
  return buildConversationConfig({
    greeting: applyEuComplianceGreeting(
      agent.greeting,
      Boolean(agent.euComplianceEnabled)
    ),
    language: agent.language ?? "Deutsch",
    systemPrompt: buildLiveAgentSystemPrompt(agent),
    voiceId: agent.voiceId,
    builtInTools: buildBuiltInTools(agent),
    toolIds,
    maxTokens: agent.appointmentBookingEnabled
      ? ELEVENLABS_APPOINTMENT_MAX_TOKENS
      : undefined,
  });
}

/** Chat test: higher token budget, longer turns, explicit booking completion. */
export function buildLiveAgentChatConversationConfig(
  agent: StoredAgent,
  toolIds: string[] = []
) {
  return buildConversationConfig({
    greeting: applyEuComplianceGreeting(
      agent.greeting,
      Boolean(agent.euComplianceEnabled)
    ),
    language: agent.language ?? "Deutsch",
    systemPrompt: buildLiveAgentSystemPrompt(agent),
    voiceId: agent.voiceId,
    builtInTools: buildBuiltInTools(agent),
    toolIds,
    chatMode: true,
    maxTokens: ELEVENLABS_CHAT_MAX_TOKENS,
    turnTimeoutSeconds: ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS,
  });
}

export async function syncAgentConversationConfig(
  client: ElevenLabsClient,
  agent: StoredAgent,
  options?: { chatMode?: boolean }
): Promise<void> {
  const appointmentConfig = normalizeAppointmentConfig(agent.appointmentConfig);
  const toolIds = agent.appointmentBookingEnabled
    ? await ensureAppointmentToolIds(client, appointmentConfig)
    : [];

  const conversationConfig = options?.chatMode
    ? buildLiveAgentChatConversationConfig(agent, toolIds)
    : buildLiveAgentConversationConfig(agent, toolIds);

  await client.conversationalAi.agents.update(agent.id, {
    name: agent.name,
    conversationConfig,
  } as Parameters<typeof client.conversationalAi.agents.update>[1]);
}
