import { NextResponse } from "next/server";
import Stripe from "stripe";

import { getTokenPack } from "@/lib/billing/quota-display";
import { creditTokens } from "@/lib/billing/tokens";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !webhookSecret) {
    console.error("[stripe webhook] missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = new Stripe(secret);
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("[stripe webhook] signature failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.mode !== "payment") {
      return NextResponse.json({ received: true });
    }

    const userId = session.metadata?.userId;
    const packId = session.metadata?.packId;
    const tokensRaw = session.metadata?.tokens;
    const tokens =
      tokensRaw != null
        ? Number(tokensRaw)
        : packId
          ? getTokenPack(packId)?.tokens
          : undefined;

    if (!userId || !tokens || tokens <= 0) {
      console.error("[stripe webhook] missing metadata:", session.metadata);
      return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
    }

    const referenceId = `stripe:${session.id}`;
    await creditTokens(userId, tokens, "stripe_topup", referenceId, {
      packId,
      sessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency,
    });
  }

  return NextResponse.json({ received: true });
}
