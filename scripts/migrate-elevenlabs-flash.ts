/**
 * One-off migration: apply Cura cost-optimized ElevenLabs agent defaults
 * (TTS model, LLM, temperature, turn timeout, max duration, voicemail detection).
 *
 * Usage: npm run migrate:elevenlabs-agent-config
 * Requires ELEVENLABS_API_KEY in .env.local or the environment.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

import {
  buildConversationConfigCostPatchSnake,
  ELEVENLABS_LLM_MODEL,
  ELEVENLABS_MAX_DURATION_SECONDS,
  ELEVENLABS_PROMPT_MAX_TOKENS,
  ELEVENLABS_PROMPT_TEMPERATURE,
  ELEVENLABS_TTS_MODEL,
  ELEVENLABS_TURN_TIMEOUT_SECONDS,
  prepareAgentSystemPrompt,
  type AgentLanguageLabel,
} from "../src/lib/elevenlabs/agent-config";

const API_BASE = "https://api.elevenlabs.io/v1";
const PAGE_SIZE = 100;
const PAUSE_MS = 300;

function loadEnvLocal(): void {
  const path = resolve(process.cwd(), ".env.local");
  try {
    const raw = readFileSync(path, "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) {
        process.env[m[1]] = val;
      }
    }
  } catch {
    /* optional */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

type AgentSummary = {
  agent_id?: string;
  agentId?: string;
  name?: string;
};

type ListAgentsResponse = {
  agents?: AgentSummary[];
  next_cursor?: string | null;
  has_more?: boolean;
};

type AgentDetail = {
  agent_id?: string;
  name?: string;
  conversation_config?: {
    tts?: { model_id?: string; voice_id?: string };
    turn?: { turn_timeout?: number };
    conversation?: { max_duration_seconds?: number };
    agent?: {
      first_message?: string;
      language?: string;
      prompt?: {
        prompt?: string;
        llm?: string;
        temperature?: number;
        max_tokens?: number;
        knowledge_base?: unknown[];
        built_in_tools?: Record<string, unknown>;
      };
    };
  };
};

function agentIdFromSummary(agent: AgentSummary): string | null {
  return agent.agent_id ?? agent.agentId ?? null;
}

function languageLabelFromCode(code?: string): AgentLanguageLabel {
  return code === "de" ? "Deutsch" : "Deutsch";
}

function voicemailEnabled(builtInTools?: Record<string, unknown>): boolean {
  return Boolean(builtInTools?.voicemail_detection);
}

function needsMigration(detail: AgentDetail): boolean {
  const cfg = detail.conversation_config;
  const prompt = cfg?.agent?.prompt;
  const rawPrompt = prompt?.prompt ?? "";

  return (
    cfg?.tts?.model_id !== ELEVENLABS_TTS_MODEL ||
    prompt?.llm !== ELEVENLABS_LLM_MODEL ||
    prompt?.temperature !== ELEVENLABS_PROMPT_TEMPERATURE ||
    prompt?.max_tokens !== ELEVENLABS_PROMPT_MAX_TOKENS ||
    cfg?.turn?.turn_timeout !== ELEVENLABS_TURN_TIMEOUT_SECONDS ||
    cfg?.conversation?.max_duration_seconds !==
      ELEVENLABS_MAX_DURATION_SECONDS ||
    !voicemailEnabled(prompt?.built_in_tools) ||
    !/maximal 1.?2 sätze/i.test(rawPrompt)
  );
}

async function apiRequest<T>(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `${init?.method ?? "GET"} ${path} → ${res.status}: ${body.slice(0, 300)}`
    );
  }

  return (await res.json()) as T;
}

async function listAllAgents(apiKey: string): Promise<AgentSummary[]> {
  const agents: AgentSummary[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);

    const page = await apiRequest<ListAgentsResponse>(
      apiKey,
      `/convai/agents?${params.toString()}`
    );

    agents.push(...(page.agents ?? []));
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    if (cursor) await sleep(PAUSE_MS);
  } while (cursor);

  return agents;
}

