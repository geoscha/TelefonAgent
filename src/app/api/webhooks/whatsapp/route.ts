import { NextResponse } from "next/server";

import { getWhatsAppWebhookVerifyToken } from "@/lib/integrations/whatsapp/config";
import { handleWhatsAppWebhookPayload } from "@/lib/integrations/whatsapp/webhook";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const verifyToken = getWhatsAppWebhookVerifyToken();

  if (
    mode === "subscribe" &&
    verifyToken &&
    token === verifyToken &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification failed" }, { status: 403 });
}

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    const saved = await handleWhatsAppWebhookPayload(payload);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    console.error("[webhooks/whatsapp]", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
