import { NextResponse, type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { getGovernanceWorkflow } from "@/lib/governance/store";
import { getWorkflowDefinitionBySlug } from "@/lib/workflow-engine/store";
import { runWorkflowTestCases } from "@/lib/workflow-engine/test-runner";

export const dynamic = "force-dynamic";

export async function POST(
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

    const record = await getWorkflowDefinitionBySlug(workflow.slug);
    if (!record) {
      return NextResponse.json({ error: "Definition nicht gefunden." }, { status: 404 });
    }

    const results = await runWorkflowTestCases(record.id);
    const passed = results.filter((r) => r.passed).length;

    return NextResponse.json({
      ok: true,
      total: results.length,
      passed,
      failed: results.length - passed,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tests fehlgeschlagen.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
