import "server-only";

import {
  advanceExecutionStep,
  buildStructuredOutput,
} from "@/lib/workflow-engine/executor";
import type {
  WorkflowCase,
  WorkflowCaseEvent,
  WorkflowDefinition,
  WorkflowEngineChannel,
  WorkflowExecution,
  WorkflowExecutionStatus,
} from "@/lib/workflow-engine/types";
import { createAdminClient } from "@/lib/supabase/admin";

function rowToExecution(row: Record<string, unknown>): WorkflowExecution {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    definitionId: row.definition_id ? String(row.definition_id) : undefined,
    workflowSlug: String(row.workflow_slug),
    workflowVersion: Number(row.workflow_version ?? 0),
    channel: row.channel as WorkflowEngineChannel,
    sourceRef: row.source_ref ? String(row.source_ref) : undefined,
    agentId: row.agent_id ? String(row.agent_id) : undefined,
    currentStepId: row.current_step_id ? String(row.current_step_id) : undefined,
    slots: (row.slots ?? {}) as Record<string, string>,
    status: row.status as WorkflowExecutionStatus,
    routerConfidence: row.router_confidence != null ? Number(row.router_confidence) : undefined,
    routerReason: row.router_reason ? String(row.router_reason) : undefined,
    startedAt: String(row.started_at),
    updatedAt: String(row.updated_at),
    completedAt: row.completed_at ? String(row.completed_at) : undefined,
  };
}

function rowToCase(row: Record<string, unknown>): WorkflowCase {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    executionId: row.execution_id ? String(row.execution_id) : undefined,
    definitionId: row.definition_id ? String(row.definition_id) : undefined,
    workflowSlug: String(row.workflow_slug),
    workflowVersion: Number(row.workflow_version ?? 0),
    channel: row.channel as WorkflowEngineChannel,
    sourceRef: row.source_ref ? String(row.source_ref) : undefined,
    status: row.status as WorkflowCase["status"],
    output: (row.output ?? {}) as Record<string, unknown>,
    escalated: Boolean(row.escalated),
    strictMode: Boolean(row.strict_mode),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    closedAt: row.closed_at ? String(row.closed_at) : undefined,
  };
}

export async function createWorkflowExecution(input: {
  userId: string;
  definition: WorkflowDefinition;
  definitionId?: string;
  channel: WorkflowEngineChannel;
  sourceRef?: string;
  agentId?: string;
  initialSlots?: Record<string, string>;
  routerConfidence?: number;
  routerReason?: string;
}): Promise<WorkflowExecution> {
  const admin = createAdminClient();
  const firstStep = input.definition.steps[0]?.id ?? "collect";

  const { data, error } = await admin
    .from("workflow_executions")
    .insert({
      user_id: input.userId,
      definition_id: input.definitionId ?? null,
      workflow_slug: input.definition.slug,
      workflow_version: input.definition.version,
      channel: input.channel,
      source_ref: input.sourceRef ?? null,
      agent_id: input.agentId ?? null,
      current_step_id: firstStep,
      slots: input.initialSlots ?? {},
      status: "active",
      router_confidence: input.routerConfidence ?? null,
      router_reason: input.routerReason ?? null,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Execution konnte nicht erstellt werden.");
  }
  return rowToExecution(data);
}

export async function getWorkflowExecution(
  executionId: string
): Promise<WorkflowExecution | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_executions")
    .select("*")
    .eq("id", executionId)
    .maybeSingle();
  return data ? rowToExecution(data) : null;
}

export async function getActiveExecutionForSource(input: {
  userId: string;
  sourceRef: string;
}): Promise<WorkflowExecution | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_executions")
    .select("*")
    .eq("user_id", input.userId)
    .eq("source_ref", input.sourceRef)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? rowToExecution(data) : null;
}

