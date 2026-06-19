import { NextResponse, type NextRequest } from "next/server";

import { fulfillTokenPackCheckoutBySessionIdOnlyWithRetry } from "@/lib/billing/stripe-fulfillment";

export const dynamic = "force-dynamic";

function resolveReturnPath(
  returnTo: string | null | undefined,
  fallback: "phones" | "billing" = "billing"
): string {
  if (returnTo === "phones") return "/phones";
  if (returnTo === "billing") return "/billing";
  return fallback === "phones" ? "/phones" : "/billing";
}

/** Stripe Checkout return — credits tokens server-side, then redirects to the app. */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const cancelReturnTo = searchParams.get("returnTo");

  if (searchParams.get("topup") === "cancel") {
    const path = resolveReturnPath(cancelReturnTo);
    return NextResponse.redirect(new URL(`${path}?topup=cancel`, req.url));
  }

  const sessionId = searchParams.get("session_id")?.trim();
  if (!sessionId) {
    return NextResponse.redirect(new URL("/billing?topup=error", req.url));
  }

  const result = await fulfillTokenPackCheckoutBySessionIdOnlyWithRetry(sessionId);
  const path = resolveReturnPath(result.returnTo ?? cancelReturnTo);

  const params = new URLSearchParams();
  if (result.ok) {
    params.set("topup", "success");
    if (result.tokens) params.set("tokens", String(result.tokens));
    if (result.duplicate) params.set("duplicate", "1");
  } else if (result.error === "not_paid") {
    params.set("topup", "pending");
  } else {
    params.set("topup", "error");
  }

  return NextResponse.redirect(new URL(`${path}?${params}`, req.url));
}
