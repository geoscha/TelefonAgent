import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { listGovernanceVersions } from "@/lib/governance/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const versions = await listGovernanceVersions();
    return NextResponse.json({ ok: true, versions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Laden fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
