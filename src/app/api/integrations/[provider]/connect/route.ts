import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";

import { appleConnect, isConfigured, oauthAuthUrl } from "@/lib/calendar";
import { APP_URL } from "@/lib/calendar/config";
import { upsertCalendar, type CalendarProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

/** OAuth providers: start the redirect flow (Google / Microsoft). */
export async function GET(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as CalendarProvider;

  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.json(
      { ok: false, error: "Dieser Anbieter nutzt kein OAuth." },
      { status: 400 }
    );
  }
  if (!isConfigured(provider)) {
    return NextResponse.redirect(
      `${APP_URL}/integrations?error=not_configured&provider=${provider}`
    );
  }

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(oauthAuthUrl(provider, state));
  res.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: APP_URL.startsWith("https"),
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
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
  const appPassword = body.appPassword?.trim();
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
