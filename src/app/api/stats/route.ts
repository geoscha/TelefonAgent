import { NextResponse, type NextRequest } from "next/server";

import { getCallStatsForUser } from "@/lib/calls/stats";
import { syncCallsForCurrentUser } from "@/lib/elevenlabs/sync-calls";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireUserId();
    const sync = req.nextUrl.searchParams.get("sync") === "1";

    if (sync) {
      const settings = await getSettings();
      if (!settings.agentSuspendedAt) {
        try {
          await syncCallsForCurrentUser();
        } catch (err) {
          console.warn("[stats] sync skipped:", err);
        }
      }
    }

    const points = await getCallStatsForUser(userId);
    return NextResponse.json({ ok: true, calls: points, total: points.length });
  } catch (error) {
    console.error("[stats]", error);
    return NextResponse.json(
      { ok: false, error: "Statistik konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
