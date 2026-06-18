import { NextResponse } from "next/server";

import { prepareTokenBalanceForBilling } from "@/lib/billing/tokens";
import { requestPhoneNumber } from "@/lib/phone/onboarding";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isInsufficientTokensMessage(message: string): boolean {
  return /token|guthaben/i.test(message);
}

export async function POST() {
  try {
    const userId = await requireUserId();
    await prepareTokenBalanceForBilling(userId);
    const state = await requestPhoneNumber();
    return NextResponse.json({
      ok: true,
      phase: state.phase,
      autoAssigned: Boolean(state.autoAssigned),
      pendingRequest: state.pendingRequest,
      settings: state.settings,
    });
  } catch (error) {
    console.error("[phone/request]", error);
    const message =
      error instanceof Error
        ? error.message
        : "Anfrage konnte nicht gesendet werden.";
    const insufficient = isInsufficientTokensMessage(message);
    return NextResponse.json(
      {
        ok: false,
        error: message,
        code: insufficient ? "insufficient_tokens" : "request_failed",
      },
      { status: insufficient ? 402 : 500 }
    );
  }
}
