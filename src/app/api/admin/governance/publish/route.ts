import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { publishGovernance } from "@/lib/governance/publish";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { notes?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* optional body */
  }

  try {
    const result = await publishGovernance(body.notes);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Veröffentlichen fehlgeschlagen.";
    const status = message.startsWith("VALIDATION_FAILED") ? 400 : 500;
    return NextResponse.json(
      {
        error: message.replace(/^VALIDATION_FAILED:\s*/, ""),
      },
      { status }
    );
  }
}
