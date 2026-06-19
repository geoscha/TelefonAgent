import { NextResponse } from "next/server";

import {
  isBillingTestMode,
  isStripeConfigured,
} from "@/lib/billing/stripe-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const stripeConfigured = await isStripeConfigured();
  const testMode = isBillingTestMode();

  return NextResponse.json({
    ok: true,
    stripeConfigured,
    testMode,
    paymentsEnabled: stripeConfigured || testMode,
    applePay: stripeConfigured,
  });
}
