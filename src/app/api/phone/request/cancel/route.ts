import { NextResponse, type NextRequest } from "next/server";

import { cancelPhoneRequest } from "@/lib/phone/onboarding";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  let body: { requestId?: string };
  try {
    body = (await req.json()) as { requestId?: string };
  } catch {
    body = {};
  }

  const requestId =
    body.requestId?.trim() ?? req.nextUrl.searchParams.get("requestId")?.trim();

  if (!requestId) {
    return NextResponse.json(
      { ok: false, error: "Anfrage-ID fehlt." },
      { status: 400 }
    );
  }

  try {
    const state = await cancelPhoneRequest(requestId);
    return NextResponse.json({
      ok: true,
      phase: state.phase,
      settings: state.settings,
      pendingRequests: state.pendingRequests,
    });
  } catch (error) {
    console.error("[phone/request/cancel]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Anfrage konnte nicht zurückgezogen werden.",
      },
      { status: 500 }
    );
  }
}
