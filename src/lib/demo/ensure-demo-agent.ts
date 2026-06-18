import "server-only";

import {
  buildDemoAgentConversationConfig,
  DEMO_AGENT_NAME,
  DEMO_AGENT_TAG,
} from "@/lib/demo/demo-agent-config";
import { resolvePleasantDemoVoiceId } from "@/lib/demo/pleasant-voice";
import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import {
  configuredPoolNumbers,
  listWorkspacePhones,
} from "@/lib/elevenlabs/phone";

export interface DemoCallTarget {
  agentId: string;
  agentPhoneNumberId: string;
}

let cachedTarget: DemoCallTarget | null = null;

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
      a.name?.includes("Cura Live-Demo")
  );
}

async function resolveDemoPhoneNumberId(): Promise<string> {
  const envPhoneId = process.env.DEMO_AGENT_PHONE_NUMBER_ID?.trim();
  if (envPhoneId) return envPhoneId;

  const phones = await listWorkspacePhones();
  if (phones.length === 0) {
    throw new Error(
      "Keine Telefonnummer in ElevenLabs gefunden. Bitte Nummer aus CURA_NUMBER_POOL im ElevenLabs-Dashboard importieren."
    );
  }

  const pool = configuredPoolNumbers();
  const fromPool = phones.find((p) => pool.includes(p.phoneNumber));
  return (fromPool ?? phones[0]).phoneNumberId;
}

async function createOrUpdateDemoAgent(existingId?: string): Promise<string> {
  const client = getElevenLabsClient();
  const voiceId = await resolvePleasantDemoVoiceId();
  const conversationConfig = buildDemoAgentConversationConfig(voiceId);

  if (existingId) {
    await client.conversationalAi.agents.update(existingId, {
      name: DEMO_AGENT_NAME,
      conversationConfig,
      tags: [DEMO_AGENT_TAG, "cura"],
    } as Parameters<typeof client.conversationalAi.agents.update>[1]);
    return existingId;
  }

  const created = (await client.conversationalAi.agents.create({
    name: DEMO_AGENT_NAME,
    conversationConfig,
    tags: [DEMO_AGENT_TAG, "cura"],
  } as Parameters<typeof client.conversationalAi.agents.create>[0])) as {
    agentId: string;
  };

  return created.agentId;
}

/**
 * Resolves (and lazily creates) the shared landing-page demo agent + outbound phone.
 * Env overrides optional; otherwise auto-provisions in ElevenLabs.
 */
export async function ensureDemoCallTarget(): Promise<DemoCallTarget> {
  if (cachedTarget) return cachedTarget;

  const agents = await listWorkspaceAgents();
  const existing = findDemoAgent(agents);
  const agentId = await createOrUpdateDemoAgent(existing?.agentId);
  const agentPhoneNumberId = await resolveDemoPhoneNumberId();

  cachedTarget = { agentId, agentPhoneNumberId };
  return cachedTarget;
}
