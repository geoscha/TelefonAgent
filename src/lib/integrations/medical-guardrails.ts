/** @deprecated Medical guardrails removed — kept for import compatibility. */
export function agentUsesMedicalGuardrails(): boolean {
  return false;
}

export function isMedicalIndustryText(): boolean {
  return false;
}

export function normalizeEscalationPhone(value?: string): string | undefined {
  return value?.trim() || undefined;
}

export function buildMedicalGuardrailBlock(): string {
  return "";
}
