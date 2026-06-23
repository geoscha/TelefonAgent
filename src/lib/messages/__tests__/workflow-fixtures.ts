import { bootstrapExecutionSlots } from "@/lib/workflow-engine/executor";
import type { WorkflowSessionContext } from "@/lib/workflow-engine/session";
import type { WorkflowDefinition, WorkflowExecution } from "@/lib/workflow-engine/types";

export const FIXTURE_USER_ID = "test-user-001";
export const FIXTURE_AGENT_ID = "test-agent-001";
export const FIXTURE_THREAD_ID = "gmail-thread-fixture-1";

export const SCHADENSFALL_DEFINITION: WorkflowDefinition = {
  workflowId: "wf-schaden",
  slug: "schadensfall-meldung",
  name: "Schadensfall-Meldung",
  description: "Test fixture",
  version: 1,
  strictMode: false,
  triggerIntent: "Schaden melden",
  triggerPatterns: ["schaden", "wasser", "rohrbruch", "notfall"],
  categoryHints: ["Schadenmeldung"],
  goals: ["Schaden erfassen"],
  requiredSlots: [
    { key: "name", label: "Name" },
    { key: "object_address", label: "Mietobjekt / Adresse" },
    { key: "damage_type", label: "Art des Schadens" },
    { key: "location", label: "Ort im Objekt" },
    { key: "since_when", label: "Seit wann" },
    { key: "urgency", label: "Dringlichkeit" },
    { key: "reachability", label: "Erreichbarkeit" },
  ],
  optionalSlots: [{ key: "photos", label: "Fotos" }],
  steps: [{ id: "collect", type: "collect", label: "Angaben sammeln" }],
  allowedTools: ["lookup_customer", "check_availability"],
  kbSources: ["craftsmen"],
  escalationRules: "Notfall sofort eskalieren.",
  completionCriteria: "Alle Pflichtfelder erfasst.",
  businessRules:
    "Bei Notfall: Erste-Hilfe-Hinweise geben und Dringlichkeit hoch setzen.",
  outputSchema: [
    { key: "name", label: "Name", type: "text" },
    { key: "damage_type", label: "Schaden", type: "text" },
    { key: "urgency", label: "Dringlichkeit", type: "text" },
  ],
  voiceInstructions: "",
  messageInstructions:
    "Bei Notfall Erste-Hilfe-Hinweise und Dringlichkeit hoch.",
  fallback: "",
};

export const ALLGEMEINE_AUSKUNFT_DEFINITION: WorkflowDefinition = {
  ...SCHADENSFALL_DEFINITION,
  workflowId: "wf-info",
  slug: "allgemeine-auskunft",
  name: "Allgemeine Auskunft",
  triggerPatterns: ["nebenkosten", "information", "frage"],
  requiredSlots: [{ key: "inquiry_topic", label: "Thema der Anfrage" }],
  optionalSlots: [],
};

export const DAMAGE_THREAD_TEXT = `[12.03.2026 09:15] Max Muster: [Betreff: Wasserrohrbruch] Guten Tag, in meiner Wohnung an der Bahnhofstrasse 12 läuft seit heute Morgen Wasser aus der Küche. Bitte dringend Handwerker organisieren. Erreichbar unter 079 123 45 67.`;

export const DAMAGE_THREAD_PARTIAL_SLOTS = {
  name: "Max Muster",
  object_address: "Bahnhofstrasse 12",
  damage_type: "Wasserrohrbruch",
};

export const NEBENKOSTEN_THREAD_TEXT = `[12.03.2026 10:00] Anna Beispiel: [Betreff: Nebenkostenabrechnung 2025] Guten Tag, ich habe eine Frage zu meiner Nebenkostenabrechnung. Können Sie mir erklären, wie der Heizungsanteil berechnet wurde?`;

export const NOTFALL_THREAD_TEXT = `[12.03.2026 11:00] Lisa Keller: NOTFALL — Gasgeruch in der Wohnung Seestrasse 5, bitte sofort Hilfe!`;

export function makeExecution(
  definition: WorkflowDefinition,
  threadText: string,
  overrides?: Partial<WorkflowExecution>
): WorkflowExecution {
  return {
    id: "exec-fixture-1",
    userId: FIXTURE_USER_ID,
    workflowSlug: definition.slug,
    workflowVersion: definition.version,
    channel: "message",
    sourceRef: `message:${FIXTURE_THREAD_ID}`,
    agentId: FIXTURE_AGENT_ID,
    currentStepId: "collect",
    slots: bootstrapExecutionSlots(definition, threadText),
    status: "active",
    routerConfidence: 0.82,
    routerReason: "pattern:schaden",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function makeSession(
  definition: WorkflowDefinition,
  threadText: string,
  overrides?: Partial<WorkflowSessionContext>
): WorkflowSessionContext {
  const execution = makeExecution(definition, threadText, overrides?.execution);
  return {
    engineEnabled: true,
    routerSlug: definition.slug,
    routerConfidence: execution.routerConfidence,
    definition,
    execution,
    compiledMessageBlock: `# Aktiver Workflow\n${definition.messageInstructions}`,
    ...overrides,
  };
}
