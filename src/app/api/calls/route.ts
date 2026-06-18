import { NextResponse } from "next/server";

import { getStoredCalls } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Stored calls only — no ElevenLabs sync (use POST /api/calls/sync). */
export async function GET() {
  try {
    const calls = await getStoredCalls();
    const sorted = [...calls].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
    return NextResponse.json({ ok: true, calls: sorted });
  } catch (error) {
    console.error("[calls]", error);
    return NextResponse.json(
      { ok: false, error: "Anrufe konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
