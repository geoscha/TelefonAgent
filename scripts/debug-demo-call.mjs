#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m || process.env[m[1]]) continue;
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
if (!apiKey) {
  console.error("ELEVENLABS_API_KEY missing");
  process.exit(1);
}

const DEMO = "+41445054632";

async function el(path, opts = {}) {
  const res = await fetch(`https://api.elevenlabs.io${path}`, {
    ...opts,
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, json };
}

const phones = await el("/v1/convai/phone-numbers");
console.log("\n=== PHONES ===");
for (const p of phones.json ?? []) {
  const match = p.phone_number === DEMO || p.phoneNumber === DEMO ? " <-- DEMO" : "";
  console.log(
    JSON.stringify(
      {
        id: p.phone_number_id ?? p.phoneNumberId,
        number: p.phone_number ?? p.phoneNumber,
        provider: p.provider,
        assignedAgent: p.assigned_agent?.agent_id ?? p.assignedAgent?.agentId,
        supportsOutbound: p.supports_outbound ?? p.supportsOutbound,
        hasOutboundTrunk: Boolean(p.outbound_trunk ?? p.outboundTrunk),
      },
      null,
      0
    ) + match
  );
}

const demoPhone = (phones.json ?? []).find(
  (p) => (p.phone_number ?? p.phoneNumber) === DEMO
);
if (!demoPhone) {
  console.error("\nDemo phone not found in workspace:", DEMO);
  process.exit(1);
}

const phoneId = demoPhone.phone_number_id ?? demoPhone.phoneNumberId;
const phoneDetail = await el(`/v1/convai/phone-numbers/${phoneId}`);
console.log("\n=== DEMO PHONE DETAIL ===");
console.log(JSON.stringify(phoneDetail.json, null, 2));

const agents = await el("/v1/convai/agents");
const demoAgent = (agents.json?.agents ?? []).find(
  (a) =>
    a.name?.includes("Live-Demo") ||
    a.tags?.includes("cura-demo") ||
    a.name === "Cura Live-Demo (Lea)"
);
console.log("\n=== DEMO AGENT ===");
if (demoAgent) {
  const detail = await el(`/v1/convai/agents/${demoAgent.agent_id ?? demoAgent.agentId}`);
  const cfg = detail.json?.conversation_config ?? detail.json?.conversationConfig;
  console.log({
    id: demoAgent.agent_id ?? demoAgent.agentId,
    name: demoAgent.name,
    firstMessage:
      cfg?.agent?.first_message ?? cfg?.agent?.firstMessage ?? "(missing)",
    language: cfg?.agent?.language,
    voiceId: cfg?.tts?.voice_id ?? cfg?.tts?.voiceId,
    modelId: cfg?.tts?.model_id ?? cfg?.tts?.modelId,
  });
} else {
  console.log("No demo agent found");
}

if (demoAgent) {
  const agentId = demoAgent.agent_id ?? demoAgent.agentId;
  const detail = await el(`/v1/convai/agents/${agentId}`);
  console.log("\n=== DEMO AGENT WORKFLOW ===");
  console.log(
    JSON.stringify(
      {
        hasWorkflow: Boolean(detail.json?.workflow),
        workflowNodes: detail.json?.workflow?.nodes?.length ?? 0,
        overrides: detail.json?.platform_settings?.overrides,
      },
      null,
      2
    )
  );
}

const convRes = await el(
  "/v1/convai/conversations?agent_id=" +
    encodeURIComponent(demoAgent?.agent_id ?? demoAgent?.agentId ?? "") +
    "&page_size=3"
);
console.log("\n=== RECENT CONVERSATIONS ===");
for (const c of convRes.json?.conversations ?? []) {
  console.log(
    JSON.stringify({
      id: c.conversation_id,
      status: c.status,
      direction: c.direction,
      duration: c.call_duration_secs,
      termination: c.termination_reason,
    })
  );
  if (process.argv.includes("--conv-detail")) {
    const d = await el(`/v1/convai/conversations/${c.conversation_id}`);
    console.log(
      JSON.stringify(
        {
          status: d.json?.status,
          metadata: d.json?.metadata,
          analysis: d.json?.analysis,
          hasTranscript: Boolean(d.json?.transcript?.length),
        },
        null,
        2
      )
    );
  }
}

console.log("\nDone. Pass --test +number to place a test outbound call.");

const testTo = process.argv.find((a) => a.startsWith("+"));
if (testTo && process.argv.includes("--test")) {
  const agentId = demoAgent?.agent_id ?? demoAgent?.agentId;
  if (!agentId) {
    console.error("No demo agent");
    process.exit(1);
  }
  const provider = demoPhone.provider ?? "twilio";
  const path =
    provider === "sip_trunk"
      ? "/v1/convai/sip-trunk/outbound-call"
      : "/v1/convai/twilio/outbound-call";
  console.log(`\n=== OUTBOUND TEST via ${path} to ${testTo} ===`);
  const res = await el(path, {
    method: "POST",
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneId,
      to_number: testTo,
      telephony_call_config: { ringing_timeout_secs: 30 },
    }),
  });
  console.log(JSON.stringify(res, null, 2));
}
