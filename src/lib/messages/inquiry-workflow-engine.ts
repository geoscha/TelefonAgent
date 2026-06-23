import "server-only";

import type { MessageInquiry, MessageSuggestedAction } from "@/lib/messages/inquiry-types";
import {
  getActiveExecutionForSource,
  updateWorkflowExecution,
  completeWorkflowExecution,
} from "@/lib/workflow-engine/case-store";
import { isWorkflowEngineEnabledForUser } from "@/lib/workflow-engine/flags";
import {
  buildMissingSlotsPrompt,
  slotLabelMap,
  validateWorkflowSlots,
} from "@/lib/workflow-engine/slot-validator";
import { getPublishedWorkflowDefinition } from "@/lib/workflow-engine/store";
import { resolveWorkflowSession } from "@/lib/workflow-engine/session";
import type { WorkflowSessionContext } from "@/lib/workflow-engine/session";
import type { WorkflowDefinition } from "@/lib/workflow-engine/types";

/** Workflows that never trigger craftsman / repair dispatch. */
export const NON_DISPATCH_WORKFLOW_SLUG = "allgemeine-auskunft";

/** Slugs where low router confidence downgrades to non-dispatch. Calibrate via eval set. */
export const DISPATCH_CAPABLE_WORKFLOW_SLUGS = new Set([
  "schadensfall-meldung",
]);

/** Minimum router confidence before dispatch-capable workflows may dispatch. */
export const DISPATCH_CONFIDENCE_FLOOR = 0.55;

const DISPATCH_ACTION_TYPES = new Set<MessageSuggestedAction["type"]>([
  "contact_craftsman",
  "schedule_repair",
]);

export function mailWorkflowSourceRef(threadId: string): string {
  return `message:${threadId}`;
}

export function effectiveDispatchWorkflowSlug(
  slug: string,
  routerConfidence?: number
): string {
  if (slug === NON_DISPATCH_WORKFLOW_SLUG) return slug;
  if (
    DISPATCH_CAPABLE_WORKFLOW_SLUGS.has(slug) &&
    (routerConfidence ?? 0) < DISPATCH_CONFIDENCE_FLOOR
  ) {
    return NON_DISPATCH_WORKFLOW_SLUG;
  }
  return slug;
}

export function isWorkflowDispatchAllowed(
  slug: string,
  routerConfidence?: number
): boolean {
  return (
    effectiveDispatchWorkflowSlug(slug, routerConfidence) !==
    NON_DISPATCH_WORKFLOW_SLUG
  );
}

export function isInquiryDispatchReady(input: {
  matchedWorkflowSlug?: string;
  workflowSlots?: Record<string, string>;
  definition: WorkflowDefinition;
  routerConfidence?: number;
}): boolean {
  if (!isWorkflowDispatchAllowed(input.matchedWorkflowSlug ?? "", input.routerConfidence)) {
    return false;
  }
  return validateWorkflowSlots(
    input.definition,
    input.workflowSlots ?? {}
  ).valid;
}

function stripDispatchOutputs<T extends {
  suggestedActions: MessageSuggestedAction[];
  craftsmanDrafts?: MessageInquiry["craftsmanDrafts"];
}>(result: T): T {
  return {
    ...result,
    suggestedActions: result.suggestedActions.filter(
      (action) => !DISPATCH_ACTION_TYPES.has(action.type)
    ),
    craftsmanDrafts: [],
  };
}

function ensureDraftAsksForMissingSlots(
  draftReply: string | undefined,
  definition: WorkflowDefinition,
  missingKeys: string[]
): string | undefined {
  if (!draftReply?.trim() || missingKeys.length === 0) return draftReply;

  const labels = missingKeys.map(
    (key) => slotLabelMap(definition)[key] ?? key
  );
  const firstLabel = labels[0]?.toLowerCase() ?? "";
  if (firstLabel && draftReply.toLowerCase().includes(firstLabel.slice(0, 6))) {
    return draftReply;
  }

  const ask =
    labels.length === 1
      ? `Könnten Sie uns bitte noch mitteilen: ${labels[0]}?`
      : `Damit wir Ihr Anliegen bearbeiten können, benötigen wir noch: ${labels.join(", ")}.`;

  return `${draftReply.trim()}\n\n${ask}\n\nFreundliche Grüsse\nIhre Liegenschaftsverwaltung`;
}

