import "server-only";

import {
  buildMissingSlotsPrompt,
  extractSlotsFromText,
  validateWorkflowSlots,
} from "@/lib/workflow-engine/slot-validator";
import type {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowStep,
} from "@/lib/workflow-engine/types";

export function getCurrentStep(
  definition: WorkflowDefinition,
  execution: WorkflowExecution
): WorkflowStep | null {
  const stepId = execution.currentStepId ?? definition.steps[0]?.id;
  if (!stepId) return null;
  return definition.steps.find((s) => s.id === stepId) ?? null;
}

export function mergeExecutionSlots(
  execution: WorkflowExecution,
  incoming: Record<string, string>
): Record<string, string> {
  return { ...execution.slots, ...incoming };
}

export function advanceExecutionStep(
  definition: WorkflowDefinition,
  execution: WorkflowExecution,
  slots: Record<string, string>
): {
  nextStepId: string | null;
  shouldEscalate: boolean;
  shouldComplete: boolean;
} {
  const current = getCurrentStep(definition, execution);
  if (!current) {
    return { nextStepId: null, shouldEscalate: false, shouldComplete: true };
  }

  const merged = mergeExecutionSlots(execution, slots);
  const validation = validateWorkflowSlots(definition, merged);

  if (current.type === "escalate") {
    return { nextStepId: null, shouldEscalate: true, shouldComplete: true };
  }

  if (current.type === "branch" && current.branchRules?.length) {
    const normalized = JSON.stringify(merged).toLowerCase();
    for (const rule of current.branchRules) {
      if (normalized.includes(rule.condition.toLowerCase())) {
        return {
          nextStepId: rule.nextStepId,
          shouldEscalate: false,
          shouldComplete: false,
        };
      }
    }
  }

  if (current.type === "validate" && !validation.valid) {
    return {
      nextStepId: "collect",
      shouldEscalate: false,
      shouldComplete: false,
    };
  }

  if (current.type === "complete" || (current.type === "validate" && validation.valid)) {
    return { nextStepId: null, shouldEscalate: false, shouldComplete: true };
  }

  if (current.nextStepId) {
    return {
      nextStepId: current.nextStepId,
      shouldEscalate: false,
      shouldComplete: false,
    };
  }

  return { nextStepId: null, shouldEscalate: false, shouldComplete: true };
}

export function buildExecutionContextBlock(
  definition: WorkflowDefinition,
  execution: WorkflowExecution
): string {
  const step = getCurrentStep(definition, execution);
  const validation = validateWorkflowSlots(definition, execution.slots);
  const missingPrompt = buildMissingSlotsPrompt(definition, execution.slots);

  const filledEntries = Object.entries(execution.slots)
    .filter(([, v]) => v?.trim())
    .map(([k, v]) => `- \`${k}\`: ${v}`)
    .join("\n");

  return [
    `# Aktiver Workflow: ${definition.name} (${definition.slug})`,
    definition.strictMode
      ? "**STRIKTER MODUS** — keine Rechtsberatung, nur kuratierte Infos."
      : "",
    step ? `## Aktueller Schritt: ${step.label} (${step.type})` : "",
    step?.instructions ? step.instructions : "",
    filledEntries ? `## Erfasste Felder\n${filledEntries}` : "",
    missingPrompt,
    validation.valid
      ? "## Status: Pflichtfelder vollständig — Abschluss möglich."
      : "## Status: Informationen noch unvollständig.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function bootstrapExecutionSlots(
  definition: WorkflowDefinition,
  text: string
): Record<string, string> {
  return extractSlotsFromText(definition, text);
}

export function buildStructuredOutput(
  definition: WorkflowDefinition,
  slots: Record<string, string>,
  options?: { escalated?: boolean; escalationReason?: string }
): Record<string, unknown> {
  const output: Record<string, unknown> = { ...slots };
  output._workflowSlug = definition.slug;
  output._workflowVersion = definition.version;
  output._completedAt = new Date().toISOString();

  if (options?.escalated) {
    output.escalated = true;
    if (options.escalationReason) {
      output.escalation_reason = options.escalationReason;
    }
  }

  for (const field of definition.outputSchema) {
    if (output[field.key] == null && field.type === "boolean") {
      output[field.key] = false;
    }
  }

  return output;
}

export function isToolAllowed(
  definition: WorkflowDefinition,
  toolName: string
): boolean {
  const normalized = toolName.replace(/^action:/, "") as WorkflowDefinition["allowedTools"][number];
  return definition.allowedTools.includes(normalized);
}
