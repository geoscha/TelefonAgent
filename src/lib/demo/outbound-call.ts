import "server-only";

import {
  buildDemoOutboundSystemPrompt,
} from "@/lib/demo/demo-agent-config";
import { getDemoAgentConfig } from "@/lib/admin/demo-config";
import {
  ensureDemoCallTarget,
  updateDemoAgentForOutbound,
} from "@/lib/demo/ensure-demo-agent";
import {
  buildDemoOutboundGreeting,
  getDemoUseCase,
  type DemoUseCaseId,
} from "@/lib/demo/use-cases";
import type { DemoVoicePresetId } from "@/lib/demo/voices";
import {
  describeElevenLabsError,
  getElevenLabsClient,
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
    const agentConfig = await getDemoAgentConfig();
    const greeting =
      agentConfig.greeting ?? buildDemoOutboundGreeting(name, useCase);
    const systemPrompt = buildDemoOutboundSystemPrompt({
      name,
      scenario: useCase.scenario,
      adminContext: agentConfig.context,
      curaAgent: useCase.curaAgent,
    });

    const { agentId, agentPhoneNumberId, phoneProvider } =
      await ensureDemoCallTarget();
    await updateDemoAgentForOutbound({ greeting, systemPrompt });

    const client = getElevenLabsClient();
    const request = {
      agentId,
      agentPhoneNumberId,
      toNumber,
      telephonyCallConfig: {
        ringingTimeoutSecs: 45,
      },
    };

    const data =
      phoneProvider === "twilio"
        ? await client.conversationalAi.twilio.outboundCall(request)
        : phoneProvider === "sip_trunk"
          ? await client.conversationalAi.sipTrunk.outboundCall(request)
          : null;

    if (!data) {
      return {
        ok: false,
        message:
          "Demo-Anrufe werden für diesen Telefonanbieter nicht unterstützt.",
      };
    }

    if (!data.success) {
      return {
        ok: false,
        message:
          data.message?.trim() ||
          "Der Anruf konnte nicht gestartet werden. Bitte Nummer prüfen und erneut versuchen.",
      };
    }

    return {
      ok: true,
      message: "Cura ruft Sie gleich an — bitte nehmen Sie Ihr Telefon entgegen.",
      conversationId: data.conversationId,
    };
  } catch (error) {
    if (error instanceof Error) {
      return { ok: false, message: error.message };
    }

    const described = describeElevenLabsError(error);
    return { ok: false, message: described.message };
  }
}
