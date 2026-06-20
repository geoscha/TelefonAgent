import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";

import {
  appleConnect,
  googleAuthUrl,
  isConfigured,
  microsoftAuthUrl,
  ensureSingleCalendarConnection,
} from "@/lib/calendar";
import { upsertCalendar, type CalendarProvider } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OAUTH_PROVIDERS = new Set<CalendarProvider>(["google", "microsoft"]);

/** Starts OAuth for Google / Microsoft. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;
  const provider = raw as CalendarProvider;

  if (!OAUTH_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { ok: false, error: "Dieser Anbieter nutzt kein OAuth." },
      { status: 400 }
    );
  }

  if (!isConfigured(provider)) {
    return NextResponse.json(
      {
        ok: false,
        error: `${provider === "google" ? "Google" : "Microsoft"} ist noch nicht konfiguriert.`,
      },
      { status: 503 }
    );
  }

  try {
    await requireUserId();
  } catch {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/login?next=/integrationen`
    );
  }

  const state = randomBytes(16).toString("hex");
  const authUrl =
    provider === "google" ? googleAuthUrl(state) : microsoftAuthUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(`oauth_state_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

/** Apple: connect with an Apple ID + app-specific password (no redirect). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;

  if (raw !== "apple") {
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
    await ensureSingleCalendarConnection("apple");
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