export async function applyWorkflowEngineEnforcement(input: {
  result: {
    actionable: boolean;
    draftReply?: string;
    suggestedActions: MessageSuggestedAction[];
    craftsmanDrafts?: MessageInquiry["craftsmanDrafts"];
    workflowSlots?: Record<string, string>;
  };
  session: WorkflowSessionContext;
  userId: string;
}): Promise<{
  draftReply?: string;
  suggestedActions: MessageSuggestedAction[];
  craftsmanDrafts?: MessageInquiry["craftsmanDrafts"];
  workflowSlots?: Record<string, string>;
  matchedWorkflow: { slug: string; name: string; description?: string };
  slotsComplete: boolean;
  dispatchAllowed: boolean;
  workflowRouterConfidence?: number;
}> {
  const { definition, execution, routerConfidence } = input.session;
  if (!definition || !execution) {
    throw new Error("Workflow-Session ohne Definition oder Execution.");
  }

  const mergedSlots = {
    ...execution.slots,
    ...(input.result.workflowSlots ?? {}),
  };

  await updateWorkflowExecution(execution.id, { slots: mergedSlots });

  const validation = validateWorkflowSlots(definition, mergedSlots);
  const dispatchAllowed =
    input.result.actionable &&
    isWorkflowDispatchAllowed(definition.slug, routerConfidence);

  let draftReply = input.result.draftReply;
  let suggestedActions = input.result.suggestedActions;
  let craftsmanDrafts = input.result.craftsmanDrafts;

  const slotsComplete = validation.valid;
  const dispatchReady = dispatchAllowed && slotsComplete;

  if (!dispatchReady) {
    ({ suggestedActions, craftsmanDrafts } = stripDispatchOutputs({
      suggestedActions,
      craftsmanDrafts,
    }));
  }

  if (input.result.actionable && !slotsComplete && validation.missing.length > 0) {
    draftReply = ensureDraftAsksForMissingSlots(
      draftReply,
      definition,
      validation.missing
    );
  }

  if (input.result.actionable && !slotsComplete && validation.missing.length > 0) {
    const hint = buildMissingSlotsPrompt(definition, mergedSlots);
    if (hint && draftReply && !draftReply.includes("Pflichtfelder")) {
      // Reinforce slot collection in draft when model skipped explicit ask.
      draftReply = ensureDraftAsksForMissingSlots(
        draftReply,
        definition,
        validation.missing
      );
    }
  }

  return {
    draftReply,
    suggestedActions,
    craftsmanDrafts,
    workflowSlots: mergedSlots,
    matchedWorkflow: {
      slug: definition.slug,
      name: definition.name,
      description: definition.description,
    },
    slotsComplete,
    dispatchAllowed,
    workflowRouterConfidence: routerConfidence,
  };
}

export async function isInquiryDispatchReadyAsync(
  inquiry: Pick<
    MessageInquiry,
    "matchedWorkflow" | "workflowSlots" | "workflowRouterConfidence"
  >
): Promise<boolean> {
  const slug = inquiry.matchedWorkflow?.slug;
  if (!slug) return false;

  const published = await getPublishedWorkflowDefinition(slug);
  if (!published?.definition) return false;

  return isInquiryDispatchReady({
    matchedWorkflowSlug: slug,
    workflowSlots: inquiry.workflowSlots,
    definition: published.definition,
    routerConfidence: inquiry.workflowRouterConfidence,
  });
}

export async function attachWorkflowCaseOnExecute(input: {
  userId: string;
  threadId: string;
  inquiry: Pick<MessageInquiry, "workflowSlots" | "matchedWorkflow">;
  committed: boolean;
}): Promise<string | undefined> {
  if (!input.committed) return undefined;
  if (!(await isWorkflowEngineEnabledForUser(input.userId))) return undefined;

  const execution = await getActiveExecutionForSource({
    userId: input.userId,
    sourceRef: mailWorkflowSourceRef(input.threadId),
  });
  if (!execution || execution.status !== "active") return undefined;

  const slug =
    input.inquiry.matchedWorkflow?.slug ?? execution.workflowSlug;
  const published = await getPublishedWorkflowDefinition(slug);
  if (!published?.definition) return undefined;

  const mergedSlots = {
    ...execution.slots,
    ...(input.inquiry.workflowSlots ?? {}),
  };

  const { workflowCase } = await completeWorkflowExecution({
    execution,
    definition: published.definition,
    userId: input.userId,
    newSlots: mergedSlots,
  });

  return workflowCase.id;
}

export async function resolveMailWorkflowSession(input: {
  userId?: string;
  threadId: string;
  threadText: string;
  agentId: string;
}): Promise<WorkflowSessionContext | null> {
  if (!input.userId || !(await isWorkflowEngineEnabledForUser(input.userId))) {
    return null;
  }

  let session = await resolveWorkflowSession({
    userId: input.userId,
    channel: "message",
    text: input.threadText,
    sourceRef: mailWorkflowSourceRef(input.threadId),
    agentId: input.agentId,
  });

  if (!session.engineEnabled || !session.definition) {
    return null;
  }

  if (
    session.execution &&
    session.execution.workflowSlug !== session.definition.slug
  ) {
    const published = await getPublishedWorkflowDefinition(
      session.execution.workflowSlug
    );
    if (published?.definition) {
      session = {
        ...session,
        definition: published.definition,
        compiledMessageBlock: published.compiled.messageBlock,
        routerSlug: session.execution.workflowSlug,
      };
    }
  }

  return session;
}
