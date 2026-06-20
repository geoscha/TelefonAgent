import { NextResponse, type NextRequest } from "next/server";

import {
  isSupportAssistantEnabled,
  runSupportAssistantTurn,
  SupportAssistantUnavailableError,
  type SupportChatTurn,
} from "@/lib/support/assistant";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  history?: SupportChatTurn[];
  userMessage?: string;
}

const SUPPORT_GREETING =
  "Hallo! Ich bin der Linker-Support-Assistent. Ich beantworte Fragen zu Linker und zu Ihrer Einrichtung, kann Sie zu den passenden Seiten führen und Sie bei Bedarf an einen Menschen weiterleiten. Wie kann ich helfen?";

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

  try {
    const userId = await requireUserId();

    const userMessage = body.userMessage?.trim();
    if (!userMessage || userMessage === "__init__") {
      return NextResponse.json({ ok: true, greeting: SUPPORT_GREETING });
    }

    if (!(await isSupportAssistantEnabled())) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Der Support-Assistent ist gerade nicht verfügbar. Bitte versuchen Sie es später erneut oder nutzen Sie «Mit einem Menschen sprechen».",
        },
        { status: 503 }
      );
    }

    const history = (body.history ?? []).filter(
      (turn) =>
        (turn.role === "user" || turn.role === "assistant") &&
        typeof turn.content === "string" &&
        turn.content.trim().length > 0
    );

    const result = await runSupportAssistantTurn({
      userId,
      history,
      userMessage,
    });

    return NextResponse.json({
      ok: true,
      reply: result.reply,
      navigation: result.navigation ?? null,
      escalated: result.escalated,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    if (error instanceof SupportAssistantUnavailableError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 503 });
    }
    console.error("[support/chat]", error);
    return NextResponse.json(
      { ok: false, error: "Antwort konnte nicht erstellt werden." },
      { status: 500 }
    );
  }
}
