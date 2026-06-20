import { NextResponse } from "next/server";
import { randomBytes } from "crypto";

import { isMailConfigured } from "@/lib/integrations/mail/config";
import { gmailAuthUrl } from "@/lib/integrations/mail/gmail";
import { outlookAuthUrl } from "@/lib/integrations/mail/outlook";
import { appleMailConnect } from "@/lib/integrations/mail/apple-mail";
import {
  ensureSingleMailConnection,
  upsertMailConnection,
} from "@/lib/integrations/mail/store";
import type { MailProviderId } from "@/lib/integrations/mail/provider-meta";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const OAUTH_PROVIDERS = new Set<MailProviderId>(["gmail", "outlook"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;
  const provider = raw as MailProviderId;

  if (!OAUTH_PROVIDERS.has(provider)) {
    return NextResponse.json(
      { ok: false, error: "Dieser Anbieter nutzt kein OAuth." },
      { status: 400 }
    );
  }

  if (!isMailConfigured(provider)) {
    return NextResponse.json(
      {
        ok: false,
        error: `${provider === "gmail" ? "Gmail" : "Outlook"} ist noch nicht konfiguriert.`,
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
    provider === "gmail" ? gmailAuthUrl(state) : outlookAuthUrl(state);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(`oauth_state_mail_${provider}`, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return res;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;

  if (raw !== "apple_mail") {
    return NextResponse.json(
      { ok: false, error: "Nur Apple Mail wird per Formular verbunden." },
      { status: 400 }
    );
  }

  let body: { appleId?: string; appPassword?: string };
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
    await ensureSingleMailConnection("apple_mail");
    const patch = await appleMailConnect(appleId, appPassword);
    const conn = await upsertMailConnection("apple_mail", patch);
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
            : "Verbindung mit Apple Mail fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
