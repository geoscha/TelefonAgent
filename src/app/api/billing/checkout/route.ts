import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";

import { getProfile } from "@/lib/store";
import type { BillingInterval } from "@/lib/store";
import { PRO_PRICING_CHF } from "@/lib/admin/pricing";

export const dynamic = "force-dynamic";

/** CHF amounts (in Rappen) for the Pro plan. */
const PRICING = PRO_PRICING_CHF satisfies Record<
  BillingInterval,
  { amount: number; interval: "month" | "year" }
>;

function appOrigin(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    req.nextUrl.origin
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Stripe ist noch nicht konfiguriert. Bitte STRIPE_SECRET_KEY hinterlegen.",
      },
      { status: 503 }
    );
  }

  let body: { interval?: BillingInterval };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const interval: BillingInterval =
    body.interval === "yearly" ? "yearly" : "monthly";
  const plan = PRICING[interval];
  const origin = appOrigin(req);
  const profile = await getProfile();

  // Prefer pre-created Stripe Price IDs when provided; otherwise build the
  // price inline so the flow works without dashboard setup.
  const priceId =
    interval === "yearly"
      ? process.env.STRIPE_PRICE_YEARLY
      : process.env.STRIPE_PRICE_MONTHLY;

  const stripe = new Stripe(secret);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: profile.email || undefined,
      line_items: [
        priceId
          ? { price: priceId, quantity: 1 }
          : {
              quantity: 1,
              price_data: {
                currency: "chf",
                unit_amount: plan.amount,
                recurring: { interval: plan.interval },
                product_data: {
                  name: `Cura Pro (${interval === "yearly" ? "Jahr" : "Monat"})`,
                },
              },
            },
      ],
      success_url: `${origin}/einstellungen?billing=success`,
      cancel_url: `${origin}/einstellungen?billing=cancel`,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error("[billing] checkout failed:", error);
    return NextResponse.json(
      { error: "Checkout konnte nicht gestartet werden." },
      { status: 502 }
    );
  }
}
