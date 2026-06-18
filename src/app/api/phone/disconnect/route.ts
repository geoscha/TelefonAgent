import { NextResponse } from "next/server";

import { disconnectPhoneForwarding } from "@/lib/phone/onboarding";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const state = await disconnectPhoneForwarding();
    return NextResponse.json({
      ok: true,
      phase: state.phase,
      settings: state.settings,
    });
  } catch (error) {
    console.error("[phone/disconnect]", error);
    return NextResponse.json(
      { ok: false, error: "Trennen fehlgeschlagen." },
      { status: 500 }
    );
  }
}
