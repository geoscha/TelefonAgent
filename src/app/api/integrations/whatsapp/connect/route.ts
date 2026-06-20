import { NextResponse } from "next/server";

import { startWhatsAppPairing } from "@/lib/integrations/whatsapp/onboarding";

export const dynamic = "force-dynamic";

interface Body {
  whatsappNumber?: string;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const whatsappNumber = body.whatsappNumber?.trim();
  if (!whatsappNumber) {
    return NextResponse.json(
      { ok: false, error: "Bitte Ihre WhatsApp-Nummer eingeben." },
      { status: 400 }
    );
  }

  try {
    const result = await startWhatsAppPairing({ whatsappNumber });

    return NextResponse.json({
      ok: true,
      connectionId: result.connectionId,
      displayNumber: result.displayNumber,
      pairingCode: result.pairingCode,
      matchedLinkerPhone: result.matchedLinkerPhone,
      steps: result.steps,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "WhatsApp-Verbindung fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
