import { NextResponse, type NextRequest } from "next/server";

import type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";
import { mergeAgentChatDraft } from "@/lib/elevenlabs/chat-overrides";
import { applyEuComplianceGreeting } from "@/lib/elevenlabs/compliance";
import {
  isTextAssistantEnabled,
  runTextAssistantTurn,
  TextAssistantUnavailableError,
  type TextChatTurn,
} from "@/lib/text-assistant/chat";
import type { TextChannelKind } from "@/lib/text-assistant/prompt";
import { getSettings } from "@/lib/store";
import {
  PHONE_NUMBER_REQUIRED_MESSAGE,
  userHasPhoneNumbers,
} from "@/lib/phone/numbers";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  agentId?: string;
  draft?: AgentChatDraft;
  history?: TextChatTurn[];
  userMessage?: string;
  channel?: TextChannelKind;
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
  const userMessage = body.userMessage?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "Agent nicht gefunden." },
      { status: 400 }
    );
  }

  if (!(await isTextAssistantEnabled())) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "OpenAI ist nicht konfiguriert. Bitte ENRICHMENT_API_KEY hinterlegen — schriftliche Kanäle nutzen gpt-4o-mini statt ElevenLabs.",
      },
      { status: 503 }
    );
  }

  try {
    const userId = await requireUserId();
    if (!(await userHasPhoneNumbers(userId))) {
      return NextResponse.json(
        { ok: false, error: PHONE_NUMBER_REQUIRED_MESSAGE },
        { status: 403 }
      );
    }

    const settings = await getSettings();
    const existing = (settings.agents ?? []).find((agent) => agent.id === agentId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Assistent nicht gefunden." },
        { status: 404 }
      );
    }

    const agent = mergeAgentChatDraft(existing, body.draft);
    const greeting = applyEuComplianceGreeting(
      agent.greeting,
      Boolean(agent.euComplianceEnabled)
    );

    if (!userMessage || userMessage === "__init__") {
      return NextResponse.json({
        ok: true,
        greeting,
        provider: "openai",
      });
    }

    const history = (body.history ?? []).filter(
      (turn) =>
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.content === "string" &&
        turn.content.trim().length > 0
    );

    const result = await runTextAssistantTurn({
      agent,
      history,
      userMessage,
      channel: body.channel ?? "chat",
      userId,
    });

    return NextResponse.json({
      ok: true,
      reply: result.reply,
      history: result.history,
      goalCompleted: result.goalCompleted,
      bookedAppointment: result.bookedAppointment,
      greeting,
      provider: "openai",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    if (error instanceof TextAssistantUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    console.error("[text-assistant/chat]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Antwort konnte nicht erstellt werden.",
      },
      { status: 500 }
    );
  }
}
