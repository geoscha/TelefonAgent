import { NextResponse } from "next/server";

import { getTokenPacks } from "@/lib/billing/token-packs";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireUserId();
    const packs = await getTokenPacks({ enabledOnly: true });
    return NextResponse.json({ ok: true, packs });
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }
}
