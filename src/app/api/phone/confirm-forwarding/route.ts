import { NextResponse, type NextRequest } from "next/server";

import { confirmForwardingSetup } from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { forwardingType?: "alle" | "bedingt"; phoneId?: string; customerNumber?: string };
  try {
    body = (await req.json()) as {
      forwardingType?: "alle" | "bedingt";
      phoneId?: string;
      customerNumber?: string;
    };
  } catch {
    body = {};
  }

  const forwardingType = body.forwardingType === "alle" ? "alle" : "bedingt";

  try {
    const state = await confirmForwardingSetup(forwardingType, {
      phoneId: body.phoneId,
      customerNumber: body.customerNumber,
    });
    return NextResponse.json({
      ok: true,
      phase: state.phase,
      settings: state.settings,
      numbers: await listUserPhoneNumbers(),
    });
  } catch (error) {
    console.error("[phone/confirm-forwarding]", error);
    return NextResponse.json(
      { ok: false, error: "Speichern fehlgeschlagen." },
      { status: 500 }
    );
  }
}