export async function updateWorkflowExecution(
  executionId: string,
  patch: Partial<{
    slots: Record<string, string>;
    currentStepId: string | null;
    status: WorkflowExecutionStatus;
    completedAt: string;
  }>
): Promise<WorkflowExecution> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workflow_executions")
    .update({
      ...(patch.slots !== undefined ? { slots: patch.slots } : {}),
      ...(patch.currentStepId !== undefined
        ? { current_step_id: patch.currentStepId }
        : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.completedAt !== undefined ? { completed_at: patch.completedAt } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Execution konnte nicht aktualisiert werden.");
  }
  return rowToExecution(data);
}

export async function appendCaseEvent(input: {
  caseId: string;
  eventType: string;
  stepId?: string;
  payload?: Record<string, unknown>;
}): Promise<WorkflowCaseEvent> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("workflow_case_events")
    .insert({
      case_id: input.caseId,
      event_type: input.eventType,
      step_id: input.stepId ?? null,
      payload: input.payload ?? {},
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Case-Event konnte nicht gespeichert werden.");
  }

  return {
    id: String(data.id),
    caseId: String(data.case_id),
    eventType: String(data.event_type),
    stepId: data.step_id ? String(data.step_id) : undefined,
    payload: (data.payload ?? {}) as Record<string, unknown>,
    createdAt: String(data.created_at),
  };
}

export async function createWorkflowCase(input: {
  userId: string;
  execution: WorkflowExecution;
  definition: WorkflowDefinition;
  output: Record<string, unknown>;
  escalated?: boolean;
}): Promise<WorkflowCase> {
  const admin = createAdminClient();
  const status = input.escalated ? "escalated" : "open";

  const { data, error } = await admin
    .from("workflow_cases")
    .insert({
      user_id: input.userId,
      execution_id: input.execution.id,
      definition_id: input.execution.definitionId ?? null,
      workflow_slug: input.definition.slug,
      workflow_version: input.definition.version,
      channel: input.execution.channel,
      source_ref: input.execution.sourceRef ?? null,
      status,
      output: input.output,
      escalated: Boolean(input.escalated),
      strict_mode: input.definition.strictMode,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Case konnte nicht erstellt werden.");
  }

  const workflowCase = rowToCase(data);
  await appendCaseEvent({
    caseId: workflowCase.id,
    eventType: "case_created",
    payload: { output: input.output, escalated: input.escalated ?? false },
  });

  return workflowCase;
}

export async function completeWorkflowExecution(input: {
  execution: WorkflowExecution;
  definition: WorkflowDefinition;
  userId: string;
  newSlots?: Record<string, string>;
  escalated?: boolean;
  escalationReason?: string;
}): Promise<{ execution: WorkflowExecution; workflowCase: WorkflowCase }> {
  const mergedSlots = { ...input.execution.slots, ...(input.newSlots ?? {}) };
  const advance = advanceExecutionStep(input.definition, input.execution, mergedSlots);

  const status: WorkflowExecutionStatus = input.escalated || advance.shouldEscalate
    ? "escalated"
    : "completed";

  const execution = await updateWorkflowExecution(input.execution.id, {
    slots: mergedSlots,
    currentStepId: advance.nextStepId,
    status,
    completedAt: new Date().toISOString(),
  });

  const output = buildStructuredOutput(input.definition, mergedSlots, {
    escalated: input.escalated || advance.shouldEscalate,
    escalationReason: input.escalationReason,
  });

  const workflowCase = await createWorkflowCase({
    userId: input.userId,
    execution,
    definition: input.definition,
    output,
    escalated: input.escalated || advance.shouldEscalate,
  });

  await appendCaseEvent({
    caseId: workflowCase.id,
    eventType: "execution_completed",
    stepId: execution.currentStepId ?? undefined,
    payload: { slots: mergedSlots, status },
  });

  return { execution, workflowCase };
}

export async function getWorkflowCase(caseId: string): Promise<WorkflowCase | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  return data ? rowToCase(data) : null;
}

export async function listCaseEvents(caseId: string): Promise<WorkflowCaseEvent[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("workflow_case_events")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at");
  return (data ?? []).map((row) => ({
    id: String(row.id),
    caseId: String(row.case_id),
    eventType: String(row.event_type),
    stepId: row.step_id ? String(row.step_id) : undefined,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: String(row.created_at),
  }));
}
