import { NextResponse, type NextRequest } from "next/server";

import {
  isValidStripeCheckoutPrice,
  STRIPE_MIN_PRICE_CHF,
  stripeUnitAmountFromChf,
} from "@/lib/billing/token-pack-types";
import { getTokenPackById } from "@/lib/billing/token-packs";
import { notifyTokenPurchaseEmail } from "@/lib/billing/token-purchase-notify";
import {
  appOriginFromRequest,
  getStripeClient,
  isBillingTestMode,
  isStripeConfigured,
} from "@/lib/billing/stripe-config";
import { creditTokens, getTokenBalanceForUser } from "@/lib/billing/tokens";
import { getProfile } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Gratis-Testguthaben nur wenn BILLING_TEST_MODE=true gesetzt ist. */
const TEST_TOPUP_TOKENS = 35_000;

export async function POST(req: NextRequest) {
  let body: { packId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const pack = body.packId ? await getTokenPackById(body.packId) : undefined;
  if (!pack) {
    return NextResponse.json({ error: "Ungültiges Token-Paket." }, { status: 400 });
  }

  const userId = await requireUserId();

  if (isBillingTestMode()) {
    const referenceId = `test_topup:${userId}:${Date.now()}`;
    const result = await creditTokens(
      userId,
      TEST_TOPUP_TOKENS,
      "admin_topup",
      referenceId,
      { packId: pack.id, test: true }
    );

    if (!result.ok && !result.duplicate) {
      return NextResponse.json(
        { error: "Test-Guthaben konnte nicht gutgeschrieben werden." },
        { status: 502 }
      );
    }

    if (result.ok && !result.duplicate) {
      await notifyTokenPurchaseEmail({
        userId,
        tokens: TEST_TOPUP_TOKENS,
        packId: pack.id,
        referenceId,
        purchasedAt: new Date().toISOString(),
      });
    }

    const tokenBalance = await getTokenBalanceForUser(userId);
    return NextResponse.json({
      ok: true,
      test: true,
      tokens: TEST_TOPUP_TOKENS,
      tokenBalance,
    });
  }

  if (!(await isStripeConfigured())) {
    return NextResponse.json(
      {
        error:
          "Stripe ist noch nicht konfiguriert. Bitte Stripe Secret Key und Webhook Secret im Admin hinterlegen.",
      },
      { status: 503 }
    );
  }

  const stripe = await getStripeClient();
  if (!stripe) {
    return NextResponse.json(
      { error: "Stripe konnte nicht initialisiert werden." },
      { status: 503 }
    );
  }

  const origin = appOriginFromRequest(req);
  const profile = await getProfile();

  if (!isValidStripeCheckoutPrice(pack.priceChf)) {
    return NextResponse.json(
      {
        error: `Mindestbetrag für Stripe ist CHF ${STRIPE_MIN_PRICE_CHF.toFixed(2)}. Dieses Paket ist zu günstig (CHF ${pack.priceChf}).`,
      },
      { status: 400 }
    );
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: "de",
      customer_email: profile.email || undefined,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: stripeUnitAmountFromChf(pack.priceChf),
            product_data: {
              name: pack.label,
              description: "Token-Guthaben für Cura Telefonagent",
            },
          },
        },
      ],
      metadata: {
        userId,
        packId: pack.id,
        tokens: String(pack.tokens),
        priceChf: String(pack.priceChf),
      },
      payment_intent_data: {
        metadata: {
          userId,
          packId: pack.id,
          tokens: String(pack.tokens),
          priceChf: String(pack.priceChf),
        },
      },
      success_url: `${origin}/billing?topup=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/billing?topup=cancel`,
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Checkout-URL fehlt." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("[billing] checkout failed:", error);
    const stripeMessage =
      error instanceof Error &&
      "type" in error &&
      typeof (error as { type?: string }).type === "string"
        ? error.message
        : null;
    return NextResponse.json(
      {
        error:
          stripeMessage ??
          "Checkout konnte nicht gestartet werden.",
      },
      { status: 502 }
    );
  }
}
