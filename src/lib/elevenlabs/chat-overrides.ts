import "server-only";

import { normalizeAgentLanguage } from "@/lib/elevenlabs/agent-config";
import type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";
import { buildLiveAgentSystemPrompt } from "@/lib/elevenlabs/agent-sync";
import { applyEuComplianceGreeting } from "@/lib/elevenlabs/compliance";
import { toLanguageCode } from "@/lib/elevenlabs/prompt";
import { normalizeAppointmentConfig } from "@/lib/integrations/appointment-config";
import { normalizeEscalationPhone } from "@/lib/integrations/medical-guardrails";
import type { StoredAgent } from "@/lib/onboarding-types";

export type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";

export function mergeAgentChatDraft(
  agent: StoredAgent,
  draft?: AgentChatDraft
): StoredAgent {
  return {
    ...agent,
    greeting: draft?.greeting?.trim() || agent.greeting,
    systemPrompt: draft?.systemPrompt?.trim() || agent.systemPrompt,
    language: draft?.language || agent.language,
    voiceId: draft?.voiceId || agent.voiceId,
    euComplianceEnabled:
      draft?.euComplianceEnabled ?? agent.euComplianceEnabled,
    escalationPhoneNumber:
      draft?.escalationPhoneNumber !== undefined
        ? normalizeEscalationPhone(draft.escalationPhoneNumber)
        : agent.escalationPhoneNumber,
    medicalGuardrailsEnabled:
      draft?.medicalGuardrailsEnabled ?? agent.medicalGuardrailsEnabled,
    appointmentBookingEnabled:
      draft?.appointmentBookingEnabled ?? agent.appointmentBookingEnabled,
    appointmentConfig:
      draft?.appointmentConfig !== undefined
        ? normalizeAppointmentConfig({
            ...agent.appointmentConfig,
            ...draft.appointmentConfig,
          })
        : agent.appointmentConfig,
  };
}

/** Runtime overrides so the chat test mirrors the live phone agent config. */
export function buildAgentChatOverrides(agent: StoredAgent) {
  const language = normalizeAgentLanguage(agent.language);
  return {
    agent: {
      firstMessage: applyEuComplianceGreeting(
        agent.greeting,
        Boolean(agent.euComplianceEnabled)
      ),
      language: toLanguageCode(language),
      prompt: {
        prompt: buildLiveAgentSystemPrompt(agent),
      },
    },
    tts: {
      voiceId: agent.voiceId,
    },
    conversation: {
      textOnly: true,
    },
  };
}
