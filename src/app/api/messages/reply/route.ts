import { NextResponse, type NextRequest } from "next/server";

import { mergeAgentChatDraft } from "@/lib/elevenlabs/chat-overrides";
import type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";
import {
  isTextAssistantEnabled,
  runTextAssistantTurn,
  TextAssistantUnavailableError,
  type TextChatTurn,
} from "@/lib/text-assistant/chat";
import type { TextChannelKind } from "@/lib/text-assistant/prompt";
import { listThreadMessages, saveChannelMessage } from "@/lib/messages/store";
import type { MessageChannelType } from "@/lib/messages/types";
import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp/send";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  agentId?: string;
  draft?: AgentChatDraft;
  channelType?: MessageChannelType;
  channelRef?: string;
  threadId?: string;
  message?: string;
  subject?: string;
  senderLabel?: string;
  senderAddress?: string;
}

function mapChannelToTextKind(
  channelType: MessageChannelType
): TextChannelKind {
  if (channelType === "whatsapp") return "whatsapp";
  return "email";
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
  const channelType = body.channelType;
  const channelRef = body.channelRef?.trim();
  const inbound = body.message?.trim();
  const threadId =
    body.threadId?.trim() ||
    (channelType && channelRef
      ? `${channelType}:${channelRef}:${body.senderAddress?.trim() || "thread"}`
      : "");

  if (!agentId || !channelType || !channelRef || !inbound || !threadId) {
    return NextResponse.json(
      { ok: false, error: "Unvollständige Anfrage." },
      { status: 400 }
    );
  }

  if (!(await isTextAssistantEnabled())) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "OpenAI ist nicht konfiguriert. Schriftliche Kanäle benötigen ENRICHMENT_API_KEY.",
      },
      { status: 503 }
    );
  }

  try {
    await requireUserId();
    const settings = await getSettings();
    const existing = (settings.agents ?? []).find((agent) => agent.id === agentId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Assistent nicht gefunden." },
        { status: 404 }
      );
    }

    const agent = mergeAgentChatDraft(existing, body.draft);

    await saveChannelMessage({
      channelType,
      channelRef,
      threadId,
      direction: "inbound",
      body: inbound,
      subject: body.subject,
      senderLabel: body.senderLabel,
      senderAddress: body.senderAddress,
    });

    const prior = await listThreadMessages(threadId);
    const history: TextChatTurn[] = prior
      .filter((entry) => entry.id)
      .slice(0, -1)
      .map((entry) => ({
        role: entry.direction === "inbound" ? "user" : "assistant",
        content: entry.body,
      }));

    const result = await runTextAssistantTurn({
      agent,
      history,
      userMessage: inbound,
      channel: mapChannelToTextKind(channelType),
    });

    const outbound = await saveChannelMessage({
      channelType,
      channelRef,
      threadId,
      direction: "outbound",
      body: result.reply,
      senderLabel: agent.name,
      preview: result.reply.slice(0, 160),
    });

    if (channelType === "whatsapp" && body.senderAddress?.trim()) {
      try {
        await sendWhatsAppTextMessage({
          to: body.senderAddress.trim(),
          body: result.reply,
        });
      } catch (sendError) {
        console.warn("[messages/reply] WhatsApp send:", sendError);
      }
    }

    return NextResponse.json({
      ok: true,
      reply: result.reply,
      outboundMessageId: outbound.id,
      provider: "openai",
      goalCompleted: result.goalCompleted,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    if (error instanceof TextAssistantUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    console.error("[messages/reply]", error);
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
