import { NextResponse } from "next/server";

import {
  listSupportMessagesForUser,
  sendSupportMessage,
} from "@/lib/support/messages";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const messages = await listSupportMessagesForUser(userId);
    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[support GET]", error);
    return NextResponse.json(
      { error: "Nachrichten konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const body = (await req.json()) as { message?: string };
    const message = body.message?.trim();

    if (!message) {
      return NextResponse.json(
        { error: "Bitte eine Nachricht eingeben." },
        { status: 400 }
      );
    }

    const created = await sendSupportMessage(userId, message);
    return NextResponse.json({ ok: true, message: created });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[support POST]", error);
    return NextResponse.json(
      { error: "Nachricht konnte nicht gesendet werden." },
      { status: 500 }
    );
  }
}
