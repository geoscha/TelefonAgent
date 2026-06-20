import "server-only";

import type { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import {
  buildBuiltInToolsDefaults,
  buildConversationConfig,
  ESCALATION_CLIENT_MESSAGE,
  ELEVENLABS_APPOINTMENT_MAX_TOKENS,
  ELEVENLABS_CHAT_MAX_TOKENS,
  ELEVENLABS_CHAT_TURN_TIMEOUT_SECONDS,
} from "@/lib/elevenlabs/agent-config";
import { ensureAppointmentToolIds } from "@/lib/elevenlabs/appointment-tool-sync";
import { applyEuComplianceGreeting, applyEuCompliancePrompt } from "@/lib/elevenlabs/compliance";
import { buildAppointmentBlock } from "@/lib/elevenlabs/prompt";
import { normalizeAppointmentConfig } from "@/lib/integrations/appointment-config";
import { normalizeEscalationPhone } from "@/lib/integrations/medical-guardrails";
import type { StoredAgent } from "@/lib/onboarding-types";

function buildEscalationBlock(phoneNumber: string): string {
  return `

# Weiterleitung an eine Person
- Weiterleitungsnummer für transfer_to_number: **${phoneNumber}**
- Leite weiter (transfer_to_number), wenn der Anrufer eine Person verlangt oder du das Anliegen nicht lösen kannst.
- **Ablauf (strikt):** Sofort **transfer_to_number** aufrufen — **nicht** zuerst laut ankündigen und warten.
- **transfer_number:** exakt ${phoneNumber}
- **client_message:** exakt «${ESCALATION_CLIENT_MESSAGE}» (wird dem Anrufer vorgelesen — du sagst es nicht separat).
- **agent_message:** ein kurzer Satz für den Mitarbeiter (Anliegen des Anrufers).
- **VERBOT:** Nie «ich leite weiter» oder «ich verbinde» sagen, ohne transfer_to_number in derselben Antwort aufzurufen. Nie zweimal hintereinander ankündigen.
- Nach erfolgreichem transfer_to_number: **kein** end_call — die Weiterleitung beendet das Gespräch.
- Übliche Anliegen (Termin, einfache Fragen) zuerst selbst bearbeiten, nicht vorschnell weiterleiten.`;
}

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

  if (normalizeEscalationPhone(agent.escalationPhoneNumber)) {
    prompt += buildEscalationBlock(
      normalizeEscalationPhone(agent.escalationPhoneNumber)!
    );
  }

  return prompt;
}

function buildBuiltInTools(agent: StoredAgent, options?: { chatMode?: boolean }) {
  const escalationNumber = normalizeEscalationPhone(agent.escalationPhoneNumber);
  return buildBuiltInToolsDefaults(undefined, {
    endCall:
      (Boolean(agent.appointmentBookingEnabled) || Boolean(escalationNumber)) &&
      !options?.chatMode,
    transferPhoneNumber: options?.chatMode ? undefined : escalationNumber,
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
