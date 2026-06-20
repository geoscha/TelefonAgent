import { NextResponse } from "next/server";

import { removeMailConnection } from "@/lib/integrations/mail/store";
import type { MailProviderId } from "@/lib/integrations/mail/provider-meta";

export const dynamic = "force-dynamic";

const VALID: MailProviderId[] = ["gmail", "outlook", "apple_mail"];

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: raw } = await params;
  const provider = raw as MailProviderId;

  if (!VALID.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: "Unbekannter Anbieter." },
      { status: 400 }
    );
  }

  await removeMailConnection(provider);
  return NextResponse.json({ ok: true });
}
