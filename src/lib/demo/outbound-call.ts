import "server-only";

import {
  buildDemoOutboundSystemPrompt,
} from "@/lib/demo/demo-agent-config";
import { ensureDemoCallTarget } from "@/lib/demo/ensure-demo-agent";
import {
  buildDemoOutboundGreeting,
  getDemoUseCase,
  type DemoUseCaseId,
} from "@/lib/demo/use-cases";
import { resolvePleasantDemoVoiceId } from "@/lib/demo/pleasant-voice";
import type { DemoVoicePresetId } from "@/lib/demo/voices";
import {
  describeElevenLabsError,
  hasApiKey,
} from "@/lib/elevenlabs/client";
import { normalizePhoneNumber } from "@/lib/elevenlabs/phone";

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
    const { agentId, agentPhoneNumberId } = await ensureDemoCallTarget();
    const voiceId = await resolvePleasantDemoVoiceId();
    const greeting = buildDemoOutboundGreeting(name, useCase);
    const systemPrompt = buildDemoOutboundSystemPrompt({
      name,
      scenario: useCase.scenario,
    });

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
                language: "de",
                prompt: {
                  prompt: systemPrompt,
                },
              },
              tts: {
                voice_id: voiceId,
                speed: 0.95,
                stability: 0.55,
                similarity_boost: 0.75,
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
          : Array.isArray(data?.detail)
            ? String((data.detail as { msg?: string }[])[0]?.msg ?? "")
            : typeof data?.message === "string"
              ? data.message
              : null;
      return {
        ok: false,
        message:
          detail ||
          "Der Anruf konnte nicht gestartet werden. Bitte Nummer prüfen und erneut versuchen.",
      };
    }

    return {
      ok: true,
      message: "Lea ruft Sie gleich an — bitte nehmen Sie Ihr Telefon entgegen.",
      conversationId: data.conversation_id,
    };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }

    const described = describeElevenLabsError(error);
    return { ok: false, message: described.message };
  }
}
