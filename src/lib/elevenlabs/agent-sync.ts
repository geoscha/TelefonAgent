import "server-only";

import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import {
  buildBuiltInToolsDefaults,
  buildConversationConfig,
  ELEVENLABS_APPOINTMENT_MAX_TOKENS,
  ELEVENLABS_CHAT_MAX_TOKENS,
  ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS,
} from "@/lib/elevenlabs/agent-config";
import { ensureAppointmentToolIds } from "@/lib/elevenlabs/appointment-tool-sync";
import { applyEuComplianceGreeting, applyEuCompliancePrompt } from "@/lib/elevenlabs/compliance";
import { buildAppointmentBlock } from "@/lib/elevenlabs/prompt";
import { normalizeAppointmentConfig } from "@/lib/integrations/appointment-config";
import type { StoredAgent } from "@/lib/onboarding-types";

export function buildLiveAgentSystemPrompt(agent: StoredAgent): string {
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

  return prompt;
}

function buildBuiltInTools(agent: StoredAgent, options?: { chatMode?: boolean }) {
  return buildBuiltInToolsDefaults(undefined, {
    endCall: Boolean(agent.appointmentBookingEnabled) && !options?.chatMode,
  });
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
    builtInTools: buildBuiltInTools(agent, { chatMode: true }),
    toolIds,
    chatMode: true,
    maxTokens: ELEVENLABS_CHAT_MAX_TOKENS,
    turnTimeoutSeconds: ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS,
  });
}

export async function syncAgentConversationConfig(
  client: ElevenLabsClient,
  agent: StoredAgent,
  options?: { chatMode?: boolean; siteUrl?: string }
): Promise<void> {
  const appointmentConfig = normalizeAppointmentConfig(agent.appointmentConfig);
  const toolIds = agent.appointmentBookingEnabled
    ? await ensureAppointmentToolIds(client, appointmentConfig, {
        siteUrl: options?.siteUrl,
      })
    : [];

  const conversationConfig = options?.chatMode
    ? buildLiveAgentChatConversationConfig(agent, toolIds)
    : buildLiveAgentConversationConfig(agent, toolIds);

  await client.conversationalAi.agents.update(agent.id, {
    name: agent.name,
    conversationConfig,
  } as Parameters<typeof client.conversationalAi.agents.update>[1]);
}
