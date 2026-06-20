/** @deprecated Medical guardrails removed — kept for import compatibility. */
export function agentUsesMedicalGuardrails(): boolean {
  return false;
}

export function isMedicalIndustryText(): boolean {
  return false;
}

/** Normalizes to E.164 (e.g. +41791234567); returns undefined if invalid/empty. */
export function normalizeEscalationPhone(value?: string): string | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const compact = raw.replace(/[\s()\-./]/g, "");
  const normalized = compact.startsWith("00")
    ? `+${compact.slice(2)}`
    : compact;
  return /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : undefined;
}

export function buildMedicalGuardrailBlock(): string {
  return "";
}
