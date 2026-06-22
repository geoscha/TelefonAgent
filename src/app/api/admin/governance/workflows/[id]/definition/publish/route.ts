import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { getGovernanceWorkflow } from "@/lib/governance/store";
import {
  getWorkflowDefinitionBySlug,
  publishWorkflowDefinition,
} from "@/lib/workflow-engine/store";
import { canPublishWorkflowDefinition } from "@/lib/workflow-engine/test-runner";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { notes?: string; skipTests?: boolean };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  try {
    const workflow = await getGovernanceWorkflow(params.id);
    if (!workflow) {
      return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
    }

    const record = await getWorkflowDefinitionBySlug(workflow.slug);
    if (!record) {
      return NextResponse.json({ error: "Definition nicht gefunden." }, { status: 404 });
    }

    if (!body.skipTests) {
      const check = await canPublishWorkflowDefinition(record.id);
      if (!check.ok) {
        return NextResponse.json(
          { ok: false, error: "Test-Cases fehlgeschlagen.", details: check.errors },
          { status: 422 }
        );
      }
    }

    const version = await publishWorkflowDefinition({
      definitionId: record.id,
      notes: body.notes,
    });

    return NextResponse.json({ ok: true, version });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Publish fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
