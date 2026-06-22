import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import {
  deleteGovernanceWorkflow,
  getGovernanceWorkflow,
  updateGovernanceWorkflow,
} from "@/lib/governance/store";
import type { GovernanceWorkflowInput } from "@/lib/governance/types";
import { validateWorkflow } from "@/lib/governance/validate";
import { syncDefinitionFromGovernance } from "@/lib/workflow-engine/store";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return unauthorized();
  }

  try {
    const workflow = await getGovernanceWorkflow(params.id);
    if (!workflow) {
      return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, workflow });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Laden fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return unauthorized();
  }

  let body: GovernanceWorkflowInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const issues = validateWorkflow(body);
  if (issues.length > 0) {
    return NextResponse.json(
      { error: issues.map((i) => i.message).join(" ") },
      { status: 400 }
    );
  }

  try {
    const workflow = await updateGovernanceWorkflow(params.id, body);
    await syncDefinitionFromGovernance(workflow);
    return NextResponse.json({ ok: true, workflow });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return unauthorized();
  }

  try {
    await deleteGovernanceWorkflow(params.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Löschen fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
