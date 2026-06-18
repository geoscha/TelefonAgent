import "server-only";

import type { SetupDemoStatus } from "@/lib/onboarding-types";
import {
  cancelPhoneRequest,
  getPhoneOnboardingState,
} from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { getSettings, updateSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export type SetupDemoStep = "agent" | "phone";

export interface SetupDemoState {
  active: boolean;
  step: SetupDemoStep | null;
  status: SetupDemoStatus | null;
  resetUi?: boolean;
}

export function resolveSetupDemoState(
  status: SetupDemoStatus | null | undefined
): SetupDemoState {
  if (status === "agent" || status === "phone") {
    return { active: true, step: status, status };
  }
  return { active: false, step: null, status: status ?? null };
}

export async function getSetupDemoState(): Promise<SetupDemoState> {
  const settings = await getSettings();
  return resolveSetupDemoState(settings.setupDemoStatus);
}

export async function skipSetupDemo(): Promise<SetupDemoState> {
  const userId = await requireUserId();
  const settings = await getSettings();
  const phones = await listUserPhoneNumbers(userId);
  const hasAgent = Boolean(
    (settings.agents?.length ?? 0) > 0 || settings.agentId
  );
  const hasPhone = phones.length > 0;
  const resetUi = !hasAgent && !hasPhone;

  if (resetUi) {
    const { pendingRequests } = await getPhoneOnboardingState(userId);
    for (const request of pendingRequests) {
      try {
        await cancelPhoneRequest(request.id);
      } catch {
        /* non-fatal */
      }
    }
    await updateSettings({
      setupDemoStatus: "skipped",
      onboardingPhase: "nummer_anfragen",
    });
  } else {
    await updateSettings({ setupDemoStatus: "skipped" });
  }

  return { active: false, step: null, status: "skipped", resetUi };
}

export async function restartSetupDemo(): Promise<SetupDemoState> {
  await updateSettings({ setupDemoStatus: "agent" });
  return { active: true, step: "agent", status: "agent" };
}

export async function completeSetupDemoAgentStep(): Promise<SetupDemoState> {
  const settings = await getSettings();
  if (settings.setupDemoStatus !== "agent") {
    return resolveSetupDemoState(settings.setupDemoStatus);
  }
  await updateSettings({ setupDemoStatus: "phone" });
  return { active: true, step: "phone", status: "phone" };
}

export async function completeSetupDemoPhoneStep(): Promise<SetupDemoState> {
  const settings = await getSettings();
  if (settings.setupDemoStatus !== "phone") {
    return resolveSetupDemoState(settings.setupDemoStatus);
  }
  await updateSettings({ setupDemoStatus: "done" });
  return { active: false, step: null, status: "done" };
}
