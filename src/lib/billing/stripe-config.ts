import "server-only";

import Stripe from "stripe";

import { resolveStripeCredentials } from "@/lib/billing/stripe-credentials";

/** Explicit dev bypass — never inferred from a missing Stripe key. */
export function isBillingTestMode(): boolean {
  return process.env.BILLING_TEST_MODE === "true";
}

/** Stripe Secret Key present (checkout can start). */
export async function isStripeSecretConfigured(): Promise<boolean> {
  const { secretKey } = await resolveStripeCredentials();
  return Boolean(secretKey);
}

/** Webhook signing secret present (automatic fulfillment after payment). */
export async function isStripeWebhookConfigured(): Promise<boolean> {
  const { webhookSecret } = await resolveStripeCredentials();
  return Boolean(webhookSecret);
}

/** Checkout / payments — only the secret key is required. */
export async function isStripeConfigured(): Promise<boolean> {
  return isStripeSecretConfigured();
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
  const headers = new Headers(req.headers);
  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost ?? headers.get("host");
  if (host) {
    const proto =
      headers.get("x-forwarded-proto") ??
      (host.includes("localhost") || host.startsWith("127.0.0.1")
        ? "http"
        : "https");
    return `${proto}://${host}`;
  }
  const url = new URL(req.url);
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || url.origin;
}

/** Only prefill Checkout when the address passes Stripe's stricter validation. */
export function emailForStripeCheckout(
  email: string | undefined | null
): string | undefined {
  const trimmed = email?.trim();
  if (!trimmed) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(trimmed)) return undefined;
  return trimmed;
}

export function checkoutErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    console.error("[billing] checkout failed:", error.message);
  } else {
    console.error("[billing] checkout failed:", error);
  }
  return "Checkout konnte nicht gestartet werden.";
}
