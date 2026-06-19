import { NextResponse, type NextRequest } from "next/server";

import { fulfillTokenPackCheckoutBySessionId } from "@/lib/billing/stripe-fulfillment";
import { isStripeConfigured } from "@/lib/billing/stripe-config";
import { getTokenBalanceForUser } from "@/lib/billing/tokens";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Credits tokens after Checkout return (idempotent; webhook may have run first). */
export async function POST(req: NextRequest) {
  if (!(await isStripeConfigured())) {
    return NextResponse.json(
      { ok: false, error: "Stripe ist nicht konfiguriert." },
      { status: 503 }
    );
  }

  let body: { sessionId?: string };
  try {
    body = (await req.json()) as { sessionId?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Ungültige Anfrage." }, { status: 400 });
  }

  const sessionId = body.sessionId?.trim();
  if (!sessionId) {
    return NextResponse.json(
      { ok: false, error: "sessionId fehlt." },
      { status: 400 }
    );
  }

  try {
    const userId = await requireUserId();
    const result = await fulfillTokenPackCheckoutBySessionId(sessionId, userId);

    if (result.error === "forbidden") {
      return NextResponse.json({ ok: false, error: "Ungültige Sitzung." }, { status: 403 });
    }

    if (!result.ok && result.error === "not_paid") {
      return NextResponse.json(
        { ok: false, error: "Zahlung noch nicht abgeschlossen." },
        { status: 402 }
      );
    }

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Guthaben konnte nicht gutgeschrieben werden." },
        { status: 502 }
      );
    }

    const tokenBalance = await getTokenBalanceForUser(userId);
    return NextResponse.json({
      ok: true,
      credited: result.credited,
      duplicate: result.duplicate,
      tokens: result.tokens,
      tokenBalance,
    });
  } catch (error) {
    console.error("[billing/verify-session]", error);
    return NextResponse.json(
      { ok: false, error: "Verifizierung fehlgeschlagen." },
      { status: 500 }
    );
  }
}
