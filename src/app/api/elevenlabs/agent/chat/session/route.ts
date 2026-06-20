import { NextResponse, type NextRequest } from "next/server";

import { mergeAgentChatDraft } from "@/lib/elevenlabs/chat-overrides";
import type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";
import { syncAgentConversationConfig } from "@/lib/elevenlabs/agent-sync";
import {
  describeElevenLabsError,
  getElevenLabsClient,
  hasApiKey,
} from "@/lib/elevenlabs/client";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  agentId?: string;
  draft?: AgentChatDraft;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
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
    return NextResponse.json(
      {
        ok: false,
        error:
          "Kein ElevenLabs API-Schlüssel hinterlegt. Bitte zuerst verbinden.",
      },
      { status: 400 }
    );
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

    const merged = mergeAgentChatDraft(existing, body.draft);
    const client = getElevenLabsClient();

    try {
      await syncAgentConversationConfig(client, merged, { chatMode: true });
    } catch (syncError) {
      console.error("[chat/session] agent sync failed:", syncError);
    }

    const signed = (await client.conversationalAi.conversations.getSignedUrl({
      agentId,
    })) as { signedUrl?: string };

    const signedUrl = signed.signedUrl;
    if (!signedUrl) {
      return NextResponse.json(
        { ok: false, error: "Chat-Sitzung konnte nicht gestartet werden." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      signedUrl,
      overrides: {
        conversation: { textOnly: true },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
