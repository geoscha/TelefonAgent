import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getUserIdByAgentId } from "@/lib/store";
import { isWorkflowEngineEnabledForUser } from "@/lib/workflow-engine/flags";
import { bootstrapExecutionSlots, buildExecutionContextBlock } from "@/lib/workflow-engine/executor";
import {
  createWorkflowExecution,
  getActiveExecutionForSource,
  updateWorkflowExecution,
} from "@/lib/workflow-engine/case-store";
import { classifyWorkflowIntent } from "@/lib/workflow-engine/router";
import {
  getPublishedWorkflowDefinition,
  getWorkflowDefinitionBySlug,
} from "@/lib/workflow-engine/store";

export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_TOOL_SECRET;
  if (!secret) return true;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "workflow-context",
    message: "Workflow-Context-Webhook erreichbar.",
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    agentId?: string;
    callerId?: string;
    inquirySummary?: string;
    conversationId?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const agentId = body.agentId?.trim();
  const inquirySummary = body.inquirySummary?.trim();
  if (!agentId || !inquirySummary) {
    return NextResponse.json(
      { ok: false, error: "agentId und inquirySummary erforderlich." },
      { status: 400 }
    );
  }

  const userId = await getUserIdByAgentId(agentId);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Agent nicht gefunden." }, { status: 404 });
  }

  if (!(await isWorkflowEngineEnabledForUser(userId))) {
    return NextResponse.json({
      ok: true,
      engineEnabled: false,
      instructions:
        "Workflow-Engine deaktiviert — nutze Standard-Prompt-Verhalten.",
    });
  }

  const sourceRef =
    body.conversationId?.trim() ||
    `voice:${agentId}:${body.callerId?.trim() || "unknown"}`;

  let execution = await getActiveExecutionForSource({ userId, sourceRef });
  const router = await classifyWorkflowIntent({
    text: inquirySummary,
    userId,
  });

  const published = router.workflow
    ? await getPublishedWorkflowDefinition(router.slug)
    : null;
  const definition =
    published?.definition ??
    router.workflow ??
    (await getWorkflowDefinitionBySlug(router.slug))?.definition;

  if (!definition) {
    return NextResponse.json({
      ok: true,
      workflowSlug: router.slug,
      confidence: router.confidence,
      instructions: "Kein Workflow gefunden — allgemeine Auskunft geben.",
    });
  }

  if (!execution) {
    execution = await createWorkflowExecution({
      userId,
      definition,
      definitionId: (await getWorkflowDefinitionBySlug(definition.slug))?.id,
      channel: "voice",
      sourceRef,
      agentId,
      initialSlots: bootstrapExecutionSlots(definition, inquirySummary),
      routerConfidence: router.confidence,
      routerReason: router.reason,
    });
  } else if (execution.workflowSlug !== definition.slug) {
    execution = await createWorkflowExecution({
      userId,
      definition,
      definitionId: (await getWorkflowDefinitionBySlug(definition.slug))?.id,
      channel: "voice",
      sourceRef,
      agentId,
      initialSlots: bootstrapExecutionSlots(definition, inquirySummary),
      routerConfidence: router.confidence,
      routerReason: `switched:${router.reason}`,
    });
  } else {
    const mergedSlots = {
      ...execution.slots,
      ...bootstrapExecutionSlots(definition, inquirySummary),
    };
    execution = await updateWorkflowExecution(execution.id, { slots: mergedSlots });
  }

  const compiledBlock =
    published?.compiled.voiceBlock ??
    buildExecutionContextBlock(definition, execution);

  return NextResponse.json({
    ok: true,
    engineEnabled: true,
    workflowSlug: definition.slug,
    workflowName: definition.name,
    strictMode: definition.strictMode,
    confidence: router.confidence,
    allowedTools: definition.allowedTools,
    missingSlots: definition.requiredSlots
      .filter((s) => !execution.slots[s.key]?.trim())
      .map((s) => s.key),
    instructions: compiledBlock,
    executionId: execution.id,
  });
}
