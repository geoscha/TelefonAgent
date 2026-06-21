import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import {
  createGovernanceWorkflow,
  listGovernanceWorkflows,
} from "@/lib/governance/store";
import type { GovernanceWorkflowInput } from "@/lib/governance/types";
import { validateWorkflow } from "@/lib/governance/validate";

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
    const workflows = await listGovernanceWorkflows();
    return NextResponse.json({ ok: true, workflows });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Laden fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    const workflow = await createGovernanceWorkflow(body);
    return NextResponse.json({ ok: true, workflow });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erstellen fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
