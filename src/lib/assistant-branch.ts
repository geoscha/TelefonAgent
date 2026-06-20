import {
  configForPrivateAssistant,
  configFromPreset,
} from "@/lib/integrations/appointment-config";
import type { StoredAgent } from "@/lib/onboarding-types";

export type AssistantBranchId = "private_assistant" | "coiffeur";

export const ASSISTANT_BRANCH_OPTIONS: {
  id: AssistantBranchId;
  label: string;
}[] = [
  { id: "private_assistant", label: "Privater Assistent" },
  { id: "coiffeur", label: "Coiffeur Betrieb" },
];

export function normalizeAssistantBranch(value: unknown): AssistantBranchId {
  if (value === "coiffeur" || value === "private_assistant") {
    return value;
  }
  return "private_assistant";
}

export function assistantBranchLabel(branch: AssistantBranchId): string {
  return (
    ASSISTANT_BRANCH_OPTIONS.find((option) => option.id === branch)?.label ??
    branch
  );
}

export function inferAssistantBranch(
  agent: Pick<StoredAgent, "assistantBranch" | "appointmentBookingEnabled">
): AssistantBranchId {
  if (agent.assistantBranch) {
    return normalizeAssistantBranch(agent.assistantBranch);
  }
  if (agent.appointmentBookingEnabled) return "coiffeur";
  return "private_assistant";
}

export function branchAppointmentPatch(branch: AssistantBranchId): Pick<
  StoredAgent,
  "appointmentBookingEnabled" | "appointmentConfig"
> {
  if (branch === "coiffeur") {
    return {
      appointmentBookingEnabled: true,
      appointmentConfig: configFromPreset("beauty"),
    };
  }

  return {
    appointmentBookingEnabled: false,
    appointmentConfig: configForPrivateAssistant(),
  };
}

/** True only when the client explicitly sent a branch change (not inferred on every autosave). */
export function assistantBranchChanged(
  nextBranch: unknown,
  existing?: Pick<StoredAgent, "assistantBranch" | "appointmentBookingEnabled">
): nextBranch is AssistantBranchId {
  if (nextBranch === undefined) return false;
  const normalizedNext = normalizeAssistantBranch(nextBranch);
  const normalizedPrev = existing?.assistantBranch
    ? normalizeAssistantBranch(existing.assistantBranch)
    : inferAssistantBranch(existing ?? { appointmentBookingEnabled: false });
  return normalizedNext !== normalizedPrev;
}
