import type { GovernanceWorkflow } from "@/lib/governance/types";
import type {
  CompiledWorkflowDefinition,
  WorkflowAllowedTool,
  WorkflowDefinition,
  WorkflowKbSource,
  WorkflowStep,
} from "@/lib/workflow-engine/types";

const DEFAULT_ALLOWED_TOOLS: WorkflowAllowedTool[] = [
  "get_workflow_context",
  "escalate",
];

const APPOINTMENT_TOOLS: WorkflowAllowedTool[] = [
  "check_availability",
  "book_appointment",
  "cancel_appointment",
  "find_appointments",
];

const CUSTOMER_TOOLS: WorkflowAllowedTool[] = ["lookup_customer"];

function defaultSteps(workflow: GovernanceWorkflow): WorkflowStep[] {
  const requiredKeys = workflow.requiredSlots.map((s) => s.key);
  return [
    {
      id: "collect",
      type: "collect",
      label: "Informationen erfassen",
      instructions:
        workflow.voiceVariant.slotCollection ||
        workflow.messageVariant.slotCollection ||
        "Erfasse alle Pflichtangaben Schritt für Schritt.",
      requiredSlotKeys: requiredKeys,
      nextStepId: "validate",
    },
    {
      id: "validate",
      type: "validate",
      label: "Angaben prüfen",
      instructions: workflow.businessRules,
      requiredSlotKeys: requiredKeys,
      nextStepId: "complete",
    },
    {
      id: "complete",
      type: "complete",
      label: "Abschluss",
      instructions: "Erzeuge die strukturierte Zusammenfassung gemäss Output-Schema.",
    },
  ];
}

function inferKbSources(slug: string, strictMode: boolean): WorkflowKbSource[] {
  if (strictMode) return ["curated_faq", "governance_kb"];
  if (slug === "schadensfall-meldung") return ["website", "craftsmen"];
  if (slug === "allgemeine-auskunft") return ["website", "governance_kb"];
  if (slug === "rechtsauskunft") return ["curated_faq", "governance_kb"];
  return ["website"];
}

function inferAllowedTools(
  slug: string,
  strictMode: boolean
): WorkflowAllowedTool[] {
  if (strictMode) {
    return ["get_workflow_context", "escalate"];
  }
  if (slug === "schadensfall-meldung") {
    return [...DEFAULT_ALLOWED_TOOLS, ...CUSTOMER_TOOLS];
  }
  if (slug === "allgemeine-auskunft" || slug === "rechtsauskunft") {
    return [...DEFAULT_ALLOWED_TOOLS];
  }
  return [...DEFAULT_ALLOWED_TOOLS, ...APPOINTMENT_TOOLS, ...CUSTOMER_TOOLS];
}

function inferCategoryHints(slug: string): string[] {
  if (slug === "schadensfall-meldung") {
    return ["Schadenmeldung", "Notfall"];
  }
  if (slug === "allgemeine-auskunft") {
    return ["Allgemein", "Vertrag/Miete"];
  }
  if (slug === "rechtsauskunft") {
    return ["Vertrag/Miete"];
  }
  return [];
}

function inferTriggerPatterns(workflow: GovernanceWorkflow): string[] {
  const slug = workflow.slug;
  if (slug === "schadensfall-meldung") {
    return [
      "schaden",
      "defekt",
      "wasserschaden",
      "heizung",
      "tropft",
      "kaputt",
      "reparatur",
      "notfall",
    ];
  }
  if (slug === "allgemeine-auskunft") {
    return [
      "öffnungszeit",
      "kontakt",
      "nebenkosten",
      "hausordnung",
      "frage",
      "auskunft",
      "information",
    ];
  }
  if (slug === "rechtsauskunft") {
    return [
      "recht",
      "kündigung",
      "mietvertrag",
      "schadenersatz",
      "klage",
      "gericht",
      "mietrecht",
      "rechtsstreit",
    ];
  }
  return [];
}

