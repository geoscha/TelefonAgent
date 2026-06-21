import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import {
  getGovernanceDraft,
  listGovernanceWorkflows,
  updateGovernanceDraft,
} from "@/lib/governance/store";
import type { GovernanceDraftConfig } from "@/lib/governance/types";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
}

export async function GET() {
  try {
    await requireAdminSession();
  } catch {
    return unauthorized();
  }

  try {
    const [{ config, currentVersion }, workflows] = await Promise.all([
      getGovernanceDraft(),
      listGovernanceWorkflows(),
    ]);
    return NextResponse.json({
      ok: true,
      config,
      workflows,
      currentVersion,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Laden fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await requireAdminSession();
  } catch {
    return unauthorized();
  }

  let body: Partial<GovernanceDraftConfig>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  try {
    const config = await updateGovernanceDraft(body);
    return NextResponse.json({ ok: true, config });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
