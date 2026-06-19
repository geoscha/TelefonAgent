import "server-only";

import type Stripe from "stripe";

import {
  getOrCreateStripeCustomer,
  setDefaultPaymentMethod,
} from "@/lib/billing/stripe-customer";
import {
  appOriginFromRequest,
  emailForStripeCheckout,
  getStripeClient,
  isStripeConfigured,
} from "@/lib/billing/stripe-config";
import { STRIPE_MIN_PRICE_CHF } from "@/lib/billing/token-pack-types";
import { creditTokens, TOKENS_PER_CHF } from "@/lib/billing/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PaygStatus {
  enabled: boolean;
  configured: boolean;
  cardBrand: string | null;
  cardLast4: string | null;
}

interface PaygProfileRow {
  payg_enabled: boolean;
  stripe_customer_id: string | null;
  stripe_payment_method_id: string | null;
  email: string | null;
  name: string | null;
}

async function loadPaygProfile(userId: string): Promise<PaygProfileRow | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(
      "payg_enabled, stripe_customer_id, stripe_payment_method_id, email, name"
    )
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[payg] load profile:", error.message);
    return null;
  }
  return data as PaygProfileRow | null;
}

async function savePaygState(
  userId: string,
  patch: {
    payg_enabled?: boolean;
    stripe_customer_id?: string;
    stripe_payment_method_id?: string | null;
  }
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) throw error;
}

function chargePlanForTokenShortfall(shortfallTokens: number): {
  priceChf: number;
  tokensToCredit: number;
} {
  const rawChf = Math.max(STRIPE_MIN_PRICE_CHF, shortfallTokens / TOKENS_PER_CHF);
  const priceChf = Math.round(rawChf * 100) / 100;
  const tokensToCredit = Math.round(priceChf * TOKENS_PER_CHF);
  return { priceChf, tokensToCredit };
}

export async function getPaygStatus(userId: string): Promise<PaygStatus> {
  const configured = await isStripeConfigured();
  const row = await loadPaygProfile(userId);
  if (!row?.payg_enabled || !row.stripe_payment_method_id) {
    return {
      enabled: false,
      configured,
      cardBrand: null,
      cardLast4: null,
    };
  }

  const stripe = await getStripeClient();
  if (!stripe) {
    return {
      enabled: Boolean(row.payg_enabled),
      configured,
      cardBrand: null,
      cardLast4: null,
    };
  }

  try {
    const pm = await stripe.paymentMethods.retrieve(row.stripe_payment_method_id);
    return {
      enabled: true,
      configured,
      cardBrand: pm.card?.brand ?? null,
      cardLast4: pm.card?.last4 ?? null,
    };
  } catch {
    return {
      enabled: true,
      configured,
      cardBrand: null,
      cardLast4: null,
    };
  }
}

export async function createPaygSetupCheckout(
  userId: string,
  req: Request
): Promise<{ url: string }> {
  const stripe = await getStripeClient();
  if (!stripe) {
    throw new Error("Aufladung ist derzeit nicht verfügbar.");
  }

  const row = await loadPaygProfile(userId);
  const customerId = await getOrCreateStripeCustomer(
    userId,
    emailForStripeCheckout(row?.email),
    row?.name
  );

  const origin = appOriginFromRequest(req);
  const session = await stripe.checkout.sessions.create({
    mode: "setup",
    locale: "de",
    customer: customerId,
    payment_method_types: ["card"],
    metadata: {
      userId,
      type: "payg_setup",
    },
    success_url: `${origin}/billing?payg=success`,
    cancel_url: `${origin}/billing?payg=cancel`,
  });

  if (!session.url) {
    throw new Error("Checkout konnte nicht gestartet werden.");
  }

  return { url: session.url };
}

export async function fulfillPaygSetup(
  session: Stripe.Checkout.Session
): Promise<{ ok: boolean; error?: string }> {
  if (session.mode !== "setup") {
    return { ok: false, error: "invalid_mode" };
  }
  if (session.metadata?.type !== "payg_setup") {
    return { ok: false, error: "invalid_metadata" };
  }

  const userId = session.metadata.userId;
  if (!userId) {
    return { ok: false, error: "missing_user" };
  }

  const stripe = await getStripeClient();
  if (!stripe) {
    return { ok: false, error: "stripe_not_configured" };
  }

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  const setupIntentId =
    typeof session.setup_intent === "string"
      ? session.setup_intent
      : session.setup_intent?.id;

  if (!customerId || !setupIntentId) {
    return { ok: false, error: "missing_setup" };
  }

  const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
  const paymentMethodId =
    typeof setupIntent.payment_method === "string"
      ? setupIntent.payment_method
      : setupIntent.payment_method?.id;

  if (!paymentMethodId) {
    return { ok: false, error: "missing_payment_method" };
  }

  await setDefaultPaymentMethod(stripe, customerId, paymentMethodId);
  await savePaygState(userId, {
    payg_enabled: true,
    stripe_customer_id: customerId,
    stripe_payment_method_id: paymentMethodId,
  });

  return { ok: true };
}

export async function disablePayg(userId: string): Promise<void> {
  await savePaygState(userId, {
    payg_enabled: false,
    stripe_payment_method_id: null,
  });
}

export async function chargePaygForTokens(
  userId: string,
  tokensNeeded: number,
  metadata?: Record<string, unknown>
): Promise<{ ok: boolean; credited?: number; error?: string }> {
  if (tokensNeeded <= 0) return { ok: true, credited: 0 };

  const row = await loadPaygProfile(userId);
  if (
    !row?.payg_enabled ||
    !row.stripe_customer_id ||
    !row.stripe_payment_method_id
  ) {
    return { ok: false, error: "payg_not_enabled" };
  }

  const stripe = await getStripeClient();
  if (!stripe) {
    return { ok: false, error: "stripe_not_configured" };
  }

  const { priceChf, tokensToCredit } = chargePlanForTokenShortfall(tokensNeeded);
  const amountCents = Math.round(priceChf * 100);

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "chf",
      customer: row.stripe_customer_id,
      payment_method: row.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      metadata: {
        userId,
        type: "payg_usage",
        tokens: String(tokensToCredit),
        priceChf: String(priceChf),
        ...(metadata?.source ? { source: String(metadata.source) } : {}),
      },
    });

    if (paymentIntent.status !== "succeeded") {
      return { ok: false, error: "payment_not_succeeded" };
    }

    const referenceId = `stripe:pi:${paymentIntent.id}`;
    const credit = await creditTokens(
      userId,
      tokensToCredit,
      "stripe_topup",
      referenceId,
      {
        payg: true,
        priceChf,
        paymentIntentId: paymentIntent.id,
        ...metadata,
      }
    );

    if (!credit.ok && !credit.duplicate) {
      return { ok: false, error: credit.error ?? "credit_failed" };
    }

    return { ok: true, credited: tokensToCredit };
  } catch (error) {
    console.error("[payg] charge failed:", error);
    return { ok: false, error: "charge_failed" };
  }
}

/** Top up via saved card when prepaid balance is too low. */
export async function tryPaygTopUpForShortfall(
  userId: string,
  shortfallTokens: number,
  metadata?: Record<string, unknown>
): Promise<boolean> {
  if (shortfallTokens <= 0) return true;
  const result = await chargePaygForTokens(userId, shortfallTokens, metadata);
  return result.ok;
}

export async function isPaygActive(userId: string): Promise<boolean> {
  const row = await loadPaygProfile(userId);
  return Boolean(
    row?.payg_enabled &&
      row.stripe_customer_id &&
      row.stripe_payment_method_id
  );
}
