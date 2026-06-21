import { configFromPreset } from "@/lib/integrations/appointment-config";
import type { StoredAgent } from "@/lib/onboarding-types";

/**
 * The product now focuses on a single branch: property management
 * (Immobilienverwaltung). The type is kept so existing call sites and stored
 * agents stay compatible.
 */
export type AssistantBranchId = "immobilienverwalter";

const DEFAULT_BRANCH: AssistantBranchId = "immobilienverwalter";

export const ASSISTANT_BRANCH_OPTIONS: {
  id: AssistantBranchId;
  label: string;
}[] = [{ id: DEFAULT_BRANCH, label: "Immobilienverwaltung" }];

export function normalizeAssistantBranch(value: unknown): AssistantBranchId {
  const match = ASSISTANT_BRANCH_OPTIONS.find((option) => option.id === value);
  return match?.id ?? DEFAULT_BRANCH;
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
  return normalizeAssistantBranch(agent.assistantBranch);
}

export function branchAppointmentPatch(): Pick<
  StoredAgent,
  "appointmentBookingEnabled" | "appointmentConfig"
> {
  return {
    appointmentBookingEnabled: true,
    appointmentConfig: configFromPreset("immobilien"),
  };
}

/**
 * With only one branch the branch never changes, so appointment settings are
 * never reset on save — booking is controlled solely via the capabilities UI.
 */
export function assistantBranchChanged(): boolean {
  return false;
}
