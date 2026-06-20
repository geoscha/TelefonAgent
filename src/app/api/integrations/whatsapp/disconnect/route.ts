import { NextResponse } from "next/server";

import { removeWhatsAppConnection } from "@/lib/integrations/whatsapp/store";

export const dynamic = "force-dynamic";

interface Body {
  connectionId?: string;
  /** @deprecated Use connectionId */
  phoneNumberId?: string;
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

  const connectionId = body.connectionId?.trim() ?? body.phoneNumberId?.trim();
  if (!connectionId) {
    return NextResponse.json(
      { ok: false, error: "Verbindung nicht gefunden." },
      { status: 400 }
    );
  }

  try {
    await removeWhatsAppConnection(connectionId);
    return NextResponse.json({ ok: true });
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
            : "Trennen fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
