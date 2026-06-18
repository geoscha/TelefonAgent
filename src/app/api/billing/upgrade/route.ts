import { NextResponse } from "next/server";

import { getTokenBalanceForUser } from "@/lib/billing/tokens";
import { getProfileForUser } from "@/lib/billing/upgrade";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** @deprecated Subscription billing replaced by token top-ups. */
export async function POST() {
  const userId = await requireUserId();
  const [profile, tokenBalance] = await Promise.all([
    getProfileForUser(userId),
    getTokenBalanceForUser(userId),
  ]);

  return NextResponse.json(
    {
      ok: false,
      error: "Abonnements wurden durch Token-Guthaben ersetzt. Bitte unter Abrechnung aufladen.",
      ...profile,
      tokenBalance,
    },
    { status: 410 }
  );
}
