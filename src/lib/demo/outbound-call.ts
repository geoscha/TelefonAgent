import "server-only";

import { buildDemoSystemPrompt } from "@/lib/demo/responses";
import {
  buildDemoOutboundGreeting,
  getDemoUseCase,
  type DemoUseCaseId,
} from "@/lib/demo/use-cases";
import { getDemoVoicePreset, type DemoVoicePresetId } from "@/lib/demo/voices";
import { resolveDemoVoiceId } from "@/lib/demo/voices-server";
import {
  describeElevenLabsError,
  hasApiKey,
} from "@/lib/elevenlabs/client";
import {
  configuredPoolNumbers,
  listWorkspacePhones,
  normalizePhoneNumber,
} from "@/lib/elevenlabs/phone";

export interface DemoCallbackInput {
  name: string;
  phone: string;
  useCaseId: DemoUseCaseId;
  voice?: DemoVoicePresetId;
}

export interface DemoCallbackResult {
  ok: boolean;
  message: string;
  conversationId?: string | null;
}

async function resolveDemoCallTarget(): Promise<{
  agentId: string;
  agentPhoneNumberId: string;
}> {
  const agentId = process.env.DEMO_AGENT_ID?.trim();
  const agentPhoneNumberId = process.env.DEMO_AGENT_PHONE_NUMBER_ID?.trim();

  if (agentId && agentPhoneNumberId) {
    return { agentId, agentPhoneNumberId };
  }

  const phones = await listWorkspacePhones();
  const pool = configuredPoolNumbers();

  const match =
    phones.find((p) => pool.includes(p.phoneNumber) && p.assignedAgentId) ??
    phones.find((p) => p.assignedAgentId);

  if (match?.assignedAgentId) {
    return {
      agentId: match.assignedAgentId,
      agentPhoneNumberId: match.phoneNumberId,
    };
  }

  if (agentId) {
    const phone = phones[0];
    if (phone) {
      return { agentId, agentPhoneNumberId: phone.phoneNumberId };
    }
  }

  throw new Error(
    "Demo-Anruf nicht konfiguriert. Bitte DEMO_AGENT_ID und DEMO_AGENT_PHONE_NUMBER_ID in .env.local setzen."
  );
}

export async function initiateDemoCallback(
  input: DemoCallbackInput
): Promise<DemoCallbackResult> {
  if (!hasApiKey()) {
    return {
      ok: false,
      message:
        "Live-Demo ist derzeit nicht verfügbar. Bitte versuchen Sie es später erneut.",
    };
  }

  const name = input.name.trim();
  const toNumber = normalizePhoneNumber(input.phone.trim());
  const useCase = getDemoUseCase(input.useCaseId);
  const voicePreset = getDemoVoicePreset(input.voice ?? useCase.voice);

  if (!name) {
    return { ok: false, message: "Bitte geben Sie Ihren Namen ein." };
  }

  if (!/^\+[1-9]\d{7,14}$/.test(toNumber)) {
    return {
      ok: false,
      message: "Bitte geben Sie eine gültige Telefonnummer im Format +41… ein.",
    };
  }

  try {
    const { agentId, agentPhoneNumberId } = await resolveDemoCallTarget();
    const voiceId = await resolveDemoVoiceId(voicePreset.id, process.env.ELEVENLABS_API_KEY!);
    const greeting = buildDemoOutboundGreeting(name, useCase);
    const systemPrompt = `${buildDemoSystemPrompt(voicePreset.language)}

# Demo-Szenario
${useCase.scenario}
Der Anrufer heisst ${name}. Bleiben Sie in 1–3 Sätzen pro Antwort. Beenden Sie höflich nach ca. 2 Minuten und laden Sie zum kostenlosen Test ein.`;

    const apiKey = process.env.ELEVENLABS_API_KEY!;
    const res = await fetch(
      "https://api.elevenlabs.io/v1/convai/twilio/outbound-call",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number_id: agentPhoneNumberId,
          to_number: toNumber,
          conversation_initiation_client_data: {
            conversation_config_override: {
              agent: {
                first_message: greeting,
                prompt: {
                  prompt: systemPrompt,
                },
              },
              tts: {
                voice_id: voiceId,
              },
            },
          },
          telephony_call_config: {
            ringing_timeout_secs: 45,
          },
        }),
      }
    );

    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
      message?: string;
      conversation_id?: string | null;
      detail?: unknown;
    } | null;

    if (!res.ok || !data?.success) {
      const detail =
        typeof data?.detail === "string"
          ? data.detail
          : typeof data?.message === "string"
            ? data.message
            : null;
      return {
        ok: false,
        message:
          detail ??
          "Der Anruf konnte nicht gestartet werden. Bitte Nummer prüfen und erneut versuchen.",
      };
    }

    return {
      ok: true,
      message: "Anruf wird verbunden — bitte nehmen Sie Ihr Telefon entgegen.",
      conversationId: data.conversation_id,
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes("Demo-Anruf nicht konfiguriert")) {
      return { ok: false, message: error.message };
    }

    const described = describeElevenLabsError(error);
    return { ok: false, message: described.message };
  }
}
