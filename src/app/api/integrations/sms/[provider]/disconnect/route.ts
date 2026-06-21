import { NextResponse } from "next/server";

import {
  SMS_PROVIDERS,
  type SmsProviderId,
} from "@/lib/integrations/sms/provider-meta";
import { removeSmsConnection } from "@/lib/integrations/sms/store";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
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

  try {
    await removeSmsConnection(provider);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Trennen fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
