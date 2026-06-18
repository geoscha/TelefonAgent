import { NextResponse, type NextRequest } from "next/server";

import { confirmForwardingSetup } from "@/lib/phone/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { forwardingType?: "alle" | "bedingt" };
  try {
    body = (await req.json()) as { forwardingType?: "alle" | "bedingt" };
  } catch {
    body = {};
  }

  const forwardingType = body.forwardingType === "alle" ? "alle" : "bedingt";

  try {
    const state = await confirmForwardingSetup(forwardingType);
    return NextResponse.json({
      ok: true,
      phase: state.phase,
      settings: state.settings,
    });
  } catch (error) {
    console.error("[phone/confirm-forwarding]", error);
    return NextResponse.json(
      { ok: false, error: "Speichern fehlgeschlagen." },
      { status: 500 }
    );
  }
}
