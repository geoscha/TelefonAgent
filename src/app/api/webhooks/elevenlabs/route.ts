import { NextResponse } from "next/server";

import { buildCallFromWebhook, type WebhookCallData } from "@/lib/calls/build-call";
import { resolveUserIdForIncomingCall } from "@/lib/calls/resolve-user";
import { addCallUsage } from "@/lib/billing/quota";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import {
  addCallForUser,
  getSettingsForUser,
  updateSettingsForUser,
} from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[webhook] ELEVENLABS_WEBHOOK_SECRET is not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get("elevenlabs-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  const client = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY ?? "webhook-only",
  });

  let event: { type?: string };
  try {
    event = (await client.webhooks.constructEvent(
      body,
      signature,
      secret
    )) as { type?: string };
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: { type?: string; data?: WebhookCallData };
  try {
    payload = JSON.parse(body) as { type?: string; data?: WebhookCallData };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = event.type ?? payload.type;
  if (type !== "post_call_transcription") {
    return NextResponse.json({ received: true }, { status: 200 });
  }

  try {
    const data = payload.data ?? {};
    const phoneMeta = data.metadata?.phone_call;

    const userId = await resolveUserIdForIncomingCall({
      agentId: data.agent_id,
      phoneNumberId: phoneMeta?.phone_number_id,
      agentNumber: phoneMeta?.agent_number,
    });

    if (!userId) {
      console.warn("[webhook] no account for call:", {
        agentId: data.agent_id,
        phoneNumberId: phoneMeta?.phone_number_id,
      });
      return NextResponse.json({ received: true }, { status: 200 });
    }

    const call = await buildCallFromWebhook(data);
    await addCallForUser(userId, call);
    await addCallUsage(userId, call.durationSeconds);

    const settings = await getSettingsForUser(userId);
    if (settings.forwardingStatus !== "aktiv") {
      await updateSettingsForUser(userId, {
        forwardingStatus: "aktiv",
        forwardingActivatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error("[webhook] failed to process call:", error);
  }

  return NextResponse.json({ received: true }, { status: 200 });
}
