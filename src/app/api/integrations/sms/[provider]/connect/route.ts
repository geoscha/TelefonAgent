import { NextResponse } from "next/server";

import { connectSmsGateway } from "@/lib/integrations/sms/connect";
import {
  SMS_PROVIDERS,
  type SmsProviderId,
} from "@/lib/integrations/sms/provider-meta";
import {
  ensureSingleSmsConnection,
  upsertSmsConnection,
} from "@/lib/integrations/sms/store";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;
  const provider = raw as SmsProviderId;

  if (!SMS_PROVIDERS.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: "Unbekannter SMS-Anbieter." },
      { status: 400 }
    );
  }

  let body: {
    username?: string;
    password?: string;
    senderId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  try {
    const patch = await connectSmsGateway(provider, body);
    await ensureSingleSmsConnection(provider);
    const conn = await upsertSmsConnection(provider, patch);
    return NextResponse.json({
      ok: true,
      connection: {
        connected: true,
        accountLabel: conn.accountLabel,
        senderId: conn.senderId,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error ? error.message : "Verbindung fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
