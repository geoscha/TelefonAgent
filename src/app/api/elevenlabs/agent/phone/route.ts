import { NextResponse, type NextRequest } from "next/server";

import { describeElevenLabsError, getElevenLabsClient } from "@/lib/elevenlabs/client";
import { syncAgentConversationConfig } from "@/lib/elevenlabs/agent-sync";
import {
  linkAgentToPhone,
  unlinkPhoneRecordFromElevenLabs,
} from "@/lib/elevenlabs/sync-agent";
import { completeAgentOnboarding } from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { getSettings, updateSettings, type StoredAgent } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Clears or assigns a phone number for an agent. Empty value removes the number and deactivates the agent. */
export async function POST(req: NextRequest) {
  let body: { agentId?: string; phoneNumberId?: string };
  try {
    body = (await req.json()) as { agentId?: string; phoneNumberId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "Agent-ID fehlt." },
      { status: 400 }
    );
  }

  try {
    const userId = await requireUserId();
    const settings = await getSettings();
    const phones = await listUserPhoneNumbers(userId);
    const agents = settings.agents ?? [];

    if (!agents.some((a) => a.id === agentId)) {
      return NextResponse.json(
        { ok: false, error: "Agent nicht gefunden." },
        { status: 404 }
      );
    }

    const phoneNumberId = body.phoneNumberId?.trim() || null;

    if (!phoneNumberId) {
      const currentAgent = agents.find((a) => a.id === agentId);
      const previousPhoneId = currentAgent?.phoneNumberId;
      const wasActive = settings.agentId === agentId;

      const updatedAgents: StoredAgent[] = agents.map((a) =>
        a.id === agentId ? { ...a, phoneNumberId: undefined } : a
      );

      const updated = await updateSettings({
        agents: updatedAgents,
        ...(wasActive
          ? {
              agentId: undefined,
              agentName: undefined,
            }
          : {}),
      });

      if (previousPhoneId) {
        await unlinkPhoneRecordFromElevenLabs(userId, previousPhoneId).catch(
          (err) => console.warn("[agent/phone] unlink skipped:", err)
        );
      }

      return NextResponse.json({
        ok: true,
        settings: updated,
        agents: updatedAgents,
      });
    }

    if (!phones.some((p) => p.id === phoneNumberId)) {
      return NextResponse.json(
        { ok: false, error: "Telefonnummer nicht gefunden." },
        { status: 404 }
      );
    }

    const ownerConflict = agents.find(
      (a) => a.id !== agentId && a.phoneNumberId === phoneNumberId
    );
    if (ownerConflict) {
      return NextResponse.json(
        {
          ok: false,
          error: `Diese Nummer ist bereits ${ownerConflict.name} zugewiesen.`,
        },
        { status: 409 }
      );
    }

    const updatedAgents: StoredAgent[] = agents.map((a) =>
      a.id === agentId ? { ...a, phoneNumberId } : a
    );

    const agent = updatedAgents.find((a) => a.id === agentId);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "Agent nicht gefunden." },
        { status: 404 }
      );
    }

    let updated = await updateSettings({
      agents: updatedAgents,
      agentId,
      agentName: agent.name,
      voiceId: agent.voiceId,
      voiceName: agent.voiceName,
      language: agent.language,
      greeting: agent.greeting,
      systemPrompt: agent.systemPrompt,
      lastSync: new Date().toISOString(),
    });

    if (updated.onboardingPhase === "agent") {
      updated = await completeAgentOnboarding();
    }

    await linkAgentToPhone(userId, agentId, phoneNumberId);

    try {
      const client = getElevenLabsClient();
      await syncAgentConversationConfig(client, agent);
    } catch (err) {
      console.warn("[agent/phone] agent sync skipped:", err);
    }

    return NextResponse.json({ ok: true, settings: updated, agents: updatedAgents });
  } catch (error) {
    console.error("[agent/phone]", error);
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
