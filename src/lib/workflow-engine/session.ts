import "server-only";

import { isWorkflowEngineEnabledForUser } from "@/lib/workflow-engine/flags";
import { classifyWorkflowIntent } from "@/lib/workflow-engine/router";
import {
  createWorkflowExecution,
  getActiveExecutionForSource,
  updateWorkflowExecution,
} from "@/lib/workflow-engine/case-store";
import { bootstrapExecutionSlots } from "@/lib/workflow-engine/executor";
import {
  getPublishedWorkflowDefinition,
  getWorkflowDefinitionBySlug,
} from "@/lib/workflow-engine/store";
import type {
  WorkflowDefinition,
  WorkflowEngineChannel,
  WorkflowExecution,
} from "@/lib/workflow-engine/types";

export interface WorkflowSessionContext {
  engineEnabled: boolean;
  routerSlug?: string;
  routerConfidence?: number;
  definition?: WorkflowDefinition;
  execution?: WorkflowExecution;
  compiledVoiceBlock?: string;
  compiledMessageBlock?: string;
}

export async function resolveWorkflowSession(input: {
  userId?: string;
  channel: WorkflowEngineChannel;
  text: string;
  sourceRef?: string;
  agentId?: string;
  category?: import("@/lib/messages/inquiry-types").MessageInquiryCategory | null;
  llmSlug?: string | null;
}): Promise<WorkflowSessionContext> {
  if (!input.userId || !(await isWorkflowEngineEnabledForUser(input.userId))) {
    return { engineEnabled: false };
  }

  const router = await classifyWorkflowIntent({
    text: input.text,
    userId: input.userId,
    category: input.category,
    llmSlug: input.llmSlug,
  });

  const published = await getPublishedWorkflowDefinition(router.slug);
  const definition =
    published?.definition ??
    router.workflow ??
    (await getWorkflowDefinitionBySlug(router.slug))?.definition;

  if (!definition) {
    return {
      engineEnabled: true,
      routerSlug: router.slug,
      routerConfidence: router.confidence,
    };
  }

  const sourceRef =
    input.sourceRef ??
    `${input.channel}:${input.userId}:${Date.now()}`;

  let execution = input.sourceRef
    ? await getActiveExecutionForSource({
        userId: input.userId,
        sourceRef: input.sourceRef,
      })
    : null;

  if (!execution) {
    execution = await createWorkflowExecution({
      userId: input.userId,
      definition,
      definitionId: (await getWorkflowDefinitionBySlug(definition.slug))?.id,
      channel: input.channel,
      sourceRef,
      agentId: input.agentId,
      initialSlots: bootstrapExecutionSlots(definition, input.text),
      routerConfidence: router.confidence,
      routerReason: router.reason,
    });
  } else {
    const merged = {
      ...execution.slots,
      ...bootstrapExecutionSlots(definition, input.text),
    };
    execution = await updateWorkflowExecution(execution.id, { slots: merged });
  }

  return {
    engineEnabled: true,
    routerSlug: router.slug,
    routerConfidence: router.confidence,
    definition,
    execution,
    compiledVoiceBlock: published?.compiled.voiceBlock,
    compiledMessageBlock: published?.compiled.messageBlock,
  };
}
