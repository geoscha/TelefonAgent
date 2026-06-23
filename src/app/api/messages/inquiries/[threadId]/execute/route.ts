import { NextResponse, type NextRequest } from "next/server";

import {
  executeMessageInquiry,
  sendThreadReply,
} from "@/lib/messages/inquiry-execute";
import { getInquiryByThreadId, upsertInquiry } from "@/lib/messages/inquiry-store";
import type { CraftsmanEmailDraft } from "@/lib/messages/inquiry-types";
import { listThreadMessages } from "@/lib/messages/store";
import { threadAwaitingReply } from "@/lib/messages/thread-status";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
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

  let body: {
    draftReply?: string;
    craftsmanDrafts?: CraftsmanEmailDraft[];
    actionIds?: string[];
    craftsmanDraftIds?: string[];
    sendCustomerReply?: boolean;
  };
  try {
    body = (await req.json()) as {
      draftReply?: string;
      craftsmanDrafts?: CraftsmanEmailDraft[];
      actionIds?: string[];
      craftsmanDraftIds?: string[];
      sendCustomerReply?: boolean;
    };
  } catch {
    body = {};
  }

  try {
    const userId = await requireUserId();
    const messages = await listThreadMessages(threadId);
    if (messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Unterhaltung nicht gefunden." },
        { status: 404 }
      );
    }

    if (!threadAwaitingReply(messages, threadId)) {
      return NextResponse.json(
        { ok: false, error: "Diese Unterhaltung wurde bereits beantwortet." },
        { status: 400 }
      );
    }

    const inquiry = await getInquiryByThreadId(threadId);
    const draftReply = body.draftReply?.trim() || inquiry?.draftReply?.trim() || "";
    const craftsmanDrafts = body.craftsmanDrafts ?? inquiry?.craftsmanDrafts ?? [];
    const hasCustomerReply = Boolean(draftReply) && body.sendCustomerReply !== false;
    const hasCraftsmanMail = craftsmanDrafts.some(
      (draft) =>
        draft.recipientEmail?.trim() &&
        draft.body?.trim() &&
        draft.subject?.trim() &&
        draft.status !== "sent" &&
        (!body.craftsmanDraftIds?.length || body.craftsmanDraftIds.includes(draft.id))
    );
    const hasSelectedActions = Boolean(body.actionIds?.length);

    if (!hasCustomerReply && !hasCraftsmanMail && !hasSelectedActions) {
      return NextResponse.json(
        { ok: false, error: "Kein Antwort- oder Handwerker-Entwurf vorhanden." },
        { status: 400 }
      );
    }

    if (inquiry?.actionable) {
      const result = await executeMessageInquiry({
        inquiry,
        messages,
        draftReply,
        craftsmanDrafts,
        actionIds: body.actionIds,
        craftsmanDraftIds: body.craftsmanDraftIds,
        sendCustomerReply: body.sendCustomerReply,
        userId,
      });

      const saved = await upsertInquiry({
        ...result.inquiry,
        draftReply: draftReply || result.inquiry.draftReply,
        craftsmanDrafts: result.inquiry.craftsmanDrafts ?? [],
        matchedCustomers: result.inquiry.matchedCustomers ?? [],
        workflowCaseId: result.inquiry.workflowCaseId,
      });

      return NextResponse.json({
        ok: true,
        inquiry: saved,
        sent: result.sent,
        sentCraftsmanEmails: result.sentCraftsmanEmails,
        executedActions: result.executedActions,
        errors: result.errors,
      });
    }

    const channelType = messages[0].channelType;
    const channelRef = messages[0].channelRef;
    const sent = await sendThreadReply({
      inquiry: {
        channelType,
        channelRef,
        threadId,
      },
      messages,
      draftReply,
    });

    if (inquiry) {
      await upsertInquiry({
        ...inquiry,
        draftReply,
        status: "resolved",
        resolvedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      ok: true,
      sent,
      executedActions: 0,
      errors: sent ? [] : ["Antwort konnte nicht versendet werden."],
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[messages/inquiries/execute]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Anfrage konnte nicht umgesetzt werden.",
      },
      { status: 500 }
    );
  }
}
