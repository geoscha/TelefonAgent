import { NextResponse, type NextRequest } from "next/server";

import { disconnectPhoneForwarding } from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { phoneId?: string };
  try {
    body = (await req.json()) as { phoneId?: string };
  } catch {
    body = {};
  }

  try {
    const state = await disconnectPhoneForwarding(body.phoneId);
    return NextResponse.json({
      ok: true,
      phase: state.phase,
      settings: state.settings,
      numbers: await listUserPhoneNumbers(),
    });
  } catch (error) {
    console.error("[phone/disconnect]", error);
    return NextResponse.json(
      { ok: false, error: "Trennen fehlgeschlagen." },
      { status: 500 }
    );
  }
}
