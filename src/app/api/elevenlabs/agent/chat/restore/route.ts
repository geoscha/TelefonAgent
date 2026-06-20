import { NextResponse, type NextRequest } from "next/server";

import { buildLiveAgentConversationConfig } from "@/lib/elevenlabs/agent-sync";
import {
  describeElevenLabsError,
  getElevenLabsClient,
  hasApiKey,
} from "@/lib/elevenlabs/client";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Restores phone-agent settings after a chat test session. */
export async function POST(req: NextRequest) {
  let body: { agentId?: string };
  try {
    body = (await req.json()) as { agentId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "Agent nicht gefunden." },
      { status: 400 }
    );
  }

  if (!hasApiKey()) {
    return NextResponse.json({ ok: true });
  }

  try {
    await requireUserId();
    const settings = await getSettings();
    const existing = (settings.agents ?? []).find((a) => a.id === agentId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Agent nicht gefunden." },
        { status: 404 }
      );
    }

    const client = getElevenLabsClient();
    const conversationConfig = buildLiveAgentConversationConfig(existing);

    await client.conversationalAi.agents.update(agentId, {
      name: existing.name,
      conversationConfig,
    } as Parameters<typeof client.conversationalAi.agents.update>[1]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
