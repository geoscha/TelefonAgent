"use client";

import { toast } from "sonner";

import { notifyTokenBalanceChanged } from "@/lib/hooks/useTokenBalance";

const STORAGE_KEY = "cura_pending_stripe_checkout";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const POLL_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 2000;

export interface PendingStripeCheckout {
  sessionId: string;
  returnTo: "phones" | "billing";
  createdAt: number;
}

export interface PendingCheckoutReconcileResult {
  handled: boolean;
  success?: boolean;
  tokens?: number;
  duplicate?: boolean;
}

export function storePendingStripeCheckout(
  checkout: Omit<PendingStripeCheckout, "createdAt">
): void {
  if (typeof window === "undefined") return;
  const payload: PendingStripeCheckout = {
    ...checkout,
    createdAt: Date.now(),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function readPendingStripeCheckout(): PendingStripeCheckout | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingStripeCheckout;
    if (!parsed.sessionId || !parsed.createdAt) return null;
    if (Date.now() - parsed.createdAt > MAX_AGE_MS) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingStripeCheckout(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyCheckoutSession(sessionId: string): Promise<{
  ok: boolean;
  tokens?: number;
  duplicate?: boolean;
  retryable?: boolean;
  error?: string;
}> {
  const res = await fetch("/api/billing/verify-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    tokens?: number;
    duplicate?: boolean;
    error?: string;
  };

  if (res.ok && data.ok) {
    return {
      ok: true,
      tokens: data.tokens,
      duplicate: data.duplicate,
    };
  }

  const retryable =
    res.status === 402 || data.error === "Zahlung noch nicht abgeschlossen.";
  return { ok: false, retryable, error: data.error };
}

/**
 * Credits tokens after browser-back from Stripe Checkout (Apple Pay etc.)
 * when the success redirect never ran.
 */
export async function reconcilePendingStripeCheckout(): Promise<PendingCheckoutReconcileResult> {
  const pending = readPendingStripeCheckout();
  if (!pending) return { handled: false };

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    try {
      const result = await verifyCheckoutSession(pending.sessionId);
      if (result.ok) {
        clearPendingStripeCheckout();
        notifyTokenBalanceChanged();
        if (result.duplicate) {
          toast.success("Guthaben ist bereits gutgeschrieben.");
        } else {
          toast.success(
            result.tokens
              ? `${result.tokens.toLocaleString("de-CH")} Tokens gutgeschrieben.`
              : "Guthaben erfolgreich aufgeladen."
          );
        }
        return {
          handled: true,
          success: true,
          tokens: result.tokens,
          duplicate: result.duplicate,
        };
      }

      if (result.retryable && attempt < POLL_ATTEMPTS - 1) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      if (!result.retryable) {
        clearPendingStripeCheckout();
      }
      return { handled: true, success: false };
    } catch {
      if (attempt < POLL_ATTEMPTS - 1) {
        await sleep(POLL_INTERVAL_MS);
        continue;
      }
      return { handled: true, success: false };
    }
  }

  return { handled: true, success: false };
}
