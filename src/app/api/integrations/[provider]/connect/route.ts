import { NextResponse, type NextRequest } from "next/server";

import { appleConnect } from "@/lib/calendar";
import { upsertCalendar } from "@/lib/store";

export const dynamic = "force-dynamic";

/** OAuth providers (Google / Microsoft) — not available in the current release. */
export async function GET() {
  return NextResponse.json(
    { ok: false, error: "Dieser Anbieter ist derzeit nicht verfügbar." },
    { status: 403 }
  );
}

/** Apple: connect with an Apple ID + app-specific password (no redirect). */
export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  if (params.provider !== "apple") {
    return NextResponse.json(
      { ok: false, error: "Nur Apple wird per Formular verbunden." },
      { status: 400 }
    );
  }

  let body: { appleId?: string; appPassword?: string; calendarUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const appleId = body.appleId?.trim();
  const appPassword = body.appPassword?.replace(/[\s-]/g, "");
  if (!appleId || !appPassword) {
    return NextResponse.json(
      {
        ok: false,
        error: "Bitte Apple-ID und App-spezifisches Passwort angeben.",
      },
      { status: 400 }
    );
  }

  try {
    const patch = await appleConnect(appleId, appPassword, body.calendarUrl);
    const conn = await upsertCalendar("apple", patch);
    return NextResponse.json({
      ok: true,
      connection: { connected: true, accountLabel: conn.accountLabel },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Verbindung mit iCloud fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
