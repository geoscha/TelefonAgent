import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { listWorkspacePhones, normalizePhoneNumber } from "@/lib/elevenlabs/phone";
import {
  getSettings,
  getSettingsForUser,
  updateSettings,
  updateSettingsForUser,
  type ElevenLabsSettings,
} from "@/lib/store";
import type { OnboardingPhase } from "@/lib/onboarding-types";
import { createUserRequest, listRequests, updateRequest } from "@/lib/admin/requests";
import { isPhoneNumberRequest } from "@/lib/admin/request-types";
import type { RequestStatus, UserRequest } from "@/lib/admin/request-types";
import { assignNumberFromPool, syncNumberPoolFromEnv } from "@/lib/store/number-pool";
import { requireUserId } from "@/lib/supabase/server";

export interface PhoneOnboardingState {
  phase: OnboardingPhase;
  settings: ElevenLabsSettings;
  pendingRequest: UserRequest | null;
}

const PHONE_REQUEST_TYPES = ["nummer_beantragen", "nummer_zuweisung"];

function defaultPhase(settings: ElevenLabsSettings): OnboardingPhase {
  if (settings.onboardingPhase) return settings.onboardingPhase;
  if (settings.agentId && settings.curaForwardingNumber) return "fertig";
  if (settings.curaForwardingNumber) return "weiterleitung";
  return "nummer_anfragen";
}

async function findOpenPhoneRequest(
  userId: string
): Promise<UserRequest | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("requests")
    .select("*")
    .eq("user_id", userId)
    .in("type", PHONE_REQUEST_TYPES)
    .in("status", ["offen", "in_arbeit"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    id: data.id as string,
    userId: data.user_id as string,
    type: data.type as string,
    status: data.status as RequestStatus,
    payload: (data.payload as Record<string, unknown>) ?? {},
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string,
  };
}

export async function getPhoneOnboardingState(
  userId?: string
): Promise<PhoneOnboardingState> {
  const id = userId ?? (await requireUserId());
  const settings = userId ? await getSettingsForUser(id) : await getSettings();
  const pendingRequest = await findOpenPhoneRequest(id);
  let phase = defaultPhase(settings);

  if (phase === "nummer_anfragen" && pendingRequest) {
    phase = "nummer_warte";
  }
  if (phase === "nummer_warte" && settings.curaForwardingNumber) {
    phase = "weiterleitung";
  }

  return { phase, settings, pendingRequest };
}

export async function requestPhoneNumber(): Promise<
  PhoneOnboardingState & { autoAssigned?: boolean }
> {
  const userId = await requireUserId();
  const current = await getPhoneOnboardingState(userId);

  if (current.settings.curaForwardingNumber) {
    return current;
  }
  if (current.pendingRequest) {
    return current;
  }

  const autoAssigned = await tryAutoAssignPhoneNumber(userId);
  if (autoAssigned) {
    const state = await getPhoneOnboardingState(userId);
    return { ...state, autoAssigned: true };
  }

  await createUserRequest(userId, "nummer_beantragen", {
    requestedAt: new Date().toISOString(),
  });

  const settings = await updateSettings({
    onboardingPhase: "nummer_warte",
  });

  return getPhoneOnboardingState(userId).then((s) => ({
    ...s,
    settings,
  }));
}

/** Assigns the next free pool number to a user and closes their open request. */
export async function tryAutoAssignPhoneNumber(userId: string): Promise<boolean> {
  try {
    await syncNumberPoolFromEnv();
    const pool = await assignNumberFromPool(userId);
    await assignPhoneNumberToUser(userId, pool.phoneNumber, {
      elevenLabsPhoneNumberId: pool.elevenLabsPhoneNumberId,
    });
    await completePhoneAssignment(userId, pool.phoneNumber, {
      elevenLabsPhoneNumberId: pool.elevenLabsPhoneNumberId,
      autoAssigned: true,
    });
    return true;
  } catch (err) {
    console.warn("[onboarding] auto-assign skipped:", err);
    return false;
  }
}

