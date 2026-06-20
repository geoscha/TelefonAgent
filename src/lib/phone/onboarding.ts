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
import {
  forwardingActivateCodes,
  forwardingResetAllCodes,
  forwardingStatusCheckCodes,
} from "@/lib/phone/forwarding-codes";
import { createUserRequest, listRequests, updateRequest } from "@/lib/admin/requests";
import { isPhoneNumberRequest } from "@/lib/admin/request-types";
import type { RequestStatus, UserRequest } from "@/lib/admin/request-types";
import { syncNumberPoolFromEnv } from "@/lib/store/number-pool";
import {
  assertCanAffordPhoneNumber,
} from "@/lib/billing/tokens";
import { requireUserId } from "@/lib/supabase/server";
import {
  addPoolPhoneNumber,
  assignNextFreePoolNumberForUser,
  listUserPhoneNumbers,
  requestAdditionalPoolNumber,
  updatePhoneForwarding,
} from "@/lib/phone/numbers";

export interface PhoneOnboardingState {
  phase: OnboardingPhase;
  settings: ElevenLabsSettings;
  pendingRequest: UserRequest | null;
  pendingRequests: UserRequest[];
}

const PHONE_REQUEST_TYPES = ["nummer_beantragen", "nummer_zuweisung"];

function defaultPhase(settings: ElevenLabsSettings): OnboardingPhase {
  if (settings.onboardingPhase) return settings.onboardingPhase;
  if (settings.agentId && settings.linkerForwardingNumber) return "fertig";
  if (settings.linkerForwardingNumber) return "weiterleitung";
  return "nummer_anfragen";
}

async function findOpenPhoneRequests(userId: string): Promise<UserRequest[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("requests")
    .select("*")
    .eq("user_id", userId)
    .in("type", PHONE_REQUEST_TYPES)
    .in("status", ["offen", "in_arbeit"])
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    userId: row.user_id as string,
    type: row.type as string,
    status: row.status as RequestStatus,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  }));
}

async function findOpenPhoneRequest(
  userId: string
): Promise<UserRequest | null> {
  const requests = await findOpenPhoneRequests(userId);
  return requests[0] ?? null;
}

export async function getPhoneOnboardingState(
  userId?: string
): Promise<PhoneOnboardingState> {
  const id = userId ?? (await requireUserId());
  let settings = userId ? await getSettingsForUser(id) : await getSettings();
  let phones = await listUserPhoneNumbers(id);
  let pendingRequests = await findOpenPhoneRequests(id);

  if (phones.length === 0 && pendingRequests.length > 0) {
    await tryAutoAssignPhoneNumber(id);
    settings = userId ? await getSettingsForUser(id) : await getSettings();
    phones = await listUserPhoneNumbers(id);
    pendingRequests = await findOpenPhoneRequests(id);
  }

  const primary = phones.find((p) => p.isPrimary) ?? phones[0];
  const pendingRequest = pendingRequests[0] ?? null;
  let phase = defaultPhase(settings);

  if (primary && !settings.linkerForwardingNumber) {
    await updateSettingsForUser(id, {
      linkerForwardingNumber: primary.phoneNumber,
      elevenLabsPhoneNumberId: primary.elevenLabsPhoneNumberId,
      forwardingType: primary.forwardingType ?? settings.forwardingType,
      forwardingStatus: primary.forwardingStatus ?? settings.forwardingStatus,
      customerNumber: primary.customerNumber ?? settings.customerNumber,
    });
  }

  if (phase === "nummer_anfragen" && pendingRequests.length > 0 && phones.length === 0) {
    phase = "nummer_warte";
  }
  if (phase === "nummer_warte" && phones.length > 0 && pendingRequests.length === 0) {
    phase = "weiterleitung";
  }

  return { phase, settings, pendingRequest, pendingRequests };
}

export async function requestPhoneNumber(): Promise<
  PhoneOnboardingState & { autoAssigned?: boolean; phone?: { phoneNumber: string } }
> {
  const userId = await requireUserId();

  const affordability = await assertCanAffordPhoneNumber(userId);
  if (!affordability.ok) {
    throw new Error(affordability.error);
  }

  const phonesBefore = await listUserPhoneNumbers(userId);
  const pendingBefore = await findOpenPhoneRequests(userId);
  const current = await getPhoneOnboardingState(userId);
  const phones = await listUserPhoneNumbers(userId);

  if (
    phonesBefore.length === 0 &&
    phones.length > 0 &&
    pendingBefore.length > 0
  ) {
    const assigned = phones.find((p) => p.isPrimary) ?? phones[0];
    return {
      ...current,
      autoAssigned: true,
      phone: { phoneNumber: assigned.phoneNumber },
    };
  }

  if (phones.length === 0 && current.pendingRequests.length > 0) {
    return current;
  }

  const result = await requestAdditionalPoolNumber();
  if (result.insufficientTokens) {
    throw new Error(
      result.error ??
        "Nicht genügend Tokens. Bitte laden Sie Ihr Guthaben auf."
    );
  }
  if (result.autoAssigned && result.phone) {
    await completePhoneAssignment(userId, result.phone.phoneNumber, {
      elevenLabsPhoneNumberId: result.phone.elevenLabsPhoneNumberId,
      autoAssigned: true,
    });
    const state = await getPhoneOnboardingState(userId);
    return {
      ...state,
      autoAssigned: true,
      phone: { phoneNumber: result.phone.phoneNumber },
    };
  }

  await createUserRequest(userId, "nummer_beantragen", {
    requestedAt: new Date().toISOString(),
  });

  const settings = await updateSettings({
    onboardingPhase: phones.length === 0 ? "nummer_warte" : current.settings.onboardingPhase,
  });

  return getPhoneOnboardingState(userId).then((s) => ({
    ...s,
    settings,
  }));
}

