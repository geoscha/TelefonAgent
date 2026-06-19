"use client";

import { toast } from "sonner";

import { notifyTokenBalanceChanged } from "@/lib/hooks/useTokenBalance";

export interface TopupReturnResult {
  handled: boolean;
  success?: boolean;
  tokens?: number;
  duplicate?: boolean;
}

/** Handles `?topup=…` after Stripe return (tokens already credited server-side). */
export async function handleTopupReturnParams(
  params: URLSearchParams
): Promise<TopupReturnResult> {
  const topup = params.get("topup");
  if (!topup) return { handled: false };

  if (topup === "cancel") {
    toast.message("Aufladung abgebrochen.");
    return { handled: true };
  }

  if (topup === "pending") {
    toast.message("Zahlung wird noch verarbeitet. Guthaben folgt in Kürze.");
    return { handled: true };
  }

  if (topup === "error") {
    toast.error("Guthaben konnte nicht gutgeschrieben werden.");
    return { handled: true };
  }

  if (topup !== "success") {
    return { handled: false };
  }

  const sessionId = params.get("session_id");
  if (sessionId) {
    try {
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
        notifyTokenBalanceChanged();
        if (data.duplicate) {
          toast.success("Guthaben ist bereits gutgeschrieben.");
        } else {
          toast.success(
            data.tokens
              ? `${data.tokens.toLocaleString("de-CH")} Tokens gutgeschrieben.`
              : "Guthaben erfolgreich aufgeladen."
          );
        }
        return {
          handled: true,
          success: true,
          tokens: data.tokens,
          duplicate: data.duplicate,
        };
      }
      toast.error(data.error ?? "Guthaben konnte nicht bestätigt werden.");
      return { handled: true };
    } catch {
      toast.error("Zahlungsbestätigung fehlgeschlagen.");
      return { handled: true };
    }
  }

  const tokensRaw = params.get("tokens");
  const tokens = tokensRaw ? Number(tokensRaw) : undefined;
  const duplicate = params.get("duplicate") === "1";
  notifyTokenBalanceChanged();

  if (duplicate) {
    toast.success("Guthaben ist bereits gutgeschrieben.");
  } else {
    toast.success(
      tokens && tokens > 0
        ? `${tokens.toLocaleString("de-CH")} Tokens gutgeschrieben.`
        : "Guthaben erfolgreich aufgeladen."
    );
  }

  return { handled: true, success: true, tokens, duplicate };
}

export function clearTopupParamsFromUrl(pathname: string): void {
  if (typeof window === "undefined") return;
  window.history.replaceState({}, "", pathname);
}
