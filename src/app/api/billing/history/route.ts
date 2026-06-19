import { NextResponse } from "next/server";

import { getUserBillingHistory } from "@/lib/billing/billing-history";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const userId = await requireUserId();
    const history = await getUserBillingHistory(userId);
    return NextResponse.json(history);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[billing/history] failed:", error);
    return NextResponse.json(
      { error: "Abrechnungsverlauf konnte nicht geladen werden." },
      { status: 500 }
    );
  }
}
