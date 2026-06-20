import { NextResponse } from "next/server";

import { screenAllStoredCalls } from "@/lib/calls/call-screening";
import { getStoredCalls } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Screens unanalyzed calls and creates calendar events when meetings were agreed. */
export async function POST() {
  try {
    const summary = await screenAllStoredCalls();
    const refreshed = await getStoredCalls();

    return NextResponse.json({
      ok: true,
      ...summary,
      calls: refreshed,
    });
  } catch (error) {
    console.error("[calls/screen]", error);
    return NextResponse.json(
      { ok: false, error: "Anruf-Analyse fehlgeschlagen." },
      { status: 500 }
    );
  }
}
