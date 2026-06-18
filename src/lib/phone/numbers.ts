import "server-only";

import {
  createSipTrunkPhoneNumber,
  deletePhoneNumberFromElevenLabs,
  normalizePhoneNumber,
  SIP_INCOMPATIBLE_MESSAGE,
  validateSipTrunkForBotCalls,
} from "@/lib/elevenlabs/phone";
import { linkUserPhoneToAgent } from "@/lib/elevenlabs/sync-agent";
import {
  canAffordTokens,
  grantWelcomeTokensIfNeeded,
  PHONE_NUMBER_COST_TOKENS,
} from "@/lib/billing/tokens";
import { setupPhoneBilling } from "@/lib/billing/phone-billing";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUserId } from "@/lib/supabase/server";
import { getSettingsForUser, updateSettingsForUser, type ElevenLabsSettings } from "@/lib/store";
import { assignNumberFromPool, syncNumberPoolFromEnv } from "@/lib/store/number-pool";

export type PhoneNumberSource = "pool" | "sip_trunk";
export type PhoneValidationStatus = "pending" | "valid" | "invalid";
export type ForwardingType = "alle" | "bedingt";
export type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";

export interface UserPhoneNumber {
  id: string;
  userId: string;
  phoneNumber: string;
  elevenLabsPhoneNumberId?: string;
  source: PhoneNumberSource;
  label?: string;
  isPrimary: boolean;
  forwardingType?: ForwardingType;
  forwardingStatus?: ForwardingStatus;
  sipOutboundAddress?: string;
  sipOutboundTransport?: string;
  customerNumber?: string;
  validationStatus: PhoneValidationStatus;
  validationError?: string;
  assignedAt?: string;
  nextBillingAt?: string;
  pausedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SipTrunkInput {
  phoneNumber: string;
  label?: string;
  outboundAddress?: string;
  outboundTransport?: "tcp" | "tls" | "udp";
  outboundUsername?: string;
  outboundPassword?: string;
}

function rowToUserPhone(row: Record<string, unknown>): UserPhoneNumber {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    phoneNumber: row.phone_number as string,
    elevenLabsPhoneNumberId:
      (row.elevenlabs_phone_number_id as string | null) ?? undefined,
    source: row.source as PhoneNumberSource,
    label: (row.label as string | null) ?? undefined,
    isPrimary: Boolean(row.is_primary),
    forwardingType: (row.forwarding_type as ForwardingType | null) ?? undefined,
    forwardingStatus:
      (row.forwarding_status as ForwardingStatus | null) ??
      ((row.source as PhoneNumberSource) === "pool"
        ? "anleitung"
        : undefined),
    sipOutboundAddress:
      (row.sip_outbound_address as string | null) ?? undefined,
    sipOutboundTransport:
      (row.sip_outbound_transport as string | null) ?? undefined,
    customerNumber: (row.customer_number as string | null) ?? undefined,
    validationStatus: row.validation_status as PhoneValidationStatus,
    validationError: (row.validation_error as string | null) ?? undefined,
    assignedAt: (row.assigned_at as string | null) ?? undefined,
    nextBillingAt: (row.next_billing_at as string | null) ?? undefined,
    pausedAt: (row.paused_at as string | null) ?? undefined,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

async function syncPrimaryToSettings(
  userId: string,
  phone: UserPhoneNumber | null
): Promise<ElevenLabsSettings> {
  if (!phone) {
    return updateSettingsForUser(userId, {
      curaForwardingNumber: undefined,
      elevenLabsPhoneNumberId: undefined,
      forwardingStatus: "nicht_eingerichtet",
    });
  }

  return updateSettingsForUser(userId, {
    curaForwardingNumber: phone.phoneNumber,
    elevenLabsPhoneNumberId: phone.elevenLabsPhoneNumberId,
    forwardingType: phone.forwardingType ?? "bedingt",
    forwardingStatus: phone.forwardingStatus ?? "anleitung",
    customerNumber: phone.customerNumber,
    onboardingPhase:
      phone.forwardingStatus === "aktiv"
        ? "fertig"
        : phone.forwardingStatus === "anleitung"
          ? "agent"
          : "weiterleitung",
  });
}

export async function listUserPhoneNumbers(
  userId?: string
): Promise<UserPhoneNumber[]> {
  const id = userId ?? (await requireUserId());
  const supabase = userId ? createAdminClient() : createClient();
  const { data, error } = await supabase
    .from("user_phone_numbers")
    .select("*")
    .eq("user_id", id)
    .neq("validation_status", "invalid")
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[phone/numbers] list:", error.message);
    return [];
  }
  return (data ?? []).map((row) => rowToUserPhone(row as Record<string, unknown>));
}

export async function getUserPhoneNumberById(
  phoneId: string,
  userId?: string
): Promise<UserPhoneNumber | null> {
  const id = userId ?? (await requireUserId());
  const supabase = createClient();
  const { data } = await supabase
    .from("user_phone_numbers")
    .select("*")
    .eq("id", phoneId)
    .eq("user_id", id)
    .maybeSingle();
  return data ? rowToUserPhone(data as Record<string, unknown>) : null;
}

async function clearPrimaryFlag(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("user_phone_numbers")
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_primary", true);
}

async function setPrimaryPhone(
  userId: string,
  phoneId: string
): Promise<UserPhoneNumber> {
  const admin = createAdminClient();
  await clearPrimaryFlag(userId);

  const { data, error } = await admin
    .from("user_phone_numbers")
    .update({
      is_primary: true,
      updated_at: new Date().toISOString(),
    })
    .eq("id", phoneId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Primäre Nummer konnte nicht gesetzt werden.");
  }

  const phone = rowToUserPhone(data as Record<string, unknown>);
  await syncPrimaryToSettings(userId, phone);

  if (phone.elevenLabsPhoneNumberId) {
    await linkUserPhoneToAgent(userId).catch((err) =>
      console.warn("[phone/numbers] agent link skipped:", err)
    );
  }

  return phone;
}

export async function addPoolPhoneNumber(
  userId: string,
  phoneNumber: string,
  elevenLabsPhoneNumberId: string,
  options?: { makePrimary?: boolean }
): Promise<UserPhoneNumber> {
  const admin = createAdminClient();
  const normalized = normalizePhoneNumber(phoneNumber);
  const existing = await listUserPhoneNumbers(userId);
  const makePrimary = options?.makePrimary ?? existing.length === 0;

  if (makePrimary) {
    await clearPrimaryFlag(userId);
  }

  const { data, error } = await admin
    .from("user_phone_numbers")
    .upsert(
      {
        user_id: userId,
        phone_number: normalized,
        elevenlabs_phone_number_id: elevenLabsPhoneNumberId,
        source: "pool",
        label: "Cura Nummer",
        is_primary: makePrimary,
        forwarding_type: "bedingt",
        forwarding_status: "anleitung",
        validation_status: "valid",
        validation_error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,phone_number" }
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Nummer konnte nicht gespeichert werden.");
  }

  const phone = rowToUserPhone(data as Record<string, unknown>);
  if (makePrimary) {
    await syncPrimaryToSettings(userId, phone);
  }
  return phone;
}

export async function requestAdditionalPoolNumber(): Promise<{
  phone?: UserPhoneNumber;
  pending: boolean;
  autoAssigned: boolean;
  insufficientTokens?: boolean;
  error?: string;
}> {
  const userId = await requireUserId();
  await grantWelcomeTokensIfNeeded(userId);

  if (!(await canAffordTokens(userId, PHONE_NUMBER_COST_TOKENS))) {
    return {
      pending: false,
      autoAssigned: false,
      insufficientTokens: true,
      error:
        "Nicht genügend Tokens. Bitte laden Sie Ihr Guthaben auf, um eine neue Nummer zu erstellen.",
    };
  }

  try {
    await syncNumberPoolFromEnv();
    const pool = await assignNumberFromPool(userId, { allowExisting: false });
    const existing = await listUserPhoneNumbers(userId);
    const phone = await addPoolPhoneNumber(
      userId,
      pool.phoneNumber,
      pool.elevenLabsPhoneNumberId,
      { makePrimary: existing.length === 0 }
    );

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
      return {
        pending: false,
        autoAssigned: false,
        insufficientTokens: true,
        error: charged.error,
      };
    }

    if (phone.elevenLabsPhoneNumberId) {
      await linkUserPhoneToAgent(userId).catch((err) =>
        console.warn("[phone/numbers] pool link skipped:", err)
      );
    }

    return { phone, pending: false, autoAssigned: true };
  } catch {
    return { pending: true, autoAssigned: false };
  }
}

export async function addSipTrunkPhoneNumber(
  input: SipTrunkInput
): Promise<{ ok: true; phone: UserPhoneNumber } | { ok: false; error: string }> {
  const userId = await requireUserId();
  const settings = await getSettingsForUser(userId);
  const normalized = normalizePhoneNumber(input.phoneNumber.trim());

  if (!settings.agentId) {
    return {
      ok: false,
      error:
        "Bitte erstellen Sie zuerst einen Telefonagenten, bevor Sie eine SIP-Nummer hinzufügen.",
    };
  }

  if (!normalized.startsWith("+")) {
    return {
      ok: false,
      error: "Bitte geben Sie die Nummer im internationalen Format ein (z. B. +41791234567).",
    };
  }

  const existing = await listUserPhoneNumbers(userId);
  if (existing.some((p) => p.phoneNumber === normalized)) {
    return { ok: false, error: "Diese Nummer ist bereits hinterlegt." };
  }

  if (!(await canAffordTokens(userId, PHONE_NUMBER_COST_TOKENS))) {
    return {
      ok: false,
      error:
        "Nicht genügend Tokens. Bitte laden Sie Ihr Guthaben auf, um eine neue Nummer zu erstellen.",
    };
  }

  const admin = createAdminClient();
  const label = input.label?.trim() || `SIP ${normalized}`;
  const outboundConfigured = Boolean(input.outboundAddress?.trim());
  let elevenLabsId: string | undefined;

  try {
    const created = await createSipTrunkPhoneNumber({
      phoneNumber: normalized,
      label,
      outboundAddress: input.outboundAddress?.trim(),
      outboundTransport: input.outboundTransport,
      outboundUsername: input.outboundUsername?.trim(),
      outboundPassword: input.outboundPassword,
    });
    elevenLabsId = created.phoneNumberId;

    const botReady = await validateSipTrunkForBotCalls({
      phoneNumberId: elevenLabsId,
      expectedNumber: normalized,
      agentId: settings.agentId,
      outboundConfigured,
    });

    if (!botReady.ok) {
      await deletePhoneNumberFromElevenLabs(elevenLabsId).catch((err) =>
        console.warn("[phone/sip] cleanup after bot validation:", err)
      );
      return {
        ok: false,
        error: botReady.error || SIP_INCOMPATIBLE_MESSAGE,
      };
    }

    const makePrimary = existing.length === 0;
    if (makePrimary) {
      await clearPrimaryFlag(userId);
    }

    const { data, error } = await admin
      .from("user_phone_numbers")
      .insert({
        user_id: userId,
        phone_number: normalized,
        elevenlabs_phone_number_id: elevenLabsId,
        source: "sip_trunk",
        label,
        is_primary: makePrimary,
        forwarding_type: "bedingt",
        forwarding_status: "anleitung",
        sip_outbound_address: input.outboundAddress?.trim() || null,
        sip_outbound_transport: input.outboundTransport ?? null,
        validation_status: "valid",
        validation_error: null,
      })
      .select("*")
      .single();

    if (error || !data) {
      await deletePhoneNumberFromElevenLabs(elevenLabsId).catch((err) =>
        console.warn("[phone/sip] cleanup after db error:", err)
      );
      return { ok: false, error: "Nummer konnte nicht gespeichert werden." };
    }

    const phone = rowToUserPhone(data as Record<string, unknown>);

    const charged = await setupPhoneBilling(userId, phone.id);
    if (!charged.ok) {
      await deletePhoneNumberFromElevenLabs(elevenLabsId).catch((err) =>
        console.warn("[phone/sip] cleanup after token charge:", err)
      );
      await admin.from("user_phone_numbers").delete().eq("id", phone.id);
      return { ok: false, error: charged.error };
    }

    if (makePrimary) {
      await syncPrimaryToSettings(userId, phone);
    }

    await linkUserPhoneToAgent(userId).catch((err) =>
      console.warn("[phone/sip] agent link skipped:", err)
    );

    return { ok: true, phone };
  } catch (err) {
    if (elevenLabsId) {
      await deletePhoneNumberFromElevenLabs(elevenLabsId).catch((cleanupErr) =>
        console.warn("[phone/sip] cleanup after error:", cleanupErr)
      );
    }
    const message =
      err instanceof Error && err.message.trim()
        ? err.message
        : SIP_INCOMPATIBLE_MESSAGE;
    return { ok: false, error: message };
  }
}

export async function activateUserPhoneNumber(
  phoneId: string
): Promise<UserPhoneNumber> {
  const userId = await requireUserId();
  const phone = await getUserPhoneNumberById(phoneId, userId);
  if (!phone) {
    throw new Error("Nummer nicht gefunden.");
  }
  if (phone.validationStatus !== "valid") {
    throw new Error("Ungültige Nummer kann nicht aktiviert werden.");
  }
  return setPrimaryPhone(userId, phoneId);
}

export async function updatePhoneForwarding(
  phoneId: string,
  patch: {
    forwardingType?: ForwardingType;
    forwardingStatus?: ForwardingStatus;
    customerNumber?: string;
  }
): Promise<UserPhoneNumber> {
  const userId = await requireUserId();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("user_phone_numbers")
    .update({
      ...(patch.forwardingType ? { forwarding_type: patch.forwardingType } : {}),
      ...(patch.forwardingStatus
        ? { forwarding_status: patch.forwardingStatus }
        : {}),
      ...(patch.customerNumber !== undefined
        ? { customer_number: patch.customerNumber || null }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", phoneId)
    .eq("user_id", userId)
    .select("*")
    .single();

  if (error || !data) {
    throw new Error("Weiterleitung konnte nicht gespeichert werden.");
  }

  const phone = rowToUserPhone(data as Record<string, unknown>);
  if (phone.isPrimary) {
    await syncPrimaryToSettings(userId, phone);
  }
  return phone;
}

export async function removeUserPhoneNumber(
  phoneId: string
): Promise<UserPhoneNumber[]> {
  const userId = await requireUserId();
  const admin = createAdminClient();

  const { data: row } = await admin
    .from("user_phone_numbers")
    .select("*")
    .eq("id", phoneId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) {
    throw new Error("Nummer nicht gefunden.");
  }

  const phone = rowToUserPhone(row as Record<string, unknown>);
  const wasPrimary = phone.isPrimary;

  if (phone.elevenLabsPhoneNumberId && phone.source === "sip_trunk") {
    await deletePhoneNumberFromElevenLabs(phone.elevenLabsPhoneNumberId).catch(
      (err) => console.warn("[phone/remove] elevenlabs delete:", err)
    );
  }

  if (phone.source === "pool") {
    await admin
      .from("forwarding_number_pool")
      .update({ assigned_user_id: null, assigned_at: null })
      .eq("phone_number", phone.phoneNumber)
      .eq("assigned_user_id", userId);
  }

  await admin
    .from("user_phone_numbers")
    .delete()
    .eq("id", phoneId)
    .eq("user_id", userId);

  const remaining = await listUserPhoneNumbers(userId);

  if (wasPrimary) {
    const next = remaining[0] ?? null;
    if (next) {
      await setPrimaryPhone(userId, next.id);
    } else {
      await syncPrimaryToSettings(userId, null);
      await updateSettingsForUser(userId, { onboardingPhase: "nummer_anfragen" });
    }
  }

  return listUserPhoneNumbers(userId);
}

export async function disconnectPhoneForwarding(
  phoneId?: string
): Promise<UserPhoneNumber[]> {
  const userId = await requireUserId();
  const phones = await listUserPhoneNumbers(userId);
  const target =
    (phoneId ? phones.find((p) => p.id === phoneId) : undefined) ??
    phones.find((p) => p.isPrimary) ??
    phones[0];

  if (target) {
    await updatePhoneForwarding(target.id, {
      forwardingStatus: "nicht_eingerichtet",
    });
  }

  const primary = phones.find((p) => p.isPrimary) ?? phones[0];
  if (primary?.id === target?.id) {
    await syncPrimaryToSettings(userId, {
      ...primary,
      forwardingStatus: "nicht_eingerichtet",
    });
  }

  return listUserPhoneNumbers(userId);
}
