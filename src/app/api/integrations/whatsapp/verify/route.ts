import { NextResponse } from "next/server";

import {
  confirmWhatsAppPairing,
  verifyWhatsAppConnection,
} from "@/lib/integrations/whatsapp/onboarding";
import {
  listWhatsAppConnections,
  toPublicWhatsAppStatus,
} from "@/lib/integrations/whatsapp/store";

export const dynamic = "force-dynamic";

interface Body {
  connectionId?: string;
  pairingCode?: string;
  code?: string;
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

  const connectionId = body.connectionId?.trim();
  if (!connectionId) {
    return NextResponse.json(
      { ok: false, error: "Verbindung nicht gefunden." },
      { status: 400 }
    );
  }

  try {
    if (body.pairingCode?.trim()) {
      const pairing = await confirmWhatsAppPairing({
        connectionId,
        pairingCode: body.pairingCode,
      });

      if (pairing.verificationRequired) {
        return NextResponse.json({
          ok: true,
          verificationRequired: true,
          devVerificationCode: pairing.devVerificationCode,
        });
      }
    } else if (body.code?.trim()) {
      await verifyWhatsAppConnection({ connectionId, code: body.code });
    } else {
      return NextResponse.json(
        { ok: false, error: "Bitte Cura-Code oder Bestätigungscode eingeben." },
        { status: 400 }
      );
    }

    const connections = await listWhatsAppConnections();
    const connection = connections.find((entry) => entry.id === connectionId);

    return NextResponse.json({
      ok: true,
      connected: true,
      connection: connection ? toPublicWhatsAppStatus(connection) : undefined,
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
            : "Verifizierung fehlgeschlagen.",
      },
      { status: 400 }
    );
  }
}