export function buildWorkflowDefinitionFromGovernance(
  workflow: GovernanceWorkflow,
  options?: {
    version?: number;
    strictMode?: boolean;
    steps?: WorkflowStep[];
    allowedTools?: WorkflowAllowedTool[];
    kbSources?: WorkflowKbSource[];
    triggerPatterns?: string[];
    categoryHints?: string[];
    completionCriteria?: string;
  }
): WorkflowDefinition {
  const strictMode = options?.strictMode ?? workflow.slug === "rechtsauskunft";
  const steps = options?.steps ?? defaultSteps(workflow);

  return {
    workflowId: workflow.id,
    slug: workflow.slug,
    name: workflow.name,
    description: workflow.description,
    version: options?.version ?? 0,
    strictMode,
    triggerIntent: workflow.triggerIntent,
    triggerPatterns: options?.triggerPatterns ?? inferTriggerPatterns(workflow),
    categoryHints: options?.categoryHints ?? inferCategoryHints(workflow.slug),
    goals: workflow.goals,
    requiredSlots: workflow.requiredSlots,
    optionalSlots: workflow.optionalSlots,
    steps,
    allowedTools:
      options?.allowedTools ?? inferAllowedTools(workflow.slug, strictMode),
    kbSources: options?.kbSources ?? inferKbSources(workflow.slug, strictMode),
    escalationRules:
      workflow.voiceVariant.escalation ||
      workflow.messageVariant.escalation ||
      workflow.businessRules,
    completionCriteria:
      options?.completionCriteria ??
      `Alle Pflichtfelder (${workflow.requiredSlots.map((s) => s.key).join(", ")}) sind ausgefüllt und validiert.`,
    businessRules: workflow.businessRules,
    outputSchema: workflow.outputSchema,
    voiceInstructions: workflow.voiceVariant.instructions,
    messageInstructions: workflow.messageVariant.instructions,
    fallback: workflow.fallback,
  };
}

function formatSlotChecklist(definition: WorkflowDefinition): string {
  const required = definition.requiredSlots
    .map((s) => `- **${s.label}** (\`${s.key}\`)${s.description ? `: ${s.description}` : ""}`)
    .join("\n");
  const optional = definition.optionalSlots
    .map((s) => `- ${s.label} (\`${s.key}\`)`)
    .join("\n");
  return [
    required ? `**Pflichtfelder:**\n${required}` : "",
    optional ? `**Optional:**\n${optional}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatSteps(definition: WorkflowDefinition): string {
  return definition.steps
    .map((step, index) => {
      const parts = [`${index + 1}. **${step.label}** (${step.type})`];
      if (step.instructions?.trim()) parts.push(step.instructions.trim());
      if (step.requiredSlotKeys?.length) {
        parts.push(`Felder: ${step.requiredSlotKeys.map((k) => `\`${k}\``).join(", ")}`);
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

export function compileWorkflowDefinition(
  definition: WorkflowDefinition
): CompiledWorkflowDefinition {
  const channelInstructions =
    definition.voiceInstructions + "\n\n" + definition.messageInstructions;

  const strictBlock = definition.strictMode
    ? `# STRIKTER MODUS
- Keine Rechtsberatung, keine Einzelfallbewertung, keine verbindlichen Zusagen.
- Nur kuratierte Informationen aus der Wissensdatenbank verwenden.
- Bei rechtlich heiklen oder unklaren Fällen: sofort eskalieren an die Verwaltung.
- Jede Antwort wird protokolliert.`
    : "";

  const voiceBlock = [
    `# Workflow: ${definition.name}`,
    definition.description,
    strictBlock,
    `## Ziel\n${definition.goals.map((g) => `- ${g}`).join("\n")}`,
    `## Geschäftsregeln\n${definition.businessRules}`,
    `## Eskalation\n${definition.escalationRules}`,
    `## Schritte (Voice)\n${formatSteps(definition)}`,
    `## Pflichtfelder\n${formatSlotChecklist(definition)}`,
    `## Voice-Anweisungen\n${definition.voiceInstructions}`,
    `## Abschluss\n${definition.completionCriteria}`,
    `## Fallback\n${definition.fallback}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const messageBlock = [
    `# Workflow: ${definition.name}`,
    definition.description,
    strictBlock,
    `## Ziel\n${definition.goals.map((g) => `- ${g}`).join("\n")}`,
    `## Geschäftsregeln\n${definition.businessRules}`,
    `## Eskalation\n${definition.escalationRules}`,
    `## Schritte (Message)\n${formatSteps(definition)}`,
    `## Pflichtfelder\n${formatSlotChecklist(definition)}`,
    `## Message-Anweisungen\n${definition.messageInstructions}`,
    `## Abschluss\n${definition.completionCriteria}`,
    `## Fallback\n${definition.fallback}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    definition,
    voiceBlock,
    messageBlock,
    routerHints: [
      definition.triggerIntent,
      ...definition.triggerPatterns,
      ...definition.categoryHints,
      channelInstructions.slice(0, 500),
    ].filter(Boolean),
  };
}
