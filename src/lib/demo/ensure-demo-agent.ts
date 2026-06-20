import "server-only";

import {
  getDemoOutboundConfig,
  getDemoAgentConfig,
} from "@/lib/admin/demo-config";
import {
  buildDemoAgentConversationConfig,
  buildDemoAgentSystemPrompt,
  DEMO_AGENT_NAME,
  DEMO_AGENT_TAG,
} from "@/lib/demo/demo-agent-config";
import { demoGreeting } from "@/lib/demo/responses";
import { getDemoVoicePreset } from "@/lib/demo/voices";
import { resolvePleasantDemoVoiceId } from "@/lib/demo/pleasant-voice";
import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import {
  assignAgentToPhoneNumber,
  getWorkspacePhoneDetail,
  listWorkspacePhoneDetails,
  normalizePhoneNumber,
  type PhoneTelephonyProvider,
} from "@/lib/elevenlabs/phone";

export interface DemoCallTarget {
  agentId: string;
  agentPhoneNumberId: string;
  phoneProvider: PhoneTelephonyProvider;
}

let cachedTarget: DemoCallTarget | null = null;

export function resetDemoCallTargetCache(): void {
  cachedTarget = null;
}

type ListedAgent = {
  agentId?: string;
  name?: string;
  tags?: string[];
};

async function listWorkspaceAgents(): Promise<ListedAgent[]> {
  const client = getElevenLabsClient();
  const res = (await client.conversationalAi.agents.list()) as {
    agents?: ListedAgent[];
  };
  return res.agents ?? [];
}

function findDemoAgent(agents: ListedAgent[]): ListedAgent | undefined {
  const envId = process.env.DEMO_AGENT_ID?.trim();
  if (envId) {
    return agents.find((a) => a.agentId === envId) ?? { agentId: envId };
  }

  return agents.find(
    (a) =>
      a.name === DEMO_AGENT_NAME ||
      a.tags?.includes(DEMO_AGENT_TAG) ||
      a.name?.includes("Linker Live-Demo") ||
      a.name?.includes("Linker Agent")
  );
}

async function resolveDemoPhoneTarget(): Promise<{
  phoneNumberId: string;
  provider: PhoneTelephonyProvider;
}> {
  const envPhoneId = process.env.DEMO_AGENT_PHONE_NUMBER_ID?.trim();
  if (envPhoneId) {
    const detail = await getWorkspacePhoneDetail(envPhoneId);
    if (!detail.supportsOutbound) {
      throw new Error(
        "Die konfigurierte Demo-Telefonnummer unterstützt keine ausgehenden Anrufe."
      );
    }
    return { phoneNumberId: envPhoneId, provider: detail.provider };
  }

  const { phoneNumber, elevenLabsPhoneId } = await getDemoOutboundConfig();
  if (!phoneNumber) {
    throw new Error(
      "Keine Demo-Ausgangsnummer hinterlegt. Bitte in Admin → Einstellungen die Live-Demo-Nummer eintragen."
    );
  }

  if (elevenLabsPhoneId) {
    const detail = await getWorkspacePhoneDetail(elevenLabsPhoneId);
    if (normalizePhoneNumber(detail.phoneNumber) !== phoneNumber) {
      throw new Error(
        "Die gespeicherte ElevenLabs-ID passt nicht zur Demo-Telefonnummer. Bitte in den Admin-Einstellungen erneut speichern."
      );
    }
    if (!detail.supportsOutbound) {
      throw new Error(
        "Die Demo-Telefonnummer unterstützt keine ausgehenden Anrufe."
      );
    }
    return {
      phoneNumberId: elevenLabsPhoneId,
      provider: detail.provider,
    };
  }

  const phones = await listWorkspacePhoneDetails();
  const match = phones.find((p) => p.phoneNumber === phoneNumber);
  if (!match) {
    throw new Error(
      `Die Demo-Nummer ${phoneNumber} wurde in ElevenLabs nicht gefunden. Bitte dort als Twilio-Nummer importieren.`
    );
  }
  if (!match.supportsOutbound) {
    throw new Error(
      "Die Demo-Telefonnummer unterstützt keine ausgehenden Anrufe."
    );
  }

  return {
    phoneNumberId: match.phoneNumberId,
    provider: match.provider,
  };
}

async function createOrUpdateDemoAgent(existingId?: string): Promise<string> {
  const client = getElevenLabsClient();
  const voiceId = await resolvePleasantDemoVoiceId();
  const agentConfig = await getDemoAgentConfig();
  const preset = getDemoVoicePreset(agentConfig.voicePreset);
  const greeting =
    agentConfig.greeting ?? demoGreeting(preset.language, null);
  const conversationConfig = buildDemoAgentConversationConfig(voiceId, {
    greeting,
    systemPrompt: buildDemoAgentSystemPrompt(
      agentConfig.context,
      preset.language
    ),
    language: preset.language,
  });

  if (existingId) {
    await client.conversationalAi.agents.update(existingId, {
      name: DEMO_AGENT_NAME,
      conversationConfig,
      tags: [DEMO_AGENT_TAG, "linker"],
    } as Parameters<typeof client.conversationalAi.agents.update>[1]);
    return existingId;
  }

  const created = (await client.conversationalAi.agents.create({
    name: DEMO_AGENT_NAME,
    conversationConfig,
    tags: [DEMO_AGENT_TAG, "linker"],
  } as Parameters<typeof client.conversationalAi.agents.create>[0])) as {
    agentId: string;
  };

  return created.agentId;
}

/** Syncs personalized greeting/prompt onto the demo agent before each outbound call. */
export async function updateDemoAgentForOutbound(params: {
  greeting: string;
  systemPrompt: string;
}): Promise<void> {
  const client = getElevenLabsClient();
  const agentConfig = await getDemoAgentConfig();
  const voiceId = await resolvePleasantDemoVoiceId();
  const preset = getDemoVoicePreset(agentConfig.voicePreset);
  const conversationConfig = buildDemoAgentConversationConfig(voiceId, {
    greeting: params.greeting,
    systemPrompt: params.systemPrompt,
    language: preset.language,
  });

  const agentId =
    cachedTarget?.agentId ??
    findDemoAgent(await listWorkspaceAgents())?.agentId ??
    (await createOrUpdateDemoAgent());

  await client.conversationalAi.agents.update(agentId, {
    name: DEMO_AGENT_NAME,
    conversationConfig,
    tags: [DEMO_AGENT_TAG, "linker"],
  } as Parameters<typeof client.conversationalAi.agents.update>[1]);
}

/**
 * Resolves (and lazily creates) the shared landing-page demo agent + outbound phone.
 * Demo phone comes from admin settings, not the user number pool.
 */
export async function ensureDemoCallTarget(): Promise<DemoCallTarget> {
  if (cachedTarget) return cachedTarget;

  const agents = await listWorkspaceAgents();
  const existing = findDemoAgent(agents);
  const agentId = await createOrUpdateDemoAgent(existing?.agentId);
  const { phoneNumberId: agentPhoneNumberId, provider: phoneProvider } =
    await resolveDemoPhoneTarget();

  await assignAgentToPhoneNumber(
    agentPhoneNumberId,
    agentId,
    "Linker Live-Demo"
  );

  cachedTarget = { agentId, agentPhoneNumberId, phoneProvider };
  return cachedTarget;
}
