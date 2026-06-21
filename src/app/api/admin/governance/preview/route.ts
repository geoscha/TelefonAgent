import { NextResponse } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { previewGovernancePublish } from "@/lib/governance/publish";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const preview = await previewGovernancePublish();
    return NextResponse.json({ ok: true, preview });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Vorschau fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
