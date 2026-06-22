import type { WorkflowOutputField, WorkflowSlot } from "@/lib/governance/types";
import type { WorkflowDefinition } from "@/lib/workflow-engine/types";

function validateSlotValue(
  key: string,
  value: string,
  field?: WorkflowOutputField
): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "Leer";

  if (field?.type === "boolean") {
    if (!/^(true|false|ja|nein|yes|no)$/i.test(trimmed)) {
      return "Muss ja/nein sein";
    }
  }

  if (field?.type === "date") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) && !/\d{1,2}\.\d{1,2}\./.test(trimmed)) {
      return "Ungültiges Datum";
    }
  }

  return null;
}

export function validateWorkflowSlots(
  definition: WorkflowDefinition,
  slots: Record<string, string>
): {
  valid: boolean;
  missing: string[];
  invalid: Array<{ key: string; message: string }>;
  filled: Record<string, string>;
} {
  const missing: string[] = [];
  const invalid: Array<{ key: string; message: string }> = [];
  const filled: Record<string, string> = {};

  for (const slot of definition.requiredSlots) {
    const value = slots[slot.key]?.trim();
    if (!value) {
      missing.push(slot.key);
      continue;
    }
    const field = definition.outputSchema.find((f) => f.key === slot.key);
    const error = validateSlotValue(slot.key, value, field);
    if (error) {
      invalid.push({ key: slot.key, message: error });
    } else {
      filled[slot.key] = value;
    }
  }

  for (const slot of definition.optionalSlots) {
    const value = slots[slot.key]?.trim();
    if (value) {
      filled[slot.key] = value;
    }
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    filled,
  };
}

export function extractSlotsFromText(
  definition: WorkflowDefinition,
  text: string
): Record<string, string> {
  const slots: Record<string, string> = {};
  const normalized = text.toLowerCase();

  for (const slot of [...definition.requiredSlots, ...definition.optionalSlots]) {
    if (slot.key === "urgency" && /notfall|dringend|sofort/.test(normalized)) {
      slots.urgency = "hoch";
    }
    if (slot.key === "legal_topic" && definition.slug === "rechtsauskunft") {
      if (/kündigung|kündigen/.test(normalized)) slots.legal_topic = "Kündigung";
      else if (/schadenersatz/.test(normalized)) slots.legal_topic = "Schadenersatz";
      else if (/mietvertrag/.test(normalized)) slots.legal_topic = "Mietvertrag";
    }
  }

  if (definition.slug === "rechtsauskunft") {
    slots.question_summary = text.trim().slice(0, 500);
  }

  return slots;
}

export function buildMissingSlotsPrompt(
  definition: WorkflowDefinition,
  slots: Record<string, string>
): string {
  const validation = validateWorkflowSlots(definition, slots);
  if (validation.valid) return "";

  const missingLabels = validation.missing
    .map((key) => definition.requiredSlots.find((s) => s.key === key)?.label ?? key)
    .join(", ");

  return `# Fehlende Pflichtfelder
Noch ausständig: ${missingLabels}.
Frage gezielt nach genau einem fehlenden Feld pro Schritt.`;
}

export function slotLabelMap(definition: WorkflowDefinition): Record<string, string> {
  const map: Record<string, string> = {};
  for (const slot of [...definition.requiredSlots, ...definition.optionalSlots] as WorkflowSlot[]) {
    map[slot.key] = slot.label;
  }
  return map;
}
