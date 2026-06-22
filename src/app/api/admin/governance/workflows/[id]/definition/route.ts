import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { getGovernanceWorkflow } from "@/lib/governance/store";
import {
  getWorkflowDefinitionBySlug,
  listWorkflowDefinitionVersions,
  syncDefinitionFromGovernance,
  updateWorkflowDefinitionDraft,
} from "@/lib/workflow-engine/store";
import type { WorkflowDefinition } from "@/lib/workflow-engine/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  try {
    const workflow = await getGovernanceWorkflow(params.id);
    if (!workflow) {
      return NextResponse.json({ error: "Nicht gefunden." }, { status: 404 });
    }

    await syncDefinitionFromGovernance(workflow);
    const definition = await getWorkflowDefinitionBySlug(workflow.slug);
    const versions = definition
      ? await listWorkflowDefinitionVersions(definition.id)
      : [];

    return NextResponse.json({
      ok: true,
      workflow,
      definition,
      versions,
      engineEnabled: process.env.WORKFLOW_ENGINE_ENABLED === "true",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Laden fehlgeschlagen.";
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
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 401 });
  }

  let body: { definition: WorkflowDefinition };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
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

    const updated = await updateWorkflowDefinitionDraft(record.id, {
      ...body.definition,
      workflowId: workflow.id,
      slug: workflow.slug,
    });

    return NextResponse.json({ ok: true, definition: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Speichern fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