/** Processes oldest pending phone requests while free numbers exist. */
export async function processPendingPhoneAssignments(): Promise<number> {
  await syncNumberPoolFromEnv();

  const [open, inArbeit] = await Promise.all([
    listRequests({ status: "offen" }),
    listRequests({ status: "in_arbeit" }),
  ]);

  const queue = [...open, ...inArbeit]
    .filter(
      (r) =>
        isPhoneNumberRequest(r.type) &&
        typeof r.payload.phoneNumber !== "string"
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  let assigned = 0;
  for (const req of queue) {
    const ok = await tryAutoAssignPhoneNumber(req.userId);
    if (!ok) break;
    assigned += 1;
  }
  return assigned;
}

async function completePhoneAssignment(
  userId: string,
  phoneNumber: string,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const pending = await findOpenPhoneRequest(userId);
  const payload = {
    phoneNumber,
    assignedAt: new Date().toISOString(),
    ...extra,
  };

  if (pending) {
    await updateRequest(pending.id, {
      status: "erledigt",
      payload: { ...pending.payload, ...payload },
    });
    return;
  }

  const req = await createUserRequest(userId, "nummer_beantragen", {
    requestedAt: new Date().toISOString(),
    ...payload,
  });
  await updateRequest(req.id, {
    status: "erledigt",
    payload: { ...req.payload, ...payload },
  });
}

export async function confirmForwardingSetup(
  forwardingType: "alle" | "bedingt"
): Promise<PhoneOnboardingState> {
  const userId = await requireUserId();
  const settings = await updateSettings({
    forwardingType,
    forwardingStatus: "anleitung",
    onboardingPhase: "agent",
  });

  return {
    phase: "agent",
    settings,
    pendingRequest: await findOpenPhoneRequest(userId),
  };
}

export async function assignPhoneNumberToUser(
  userId: string,
  phoneNumber: string,
  options?: {
    elevenLabsPhoneNumberId?: string;
    forwardingInstructions?: string;
  }
): Promise<ElevenLabsSettings> {
  const normalized = normalizePhoneNumber(phoneNumber.trim());
  let elevenLabsId = options?.elevenLabsPhoneNumberId?.trim();

  if (!elevenLabsId) {
    try {
      const workspace = await listWorkspacePhones();
      elevenLabsId = workspace.find((w) => w.phoneNumber === normalized)
        ?.phoneNumberId;
    } catch (err) {
      console.warn("[onboarding] ElevenLabs phone lookup skipped:", err);
    }
  }

  const instructions =
    options?.forwardingInstructions?.trim() ||
    defaultForwardingInstructions(normalized);

  const admin = createAdminClient();
  await admin.from("forwarding_number_pool").upsert(
    {
      phone_number: normalized,
      elevenlabs_phone_number_id: elevenLabsId ?? normalized,
      assigned_user_id: userId,
      assigned_at: new Date().toISOString(),
    },
    { onConflict: "phone_number" }
  );

  return updateSettingsForUser(userId, {
    curaForwardingNumber: normalized,
    elevenLabsPhoneNumberId: elevenLabsId ?? undefined,
    forwardingStatus: "anleitung",
    forwardingType: "bedingt",
    onboardingPhase: "weiterleitung",
    forwardingInstructions: instructions,
  });
}

export async function completeAgentOnboarding(): Promise<ElevenLabsSettings> {
  return updateSettings({
    onboardingPhase: "fertig",
    forwardingStatus: "anleitung",
  });
}

export function defaultForwardingInstructions(curaNumber: string): string {
  const code = curaNumber.replace(/[\s()./-]/g, "");
  return [
    "So richten Sie die Weiterleitung ein:",
    "",
    "1. Wählen Sie auf Ihrem Handy den gewählten Code (Nur Überlauf oder Alle Anrufe) und drücken Sie die Anruftaste.",
    "2. Alternativ können Sie die Weiterleitung in Ihrer Telefonanlage (PBX) auf die Cura-Nummer einrichten.",
    "",
    `Cura-Nummer: ${curaNumber}`,
    `Nur Überlauf: **61*${code}#`,
    `Alle Anrufe: **21*${code}#`,
  ].join("\n");
}
