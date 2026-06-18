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
import {
  canAffordTokens,
  grantWelcomeTokensIfNeeded,
  PHONE_NUMBER_COST_TOKENS,
} from "@/lib/billing/tokens";
import { setupPhoneBilling } from "@/lib/billing/phone-billing";
import { requireUserId } from "@/lib/supabase/server";
import {
  addPoolPhoneNumber,
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
  if (settings.agentId && settings.curaForwardingNumber) return "fertig";
  if (settings.curaForwardingNumber) return "weiterleitung";
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
  const settings = userId ? await getSettingsForUser(id) : await getSettings();
  const phones = await listUserPhoneNumbers(id);
  const primary = phones.find((p) => p.isPrimary) ?? phones[0];
  const pendingRequests = await findOpenPhoneRequests(id);
  const pendingRequest = pendingRequests[0] ?? null;
  let phase = defaultPhase(settings);

  if (primary && !settings.curaForwardingNumber) {
    await updateSettingsForUser(id, {
      curaForwardingNumber: primary.phoneNumber,
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
  await grantWelcomeTokensIfNeeded(userId);
  const current = await getPhoneOnboardingState(userId);
  const phones = await listUserPhoneNumbers(userId);

  if (current.pendingRequest && phones.length === 0) {
    return current;
  }
  if (current.pendingRequests.length > 0) {
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
  if (!(await canAffordTokens(userId, PHONE_NUMBER_COST_TOKENS))) {
    return false;
  }

  try {
    await syncNumberPoolFromEnv();
    const pool = await assignNumberFromPool(userId, { allowExisting: false });
    await assignPhoneNumberToUser(userId, pool.phoneNumber, {
      elevenLabsPhoneNumberId: pool.elevenLabsPhoneNumberId,
    });

    const phones = await listUserPhoneNumbers(userId);
    const phone = phones.find((p) => p.phoneNumber === pool.phoneNumber);
    if (!phone) return false;

    const charged = await setupPhoneBilling(userId, phone.id);
    if (!charged.ok) {
      const admin = createAdminClient();
      await admin
        .from("forwarding_number_pool")
        .update({ assigned_user_id: null, assigned_at: null })
        .eq("phone_number", pool.phoneNumber)
        .eq("assigned_user_id", userId);
      await admin
        .from("user_phone_numbers")
        .delete()
        .eq("id", phone.id)
        .eq("user_id", userId);
      return false;
    }

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
  await admin.from("forwarding_number_pool").upsert(
    {
      phone_number: normalized,
      elevenlabs_phone_number_id: elevenLabsId ?? normalized,
      assigned_user_id: userId,
      assigned_at: new Date().toISOString(),
    },
    { onConflict: "phone_number" }
  );

  const existing = await listUserPhoneNumbers(userId);
  await addPoolPhoneNumber(userId, normalized, elevenLabsId ?? normalized, {
    makePrimary: existing.length === 0,
  });

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
