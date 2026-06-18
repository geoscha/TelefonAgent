import { NextResponse, type NextRequest } from "next/server";

import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";
import { getSettings, updateSettings } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("id")?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "Agent-ID fehlt." },
      { status: 400 }
    );
  }

  try {
    const settings = await getSettings();
    const agents = settings.agents ?? [];
    const target = agents.find((a) => a.id === agentId);
    if (!target) {
      return NextResponse.json(
        { ok: false, error: "Agent nicht gefunden." },
        { status: 404 }
      );
    }

    try {
      const client = getElevenLabsClient();
      await client.conversationalAi.agents.delete(agentId);
    } catch (err) {
      console.warn(`[agent/delete] ElevenLabs delete ${agentId}:`, err);
    }

    const remaining = agents.filter((a) => a.id !== agentId);
    const wasActive = settings.agentId === agentId;
    const nextActive = remaining[0];

    const updated = await updateSettings({
      agents: remaining,
      ...(wasActive
        ? nextActive
          ? {
              agentId: nextActive.id,
              agentName: nextActive.name,
              voiceId: nextActive.voiceId,
              voiceName: nextActive.voiceName,
              language: nextActive.language,
              greeting: nextActive.greeting,
              systemPrompt: nextActive.systemPrompt,
            }
          : {
              agentId: undefined,
              agentName: undefined,
              voiceId: undefined,
              voiceName: undefined,
              greeting: undefined,
              systemPrompt: undefined,
            }
        : {}),
    });

    return NextResponse.json({
      ok: true,
      settings: updated,
      agents: remaining,
    });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
