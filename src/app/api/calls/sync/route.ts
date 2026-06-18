import { NextResponse } from "next/server";

import { syncCallsForCurrentUser } from "@/lib/elevenlabs/sync-calls";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const synced = await syncCallsForCurrentUser();
    return NextResponse.json({ ok: true, synced });
  } catch (error) {
    console.error("[calls/sync]", error);
    return NextResponse.json(
      { ok: false, error: "Synchronisation fehlgeschlagen." },
      { status: 500 }
    );
  }
}
