import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BETA_UNAVAILABLE =
  "Kalender-Integrationen sind in der Beta-Version noch nicht verfügbar.";

/** OAuth providers (Google / Microsoft) — disabled in beta. */
export async function GET() {
  return NextResponse.json({ ok: false, error: BETA_UNAVAILABLE }, { status: 403 });
}

/** Apple CalDAV connect — disabled in beta. */
export async function POST(
  _req: NextRequest,
  { params }: { params: { provider: string } }
) {
  if (params.provider !== "apple") {
    return NextResponse.json(
      { ok: false, error: "Nur Apple wird per Formular verbunden." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: false, error: BETA_UNAVAILABLE }, { status: 403 });
}
