import { NextResponse, type NextRequest } from "next/server";

import { getSettings, updateSettings, type ForwardingType } from "@/lib/store";

export const dynamic = "force-dynamic";

interface ForwardingBody {
  customerNumber?: string;
  customerNumberLabel?: string;
  forwardingType?: ForwardingType;
}

/**
 * Persists the customer's existing number and chosen forwarding type, and moves
 * onboarding into the "instructions shown" state. No telephony credentials are
 * stored — the customer forwards their number to the Linker DID themselves.
 */
export async function POST(req: NextRequest) {
  let body: ForwardingBody;
  try {
    body = (await req.json()) as ForwardingBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const customerNumber = body.customerNumber?.trim();
  if (!customerNumber) {
    return NextResponse.json(
      { ok: false, error: "Bitte geben Sie Ihre Telefonnummer an." },
      { status: 400 }
    );
  }

  const forwardingType: ForwardingType = "alle";

  const current = await getSettings();
  const updated = await updateSettings({
    customerNumber,
    customerNumberLabel: body.customerNumberLabel?.trim() || undefined,
    forwardingType,
    // Don't downgrade an already-active setup.
    forwardingStatus:
      current.forwardingStatus === "aktiv" ? "aktiv" : "anleitung",
  });

  return NextResponse.json({
    ok: true,
    settings: updated,
    forwardingNumber: updated.linkerForwardingNumber ?? null,
  });
}
