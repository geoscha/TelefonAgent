import { NextResponse } from "next/server";

import { enforceTokenState } from "@/lib/billing/tokens";
import { getTokenBalanceForUser } from "@/lib/billing/tokens";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Background billing: due phone fees, welcome tokens, pause/resume. */
export async function POST() {
  try {
    const userId = await requireUserId();
    await enforceTokenState(userId);
    const tokenBalance = await getTokenBalanceForUser(userId);
    return NextResponse.json({ ok: true, tokenBalance });
  } catch (error) {
    console.error("[billing/sync]", error);
    return NextResponse.json(
      { ok: false, error: "Abrechnung konnte nicht synchronisiert werden." },
      { status: 500 }
    );
  }
}
