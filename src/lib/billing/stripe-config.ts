import "server-only";

import Stripe from "stripe";

import { resolveStripeCredentials } from "@/lib/billing/stripe-credentials";

/** Explicit dev bypass — never inferred from a missing Stripe key. */
export function isBillingTestMode(): boolean {
  return process.env.BILLING_TEST_MODE === "true";
}

export async function isStripeConfigured(): Promise<boolean> {
  const { secretKey, webhookSecret } = await resolveStripeCredentials();
  return Boolean(secretKey && webhookSecret);
}

export async function getStripeSecretKey(): Promise<string | null> {
  const { secretKey } = await resolveStripeCredentials();
  return secretKey;
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  const { webhookSecret } = await resolveStripeCredentials();
  return webhookSecret;
}

export async function getStripeClient(): Promise<Stripe | null> {
  const secret = await getStripeSecretKey();
  if (!secret) return null;
  return new Stripe(secret);
}

export function appOriginFromRequest(req: Request): string {
  const url = new URL(req.url);
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || url.origin
  );
}