async function getAgentDetail(
  apiKey: string,
  agentId: string
): Promise<AgentDetail> {
  return apiRequest<AgentDetail>(
    apiKey,
    `/convai/agents/${encodeURIComponent(agentId)}`
  );
}

async function patchAgentCostConfig(
  apiKey: string,
  agentId: string,
  detail: AgentDetail
): Promise<void> {
  const cfg = detail.conversation_config;
  const agent = cfg?.agent;
  const promptCfg = agent?.prompt;
  const rawPrompt = promptCfg?.prompt ?? "";
  const language = languageLabelFromCode(agent?.language);
  const preparedPrompt = rawPrompt
    ? prepareAgentSystemPrompt(rawPrompt, language)
    : undefined;

  const body = buildConversationConfigCostPatchSnake({
    firstMessage: agent?.first_message,
    prompt: preparedPrompt,
    knowledgeBase: promptCfg?.knowledge_base as
      | { type: string; name: string; id: string }[]
      | undefined,
    builtInTools: promptCfg?.built_in_tools,
  });

  await apiRequest(apiKey, `/convai/agents/${encodeURIComponent(agentId)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

async function main(): Promise<void> {
  loadEnvLocal();

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY fehlt (.env.local oder Umgebung).");
    process.exit(1);
  }

  console.log("Applying Cura cost-optimized ElevenLabs agent defaults…");
  console.log(
    [
      `TTS=${ELEVENLABS_TTS_MODEL}`,
      `LLM=${ELEVENLABS_LLM_MODEL}`,
      `temperature=${ELEVENLABS_PROMPT_TEMPERATURE}`,
      `max_tokens=${ELEVENLABS_PROMPT_MAX_TOKENS}`,
      `turn_timeout=${ELEVENLABS_TURN_TIMEOUT_SECONDS}s`,
      `max_duration=${ELEVENLABS_MAX_DURATION_SECONDS}s`,
      "voicemail_detection=on",
    ].join(", ")
  );

  const summaries = await listAllAgents(apiKey);
  const agentIds = summaries
    .map(agentIdFromSummary)
    .filter((id): id is string => Boolean(id));

  console.log(`Found ${agentIds.length} agent(s).`);

  let checked = 0;
  let migrated = 0;
  let skipped = 0;
  const failed: { agentId: string; name?: string; error: string }[] = [];

  for (const agentId of agentIds) {
    checked += 1;
    const summary = summaries.find((a) => agentIdFromSummary(a) === agentId);
    const label = summary?.name ? `${summary.name} (${agentId})` : agentId;

    try {
      const detail = await getAgentDetail(apiKey, agentId);

      if (!needsMigration(detail)) {
        skipped += 1;
        console.log(`  skip  ${label} — already on cost defaults`);
        await sleep(PAUSE_MS);
        continue;
      }

      const beforeLlm = detail.conversation_config?.agent?.prompt?.llm ?? "(none)";
      const beforeTts =
        detail.conversation_config?.tts?.model_id ?? "(none)";

      await patchAgentCostConfig(apiKey, agentId, detail);
      migrated += 1;
      console.log(
        `  ok    ${label} — llm ${beforeLlm}→${ELEVENLABS_LLM_MODEL}, tts ${beforeTts}→${ELEVENLABS_TTS_MODEL}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ agentId, name: summary?.name, error: message });
      console.error(`  fail  ${label} — ${message}`);
    }

    await sleep(PAUSE_MS);
  }

  console.log("\n--- Summary ---");
  console.log(`Checked:   ${checked}`);
  console.log(`Migrated:  ${migrated}`);
  console.log(`Skipped:   ${skipped}`);
  console.log(`Failed:    ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed agent IDs:");
    for (const item of failed) {
      console.log(
        `  - ${item.agentId}${item.name ? ` (${item.name})` : ""}: ${item.error}`
      );
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
