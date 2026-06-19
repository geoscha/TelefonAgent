import { NextResponse } from "next/server";

import {
  isBillingTestMode,
  isStripeSecretConfigured,
} from "@/lib/billing/stripe-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const secretConfigured = await isStripeSecretConfigured();
  const testMode = isBillingTestMode();

  return NextResponse.json({
    ok: true,
    paymentsEnabled: secretConfigured || testMode,
  });
}
