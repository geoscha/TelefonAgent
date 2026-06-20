import { normalizeEscalationPhone } from "@/lib/integrations/medical-guardrails";
import { normalizePhoneNumber } from "@/lib/phone/normalize";
import type { StoredAgent } from "@/lib/onboarding-types";

export interface AgentEscalationContext {
  customerNumber?: string;
  linkerForwardingNumber?: string;
  phoneNumbers?: Array<{
    id: string;
    phoneNumber: string;
    customerNumber?: string;
  }>;
}

export type EscalationTargetSource = "explicit" | "none" | "invalid";

function toComparableE164(value: string): string | undefined {
  return (
    normalizeEscalationPhone(value) ??
    normalizeEscalationPhone(normalizePhoneNumber(value))
  );
}

function collectInboundNumbers(context?: AgentEscalationContext): Set<string> {
  const inbound = new Set<string>();
  for (const raw of [
    context?.linkerForwardingNumber,
    ...(context?.phoneNumbers?.map((p) => p.phoneNumber) ?? []),
  ]) {
    if (!raw?.trim()) continue;
    const normalized = toComparableE164(raw);
    if (normalized) inbound.add(normalized);
  }
  return inbound;
}

export function validateEscalationPhoneNumber(
  phone: string,
  context?: AgentEscalationContext
): { ok: true; phone: string } | { ok: false; error: string } {
  const normalized = normalizeEscalationPhone(phone);
  if (!normalized) {
    return {
      ok: false,
      error:
        "Bitte eine gültige Nummer im internationalen Format angeben (z. B. +41791234567).",
    };
  }

  const inbound = collectInboundNumbers(context);
  if (inbound.has(normalized)) {
    return {
      ok: false,
      error: "Die Eskalationsnummer darf nicht die Linker-Nummer sein.",
    };
  }

  return { ok: true, phone: normalized };
}

/**
 * Effective transfer target for transfer_to_number — only the explicit
 * escalation number on the agent. Never falls back to the coupled shop number.
 */
export function resolveAgentEscalationPhone(
  agent: Pick<StoredAgent, "escalationPhoneNumber" | "phoneNumberId">,
  context?: AgentEscalationContext
): string | undefined {
  const explicit = normalizeEscalationPhone(agent.escalationPhoneNumber);
  if (!explicit) return undefined;

  const check = validateEscalationPhoneNumber(explicit, context);
  return check.ok ? check.phone : undefined;
}

export function describeEscalationTarget(
  agent: Pick<StoredAgent, "escalationPhoneNumber" | "phoneNumberId">,
  context?: AgentEscalationContext
): { phone?: string; source: EscalationTargetSource; error?: string } {
  const raw = agent.escalationPhoneNumber?.trim();
  if (!raw) return { source: "none" };

  const check = validateEscalationPhoneNumber(raw, context);
  if (!check.ok) {
    return { source: "invalid", error: check.error };
  }

  return { phone: check.phone, source: "explicit" };
}