/** Assigns the next free pool number to a user and closes their open request. */
export async function tryAutoAssignPhoneNumber(userId: string): Promise<boolean> {
  const phones = await listUserPhoneNumbers(userId);
  if (phones.length > 0) return false;

  const result = await assignNextFreePoolNumberForUser(userId);
  if (!result.autoAssigned || !result.phone) return false;

  await completePhoneAssignment(userId, result.phone.phoneNumber, {
    elevenLabsPhoneNumberId: result.phone.elevenLabsPhoneNumberId,
    autoAssigned: true,
  });
  return true;
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
  forwardingType: "alle" | "bedingt",
  options?: { phoneId?: string; customerNumber?: string }
): Promise<PhoneOnboardingState> {
  const userId = await requireUserId();
  const phones = await listUserPhoneNumbers(userId);
  const target =
    (options?.phoneId ? phones.find((p) => p.id === options.phoneId) : undefined) ??
    phones.find((p) => p.isPrimary) ??
    phones[0];

  const customerNumber = options?.customerNumber?.trim();

  if (target) {
    await updatePhoneForwarding(target.id, {
      forwardingType,
      forwardingStatus: "aktiv",
      ...(customerNumber ? { customerNumber } : {}),
    });
  }

  const settings = await updateSettings({
    forwardingType,
    forwardingStatus: "aktiv",
    forwardingActivatedAt: new Date().toISOString(),
    onboardingPhase: "fertig",
    ...(customerNumber ? { customerNumber } : {}),
  });

  return {
    phase: "fertig",
    settings,
    pendingRequest: await findOpenPhoneRequest(userId),
    pendingRequests: await findOpenPhoneRequests(userId),
  };
}

/** Withdraws an open phone number request. */
export async function cancelPhoneRequest(requestId: string): Promise<PhoneOnboardingState> {
  const userId = await requireUserId();
  const requests = await findOpenPhoneRequests(userId);
  const target = requests.find((r) => r.id === requestId);
  if (!target) {
    throw new Error("Anfrage nicht gefunden.");
  }

  await updateRequest(requestId, { status: "abgelehnt" });

  const phones = await listUserPhoneNumbers(userId);
  const remaining = await findOpenPhoneRequests(userId);
  if (phones.length === 0 && remaining.length === 0) {
    await updateSettings({ onboardingPhase: "nummer_anfragen" });
  }

  return getPhoneOnboardingState(userId);
}

/** Customer confirmed they deactivated forwarding on their phone. */
export async function disconnectPhoneForwarding(
  phoneId?: string
): Promise<PhoneOnboardingState> {
  const userId = await requireUserId();
  const { disconnectPhoneForwarding: disconnectPhone } = await import(
    "@/lib/phone/numbers"
  );
  await disconnectPhone(phoneId);
  await updateSettings({
    forwardingStatus: "nicht_eingerichtet",
  });
  return getPhoneOnboardingState(userId);
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
  const { data: existingPool } = await admin
    .from("forwarding_number_pool")
    .select("times_assigned")
    .eq("phone_number", normalized)
    .maybeSingle();

  await admin.from("forwarding_number_pool").upsert(
    {
      phone_number: normalized,
      elevenlabs_phone_number_id: elevenLabsId ?? normalized,
      assigned_user_id: userId,
      assigned_at: new Date().toISOString(),
      times_assigned: Number(existingPool?.times_assigned ?? 0) + 1,
    },
    { onConflict: "phone_number" }
  );

  const existing = await listUserPhoneNumbers(userId);
  await addPoolPhoneNumber(userId, normalized, elevenLabsId ?? normalized, {
    makePrimary: existing.length === 0,
  });

  return updateSettingsForUser(userId, {
    linkerForwardingNumber: normalized,
    elevenLabsPhoneNumberId: elevenLabsId ?? undefined,
    forwardingStatus: "anleitung",
    forwardingType: "alle",
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

export function defaultForwardingInstructions(linkerNumber: string): string {
  const reset = forwardingResetAllCodes();
  const codes = forwardingActivateCodes(linkerNumber);
  const check = forwardingStatusCheckCodes();
  return [
    "So richten Sie die Weiterleitung ein:",
    "",
    "Schritt 1 — Alle Weiterleitungen löschen (Combox-Regeln inkl.):",
    ...reset.map((entry) => `  ${entry.label}: ${entry.code}`),
    "  Yallo: Mailbox zusätzlich in der App deaktivieren.",
    "",
    "Schritt 2 — Alle Anrufe aktivieren (ohne Plus in der Nummer):",
    `Linker-Nummer: ${linkerNumber}`,
    ...codes.map((entry) => `  ${entry.label}: ${entry.code}`),
    "",
    "Schritt 3 — Prüfen:",
    ...check.map((entry) => `  ${entry.label}: ${entry.code}`),
    "",
    "Alternativ: Weiterleitung in Ihrer Telefonanlage (PBX) auf die Linker-Nummer einrichten.",
  ].join("\n");
}
