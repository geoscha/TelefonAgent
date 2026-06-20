import { NextResponse, type NextRequest } from "next/server";

import { buildCallFromTextChat } from "@/lib/calls/build-text-chat-call";
import {
  PHONE_NUMBER_REQUIRED_MESSAGE,
  userHasPhoneNumbers,
} from "@/lib/phone/numbers";
import { getSettings, updateStoredCall } from "@/lib/store";
import type { BookedAppointmentInfo } from "@/lib/text-assistant/types";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  sessionId?: string;
  agentId?: string;
  agentName?: string;
  startedAt?: string;
  messages?: Array<{ role?: string; content?: string }>;
  bookedAppointment?: BookedAppointmentInfo;
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

  const sessionId = body.sessionId?.trim();
  const agentId = body.agentId?.trim();
  const startedAt = body.startedAt?.trim();

  if (!sessionId || !agentId || !startedAt) {
    return NextResponse.json(
      { ok: false, error: "sessionId, agentId und startedAt sind erforderlich." },
      { status: 400 }
    );
  }

  const messages = (body.messages ?? [])
    .filter(
      (entry) =>
        (entry.role === "user" || entry.role === "agent") &&
        typeof entry.content === "string" &&
        entry.content.trim().length > 0
    )
    .map((entry) => ({
      role: entry.role as "user" | "agent",
      content: entry.content!.trim(),
    }));

  if (messages.length === 0) {
    return NextResponse.json({ ok: true, skipped: true });
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
    const agent = (settings.agents ?? []).find((entry) => entry.id === agentId);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "Assistent nicht gefunden." },
        { status: 404 }
      );
    }

    const call = buildCallFromTextChat({
      sessionId,
      agentId,
      agentName: body.agentName?.trim() || agent.name,
      startedAt,
      messages,
      bookedAppointment: body.bookedAppointment,
    });

    await updateStoredCall(call);

    return NextResponse.json({
      ok: true,
      callId: call.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[text-assistant/chat/complete]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Chat konnte nicht gespeichert werden.",
      },
      { status: 500 }
    );
  }
}
