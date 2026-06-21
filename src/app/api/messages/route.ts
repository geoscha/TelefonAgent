import { NextResponse, type NextRequest } from "next/server";

import { syncGmailInbox } from "@/lib/integrations/mail/gmail-sync";
import {
  listThreadMessages,
  listThreadsForChannel,
  markThreadRead,
} from "@/lib/messages/store";
import type { MessageChannelType } from "@/lib/messages/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<MessageChannelType>([
  "gmail",
  "outlook",
  "apple_mail",
  "whatsapp",
]);

export async function GET(req: NextRequest) {
  const channelType = req.nextUrl.searchParams.get(
    "channelType"
  ) as MessageChannelType | null;
  const channelRef = req.nextUrl.searchParams.get("channelRef")?.trim();
  const threadId = req.nextUrl.searchParams.get("threadId")?.trim();

  try {
    if (threadId) {
      const messages = await listThreadMessages(threadId);
      return NextResponse.json({ ok: true, messages });
    }

    if (!channelType || !channelRef || !VALID_TYPES.has(channelType)) {
      return NextResponse.json(
        { ok: false, error: "Kanal nicht angegeben." },
        { status: 400 }
      );
    }

    let payload = await listThreadsForChannel({ channelType, channelRef });

    if (channelType === "gmail") {
      if (payload.threads.length === 0) {
        // Nothing mirrored yet — fetch once so the first visit isn't empty.
        try {
          await syncGmailInbox();
          payload = await listThreadsForChannel({ channelType, channelRef });
        } catch (error) {
          console.error("[messages] gmail initial sync:", error);
        }
      } else {
        // Serve the last sync instantly; refresh Gmail in the background.
        void syncGmailInbox().catch((error) =>
          console.error("[messages] gmail background sync:", error)
        );
      }
    }

    return NextResponse.json({ ok: true, ...payload });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[messages]", error);
    return NextResponse.json(
      { ok: false, error: "Nachrichten konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: { threadId?: string };
  try {
    body = (await req.json()) as { threadId?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const threadId = body.threadId?.trim();
  if (!threadId) {
    return NextResponse.json(
      { ok: false, error: "Unterhaltung nicht gefunden." },
      { status: 400 }
    );
  }

  try {
    await markThreadRead(threadId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[messages/mark-read]", error);
    return NextResponse.json(
      { ok: false, error: "Status konnte nicht gespeichert werden." },
      { status: 500 }
    );
  }
}
