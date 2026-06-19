import { NextResponse } from "next/server";
import Stripe from "stripe";

import { fulfillTokenPackCheckout } from "@/lib/billing/stripe-fulfillment";
import { fulfillPaygSetup } from "@/lib/billing/payg";
import {
  getStripeSecretKey,
  getStripeWebhookSecret,
} from "@/lib/billing/stripe-config";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = await getStripeSecretKey();
  const webhookSecret = await getStripeWebhookSecret();
  if (!secret || !webhookSecret) {
    console.error("[stripe webhook] missing Stripe secret key or webhook secret");
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
    if (session.mode === "setup") {
      const setupResult = await fulfillPaygSetup(session);
      if (!setupResult.ok && setupResult.error !== "invalid_metadata") {
        console.error("[stripe webhook] payg setup failed:", setupResult);
        return NextResponse.json({ error: "Setup failed" }, { status: 500 });
      }
    } else {
      const result = await fulfillTokenPackCheckout(session);
      if (!result.ok && result.error !== "not_paid") {
        console.error("[stripe webhook] fulfillment failed:", result);
        return NextResponse.json({ error: "Fulfillment failed" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ received: true });
}
