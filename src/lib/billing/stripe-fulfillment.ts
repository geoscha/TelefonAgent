import "server-only";

import type Stripe from "stripe";

import { getTokenPack } from "@/lib/billing/quota-display";
import { notifyTokenPurchaseEmail } from "@/lib/billing/token-purchase-notify";
import { creditTokens } from "@/lib/billing/tokens";
import { getStripeClient } from "@/lib/billing/stripe-config";

export interface TokenCheckoutFulfillment {
  ok: boolean;
  credited: boolean;
  duplicate: boolean;
  tokens?: number;
  packId?: string;
  balance?: number;
  error?: string;
}

function resolveCheckoutTokens(session: Stripe.Checkout.Session): {
  tokens?: number;
  packId?: string;
} {
  const packId = session.metadata?.packId;
  const tokensRaw = session.metadata?.tokens;
  const tokens =
    tokensRaw != null
      ? Number(tokensRaw)
      : packId
        ? getTokenPack(packId)?.tokens
        : undefined;

  return {
    packId,
    tokens: tokens && tokens > 0 ? tokens : undefined,
  };
}

async function stripeReceiptUrl(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<string | null> {
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id;
  if (!paymentIntentId) return null;

  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const chargeId =
      typeof pi.latest_charge === "string"
        ? pi.latest_charge
        : pi.latest_charge?.id;
    if (!chargeId) return null;
    const charge = await stripe.charges.retrieve(chargeId);
    return charge.receipt_url ?? null;
  } catch {
    return null;
  }
}

export async function fulfillTokenPackCheckout(
  session: Stripe.Checkout.Session
): Promise<TokenCheckoutFulfillment> {
  if (session.mode !== "payment") {
    return { ok: false, credited: false, duplicate: false, error: "invalid_mode" };
  }

  if (session.payment_status !== "paid") {
    return { ok: false, credited: false, duplicate: false, error: "not_paid" };
  }

  const userId = session.metadata?.userId;
  const { tokens, packId } = resolveCheckoutTokens(session);

  if (!userId || !tokens) {
    return { ok: false, credited: false, duplicate: false, error: "invalid_metadata" };
  }

  const referenceId = `stripe:${session.id}`;
  const result = await creditTokens(userId, tokens, "stripe_topup", referenceId, {
    packId,
    sessionId: session.id,
    amountTotal: session.amount_total,
    currency: session.currency,
  });

  if (!result.ok && !result.duplicate) {
    return {
      ok: false,
      credited: false,
      duplicate: false,
      tokens,
      packId,
      balance: result.balance,
      error: result.error ?? "credit_failed",
    };
  }

  if (result.ok && !result.duplicate) {
    const stripe = await getStripeClient();
    const receiptUrl = stripe ? await stripeReceiptUrl(stripe, session) : null;
    await notifyTokenPurchaseEmail({
      userId,
      tokens,
      packId,
      priceChf: session.amount_total ? session.amount_total / 100 : undefined,
      referenceId,
      purchasedAt: new Date().toISOString(),
      receiptUrl,
    });
  }

  return {
    ok: true,
    credited: result.ok,
    duplicate: Boolean(result.duplicate),
    tokens,
    packId,
    balance: result.balance,
  };
}

export async function fulfillTokenPackCheckoutBySessionId(
  sessionId: string,
  expectedUserId: string
): Promise<TokenCheckoutFulfillment> {
  const stripe = await getStripeClient();
  if (!stripe) {
    return {
      ok: false,
      credited: false,
      duplicate: false,
      error: "stripe_not_configured",
    };
  }

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.userId !== expectedUserId) {
    return {
      ok: false,
      credited: false,
      duplicate: false,
      error: "forbidden",
    };
  }

  return fulfillTokenPackCheckout(session);
}
