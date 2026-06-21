import { NextResponse, type NextRequest } from "next/server";

import {
  ensureInquiryAnalyzed,
  resolveDefaultAgent,
} from "@/lib/messages/inquiry-service";
import type { CraftsmanEmailDraft } from "@/lib/messages/inquiry-types";
import {
  getInquiryByThreadId,
  updateInquiryDraft,
} from "@/lib/messages/inquiry-store";
import {
  listThreadMessages,
  markThreadRead,
} from "@/lib/messages/store";
import {
  inquiryNeedsReanalysis,
  threadAwaitingReply,
} from "@/lib/messages/thread-status";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const threadId = params.threadId?.trim();
  if (!threadId) {
    return NextResponse.json(
      { ok: false, error: "Unterhaltung nicht gefunden." },
      { status: 400 }
    );
  }

  try {
    await requireUserId();
    const messages = await listThreadMessages(threadId);
    if (messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Unterhaltung nicht gefunden." },
        { status: 404 }
      );
    }

    const settings = await getSettings();
    const agent = resolveDefaultAgent(settings.agents, settings.agentId);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "Kein KI-Assistent konfiguriert." },
        { status: 400 }
      );
    }

    let inquiry = await getInquiryByThreadId(threadId);
    const awaiting = threadAwaitingReply(messages, threadId);

    if (awaiting && agent) {
      inquiry = await ensureInquiryAnalyzed({
        thread: {
          id: threadId,
          channelId: `${messages[0].channelType}:${messages[0].channelRef}`,
          title:
            messages[0].senderLabel || messages[0].senderAddress || "Anfrage",
          preview: messages.at(-1)?.preview || messages.at(-1)?.body || "",
          lastMessageAt:
            messages.at(-1)?.receivedAt || new Date().toISOString(),
          unreadCount: messages.filter((message) => !message.read).length,
        },
        messages,
        agent,
        force:
          !inquiry?.analyzedAt ||
          inquiry.status === "resolved" ||
          inquiryNeedsReanalysis(inquiry?.analyzedAt, messages, threadId),
      });
    }

    await markThreadRead(threadId);

    return NextResponse.json({
      ok: true,
      inquiry,
      messages,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[messages/inquiries/detail]", error);
    return NextResponse.json(
      { ok: false, error: "Anfrage konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const threadId = params.threadId?.trim();
  if (!threadId) {
    return NextResponse.json(
      { ok: false, error: "Unterhaltung nicht gefunden." },
      { status: 400 }
    );
  }

  let body: { draftReply?: string; craftsmanDrafts?: CraftsmanEmailDraft[] };
  try {
    body = (await req.json()) as {
      draftReply?: string;
      craftsmanDrafts?: CraftsmanEmailDraft[];
    };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const draftReply = body.draftReply?.trim();
  const craftsmanDrafts = body.craftsmanDrafts;
  if (!draftReply && !craftsmanDrafts) {
    return NextResponse.json(
      { ok: false, error: "Keine Entwürfe zum Speichern." },
      { status: 400 }
    );
  }

  try {
    await requireUserId();
    const inquiry = await updateInquiryDraft(threadId, {
      ...(draftReply ? { draftReply } : {}),
      ...(craftsmanDrafts ? { craftsmanDrafts } : {}),
    });
    if (!inquiry) {
      return NextResponse.json(
        { ok: false, error: "Anfrage nicht gefunden." },
        { status: 404 }
      );
    }
    return NextResponse.json({ ok: true, inquiry });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    return NextResponse.json(
      { ok: false, error: "Entwurf konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}
