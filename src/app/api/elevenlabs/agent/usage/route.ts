import { NextResponse, type NextRequest } from "next/server";

import { getAgentUsageSeconds } from "@/lib/calls/agent-usage";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const agentId = req.nextUrl.searchParams.get("agentId")?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "agentId fehlt." },
      { status: 400 }
    );
  }

  try {
    const userId = await requireUserId();
    const totalSeconds = await getAgentUsageSeconds(userId, agentId);
    return NextResponse.json({ ok: true, totalSeconds });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[agent/usage]", error);
    return NextResponse.json(
      { ok: false, error: "Einsatzzeit konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
