import { NextResponse } from "next/server";

import { requestPhoneNumber } from "@/lib/phone/onboarding";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
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
    return NextResponse.json(
      { ok: false, error: "Anfrage konnte nicht gesendet werden." },
      { status: 500 }
    );
  }
}
