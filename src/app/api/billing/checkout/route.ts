import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";

import { getTokenPack } from "@/lib/billing/quota-display";
import { getProfile } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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

  let body: { packId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const pack = body.packId ? getTokenPack(body.packId) : undefined;
  if (!pack) {
    return NextResponse.json({ error: "Ungültiges Token-Paket." }, { status: 400 });
  }

  const userId = await requireUserId();
  const origin = appOrigin(req);
  const profile = await getProfile();
  const stripe = new Stripe(secret);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: profile.email || undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: pack.priceChf * 100,
            product_data: {
              name: pack.label,
              description: "Token-Guthaben für Cura",
            },
          },
        },
      ],
      metadata: {
        userId,
        packId: pack.id,
        tokens: String(pack.tokens),
      },
      success_url: `${origin}/billing?topup=success`,
      cancel_url: `${origin}/billing?topup=cancel`,
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
