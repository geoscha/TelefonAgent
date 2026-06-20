import type { StoredAgent } from "@/lib/onboarding-types";
import { normalizePhoneNumber } from "@/lib/phone/normalize";

const MEDICAL_KEYWORDS =
  /(hausarzt|arztpraxis|arzt|medizin|praxis|klinik|sprechstunde|gesundheit)/i;

export function isMedicalIndustryText(value?: string): boolean {
  if (!value?.trim()) return false;
  return MEDICAL_KEYWORDS.test(value);
}

export function agentUsesMedicalGuardrails(
  agent: Pick<
    StoredAgent,
    | "medicalGuardrailsEnabled"
    | "appointmentConfig"
    | "name"
    | "systemPrompt"
    | "escalationPhoneNumber"
  >,
  branche?: string
): boolean {
  if (agent.medicalGuardrailsEnabled === false) return false;
  if (agent.medicalGuardrailsEnabled === true) return true;
  if (agent.appointmentConfig?.industryPreset === "hausarzt") return true;
  if (isMedicalIndustryText(branche)) return true;
  if (isMedicalIndustryText(agent.name)) return true;
  return isMedicalIndustryText(agent.systemPrompt);
}

export function normalizeEscalationPhone(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const normalized = normalizePhoneNumber(trimmed);
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return undefined;
  return normalized;
}

export function buildMedicalGuardrailBlock(
  escalationPhone?: string
): string {
  const transferBlock = escalationPhone
    ? `- Bei Beschwerden, Symptomen, Schmerzen, Notfällen oder medizinischen Fragen: SOFORT das Tool «transfer_to_number» zur Nummer ${escalationPhone} nutzen.
- Sage dem Anrufer kurz, dass Sie ihn/sie jetzt mit einer echten Person im Praxisteam verbinden.
- client_message: «Ich verbinde Sie jetzt mit unserem Praxisteam. Einen Moment bitte.»
- agent_message: «Anruf vom Telefonagenten — Patient mit Beschwerden oder medizinischer Anfrage. Bitte übernehmen.»`
    : `- Bei Beschwerden, Symptomen, Schmerzen, Notfällen oder medizinischen Fragen: biete SOFORT einen Rückruf durch eine echte Person im Praxisteam an (keine Weiterleitungsnummer hinterlegt).`;

  return `

# Medizinische Guardrails (verbindlich)
- Stelle KEINE Diagnosen und gib KEINE medizinische Beratung.
- Nenne keine Medikamente, Dosierungen oder Behandlungsempfehlungen.
- Bewerte keine Symptome und triff keine medizinischen Einschätzungen.
- Du bist keine Ärztin/kein Arzt — nur administrative Terminassistenz.
${transferBlock}
- Terminvereinbarungen nur für administrative Sprechstunden — keine Triage.`;
}
