export type GovernanceChannel = "voice" | "message";

export interface WorkflowSlot {
  key: string;
  label: string;
  description?: string;
}

export interface WorkflowChannelVariant {
  instructions: string;
  slotCollection?: string;
  escalation?: string;
}

export interface WorkflowExample {
  channel: GovernanceChannel;
  dialogue: string;
}

export interface WorkflowOutputField {
  key: string;
  label: string;
  type: "text" | "enum" | "date" | "boolean";
}

export interface GovernanceWorkflow {
  id: string;
  slug: string;
  name: string;
  description: string;
  triggerIntent: string;
  goals: string[];
  requiredSlots: WorkflowSlot[];
  optionalSlots: WorkflowSlot[];
  businessRules: string;
  voiceVariant: WorkflowChannelVariant;
  messageVariant: WorkflowChannelVariant;
  fallback: string;
  outputSchema: WorkflowOutputField[];
  examples: WorkflowExample[];
  enabledGlobally: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GovernanceGlobalRules {
  grounding: string;
  fallbackBehavior: string;
  privacy: string;
  escalationGlobal: string;
}

export interface GlossaryEntry {
  term: string;
  preferred: string;
  avoid: string[];
}

export interface GovernanceToneVocabulary {
  tonePrinciples: string;
  toneExamples: string[];
  glossary: GlossaryEntry[];
  forbiddenPhrases: string[];
}

export interface GovernanceChannelSettings {
  voice: {
    liveResponseHints: string;
    speechStyle: string;
    transferRules: string;
  };
  message: {
    suggestionMode: string;
    uncertaintyHints: string;
    draftStyle: string;
  };
}

export interface GovernanceDraftConfig {
  globalRules: GovernanceGlobalRules;
  toneVocabulary: GovernanceToneVocabulary;
  channelSettings: GovernanceChannelSettings;
}

export interface CompiledWorkflowBlock {
  workflowId: string;
  slug: string;
  voiceBlock: string;
  messageBlock: string;
  enabledGlobally: boolean;
}

export interface CompiledGovernance {
  version: number;
  globalVoiceBlock: string;
  globalMessageBlock: string;
  workflows: CompiledWorkflowBlock[];
}

export interface GovernanceVersion {
  id: string;
  versionNumber: number;
  configSnapshot: {
    config: GovernanceDraftConfig;
    workflows: GovernanceWorkflow[];
  };
  compiled: CompiledGovernance;
  notes?: string;
  publishedAt: string;
}

export interface GovernanceValidationIssue {
  path: string;
  message: string;
}

export interface GovernancePreview {
  compiled: CompiledGovernance;
  validationIssues: GovernanceValidationIssue[];
  diff: {
    globalVoiceChanged: boolean;
    globalMessageChanged: boolean;
    workflowChanges: Array<{
      slug: string;
      voiceChanged: boolean;
      messageChanged: boolean;
      isNew: boolean;
      isRemoved: boolean;
    }>;
  };
}

export type GovernanceWorkflowInput = Omit<
  GovernanceWorkflow,
  "id" | "createdAt" | "updatedAt"
> & { id?: string };
