import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { rollbackGovernanceVersion } from "@/lib/governance/store";
import {
  invalidateGovernanceCache,
  primeGovernanceCache,
} from "@/lib/governance/runtime";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { versionNumber?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const versionNumber = Number(body.versionNumber);
  if (!Number.isFinite(versionNumber) || versionNumber <= 0) {
    return NextResponse.json(
      { error: "Ungültige Versionsnummer." },
      { status: 400 }
    );
  }

  try {
    const compiled = await rollbackGovernanceVersion(versionNumber);
    invalidateGovernanceCache();
    primeGovernanceCache(compiled);
    return NextResponse.json({ ok: true, version: versionNumber, compiled });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Rollback fehlgeschlagen.";
    const status = message === "VERSION_NOT_FOUND" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
