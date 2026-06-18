import { NextResponse } from "next/server";

import { provisionCurrentUser } from "@/lib/provision";

export const dynamic = "force-dynamic";

/**
 * Provisions a new tenant: pool number + default agent + ElevenLabs phone link.
 * Safe to call multiple times (idempotent).
 */
export async function POST() {
  try {
    const result = await provisionCurrentUser();
    if (!result.ok) {
      return NextResponse.json(result, { status: 503 });
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("[provision]", error);
    const message =
      error instanceof Error
        ? error.message
        : "Einrichtung fehlgeschlagen.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
