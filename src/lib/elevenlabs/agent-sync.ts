import "server-only";

import {
  buildBuiltInToolsDefaults,
  buildConversationConfig,
  buildTransferToNumberTool,
  ELEVENLABS_CHAT_MAX_TOKENS,
  ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS,
} from "@/lib/elevenlabs/agent-config";
import { buildAppointmentWebhookTools } from "@/lib/elevenlabs/appointment-tools";
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

function resolveAppointmentWebhookTools(agent: StoredAgent) {
  if (!agent.appointmentBookingEnabled) return undefined;
  return buildAppointmentWebhookTools(
    agent.id,
    normalizeAppointmentConfig(agent.appointmentConfig)
  );
}

export function buildLiveAgentConversationConfig(agent: StoredAgent) {
  const branche = parseSystemPrompt(agent.systemPrompt).branche;
  const medical = agentUsesMedicalGuardrails(agent, branche);
  const escalationPhone = normalizeEscalationPhone(agent.escalationPhoneNumber);
  const builtInTools = buildBuiltInToolsDefaults(
    medical && escalationPhone
      ? {
          transferToNumber: buildTransferToNumberTool(escalationPhone),
        }
      : undefined
  );

  return buildConversationConfig({
    greeting: applyEuComplianceGreeting(
      agent.greeting,
      Boolean(agent.euComplianceEnabled)
    ),
    language: agent.language ?? "Deutsch",
    systemPrompt: buildLiveAgentSystemPrompt(agent),
    voiceId: agent.voiceId,
    builtInTools,
    webhookTools: resolveAppointmentWebhookTools(agent),
  });
}

/** Chat test: higher token budget, longer turns, explicit booking completion. */
export function buildLiveAgentChatConversationConfig(agent: StoredAgent) {
  const branche = parseSystemPrompt(agent.systemPrompt).branche;
  const medical = agentUsesMedicalGuardrails(agent, branche);
  const escalationPhone = normalizeEscalationPhone(agent.escalationPhoneNumber);
  const builtInTools = buildBuiltInToolsDefaults(
    medical && escalationPhone
      ? {
          transferToNumber: buildTransferToNumberTool(escalationPhone),
        }
      : undefined
  );

  return buildConversationConfig({
    greeting: applyEuComplianceGreeting(
      agent.greeting,
      Boolean(agent.euComplianceEnabled)
    ),
    language: agent.language ?? "Deutsch",
    systemPrompt: buildLiveAgentSystemPrompt(agent),
    voiceId: agent.voiceId,
    builtInTools,
    webhookTools: resolveAppointmentWebhookTools(agent),
    chatMode: true,
    maxTokens: ELEVENLABS_CHAT_MAX_TOKENS,
    turnTimeoutSeconds: ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS,
  });
}
