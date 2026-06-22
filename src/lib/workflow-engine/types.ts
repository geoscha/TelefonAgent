import type {
  GovernanceWorkflow,
  WorkflowOutputField,
  WorkflowSlot,
} from "@/lib/governance/types";

export type WorkflowEngineChannel = "voice" | "message";

export type WorkflowStepType =
  | "collect"
  | "validate"
  | "act"
  | "branch"
  | "escalate"
  | "complete";

export type WorkflowKbSource =
  | "website"
  | "craftsmen"
  | "curated_faq"
  | "governance_kb"
  | "none";

export type WorkflowAllowedTool =
  | "book_appointment"
  | "check_availability"
  | "cancel_appointment"
  | "find_appointments"
  | "lookup_customer"
  | "get_workflow_context"
  | "escalate";

export interface WorkflowBranchRule {
  /** Slot key or keyword trigger, e.g. "urgency=notfall" */
  condition: string;
  nextStepId: string;
}

export interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  label: string;
  instructions?: string;
  requiredSlotKeys?: string[];
  nextStepId?: string;
  branchRules?: WorkflowBranchRule[];
}

export interface WorkflowDefinition {
  workflowId: string;
  slug: string;
  name: string;
  description: string;
  version: number;
  strictMode: boolean;
  triggerIntent: string;
  triggerPatterns: string[];
  categoryHints: string[];
  goals: string[];
  requiredSlots: WorkflowSlot[];
  optionalSlots: WorkflowSlot[];
  steps: WorkflowStep[];
  allowedTools: WorkflowAllowedTool[];
  kbSources: WorkflowKbSource[];
  escalationRules: string;
  completionCriteria: string;
  businessRules: string;
  outputSchema: WorkflowOutputField[];
  voiceInstructions: string;
  messageInstructions: string;
  fallback: string;
}

export interface CompiledWorkflowDefinition {
  definition: WorkflowDefinition;
  voiceBlock: string;
  messageBlock: string;
  routerHints: string[];
}

export interface WorkflowDefinitionRecord {
  id: string;
  governanceWorkflowId: string;
  slug: string;
  definition: WorkflowDefinition;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowDefinitionVersion {
  id: string;
  definitionId: string;
  versionNumber: number;
  definitionSnapshot: WorkflowDefinition;
  compiled: CompiledWorkflowDefinition;
  notes?: string;
  publishedAt: string;
}

export type WorkflowExecutionStatus =
  | "active"
  | "completed"
  | "escalated"
  | "abandoned";

export interface WorkflowExecution {
  id: string;
  userId: string;
  definitionId?: string;
  workflowSlug: string;
  workflowVersion: number;
  channel: WorkflowEngineChannel;
  sourceRef?: string;
  agentId?: string;
  currentStepId?: string;
  slots: Record<string, string>;
  status: WorkflowExecutionStatus;
  routerConfidence?: number;
  routerReason?: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type WorkflowCaseStatus = "open" | "closed" | "escalated";

export interface WorkflowCase {
  id: string;
  userId: string;
  executionId?: string;
  definitionId?: string;
  workflowSlug: string;
  workflowVersion: number;
  channel: WorkflowEngineChannel;
  sourceRef?: string;
  status: WorkflowCaseStatus;
  output: Record<string, unknown>;
  escalated: boolean;
  strictMode: boolean;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface WorkflowCaseEvent {
  id: string;
  caseId: string;
  eventType: string;
  stepId?: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface WorkflowTestCase {
  id: string;
  definitionId: string;
  name: string;
  channel: WorkflowEngineChannel;
  inputText: string;
  expectedSlug?: string;
  expectedSlots: Record<string, string>;
  forbiddenOutputs: string[];
  mustEscalate: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RouterResult {
  slug: string;
  confidence: number;
  reason: string;
  workflow?: WorkflowDefinition;
  version?: number;
}

export interface SlotValidationResult {
  valid: boolean;
  missing: string[];
  invalid: Array<{ key: string; message: string }>;
  filled: Record<string, string>;
}

export interface PromptBuildInput {
  agent: import("@/lib/onboarding-types").StoredAgent;
  channel: WorkflowEngineChannel;
  userId?: string;
  activeWorkflow?: WorkflowDefinition | null;
  execution?: WorkflowExecution | null;
  includeLegacyAllWorkflows?: boolean;
}

export type GovernanceWorkflowSource = GovernanceWorkflow;
