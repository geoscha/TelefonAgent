/**
 * One-off: re-sync all owned ElevenLabs agents using the production webhook URL.
 *
 * Re-registers appointment webhook tools at the public prod URL (instead of a
 * stale localhost/tunnel URL) and pushes the current prompt/config (date,
 * tokens, call duration). This is exactly what saving the agent in the
 * production web app does.
 *
 * Usage: SITE_URL=https://telefon-agent-one.vercel.app \
 *   node --conditions=react-server --import tsx scripts/resync-agents.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

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
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
  } catch {
    /* optional */
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

type AgentSummary = { agent_id?: string; agentId?: string; name?: string };
type ListAgentsResponse = {
  agents?: AgentSummary[];
  next_cursor?: string | null;
  has_more?: boolean;
};

async function listAllAgents(apiKey: string): Promise<AgentSummary[]> {
  const agents: AgentSummary[] = [];
  let cursor: string | undefined;
  do {
    const params = new URLSearchParams({ page_size: String(PAGE_SIZE) });
    if (cursor) params.set("cursor", cursor);
    const res = await fetch(`${API_BASE}/convai/agents?${params.toString()}`, {
      headers: { "xi-api-key": apiKey },
    });
    if (!res.ok) {
      throw new Error(`list agents → ${res.status}: ${await res.text()}`);
    }
    const page = (await res.json()) as ListAgentsResponse;
    agents.push(...(page.agents ?? []));
    cursor = page.has_more && page.next_cursor ? page.next_cursor : undefined;
    if (cursor) await sleep(PAUSE_MS);
  } while (cursor);
  return agents;
}

async function main(): Promise<void> {
  loadEnvLocal();

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    console.error("ELEVENLABS_API_KEY fehlt (.env.local oder Umgebung).");
    process.exit(1);
  }
  const siteUrl = (
    process.env.SITE_URL || "https://telefon-agent-one.vercel.app"
  ).replace(/\/$/, "");

  const { getElevenLabsClient } = await import("../src/lib/elevenlabs/client");
  const { syncAgentConversationConfig } = await import(
    "../src/lib/elevenlabs/agent-sync"
  );
  const { getUserIdByAgentId, getSettingsForUser } = await import(
    "../src/lib/store"
  );

  console.log(`Re-syncing agents with webhook base ${siteUrl} …`);
  const summaries = await listAllAgents(apiKey);
  console.log(`Found ${summaries.length} ElevenLabs agent(s).`);

  const client = getElevenLabsClient();
  let synced = 0;
  let skipped = 0;
  const failed: { agentId: string; error: string }[] = [];

  for (const summary of summaries) {
    const agentId = summary.agent_id ?? summary.agentId;
    if (!agentId) continue;
    const label = summary.name ? `${summary.name} (${agentId})` : agentId;
    try {
      const userId = await getUserIdByAgentId(agentId);
      if (!userId) {
        skipped += 1;
        console.log(`  skip  ${label} — not owned in app DB`);
        continue;
      }
      const settings = await getSettingsForUser(userId);
      const agent = settings.agents?.find((a) => a.id === agentId);
      if (!agent) {
        skipped += 1;
        console.log(`  skip  ${label} — no stored agent`);
        continue;
      }
      await syncAgentConversationConfig(client, agent, { siteUrl });
      synced += 1;
      console.log(
        `  ok    ${label} — booking=${Boolean(agent.appointmentBookingEnabled)}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failed.push({ agentId, error: message });
      console.error(`  fail  ${label} — ${message}`);
    }
    await sleep(PAUSE_MS);
  }

  console.log("\n--- Summary ---");
  console.log(`Synced:  ${synced}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Failed:  ${failed.length}`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
