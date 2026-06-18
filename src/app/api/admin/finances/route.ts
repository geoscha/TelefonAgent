import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { getAdminFinances } from "@/lib/admin/finances";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const dashboard = await getAdminFinances();
    return NextResponse.json({ ok: true, ...dashboard });
  } catch (error) {
    console.error("[admin/finances]", error);
    return NextResponse.json(
      { ok: false, error: "Finanzdaten konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
