import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  configuredPoolNumbers,
  listWorkspacePhones,
  normalizePhoneNumber,
} from "@/lib/elevenlabs/phone";

export interface PoolNumber {
  phoneNumber: string;
  elevenLabsPhoneNumberId: string;
  assignedUserId?: string;
  assignedAt?: string;
}

/** Upserts pool rows from env + ElevenLabs workspace (matches by E.164). */
export async function syncNumberPoolFromEnv(): Promise<number> {
  const wanted = configuredPoolNumbers();
  if (wanted.length === 0) return 0;

  const workspace = await listWorkspacePhones();
  const admin = createAdminClient();
  let synced = 0;

  for (const num of wanted) {
    const match = workspace.find((w) => w.phoneNumber === num);
    if (!match) {
      console.warn(`[pool] ${num} not found in ElevenLabs workspace — skip`);
      continue;
    }
    await admin.from("forwarding_number_pool").upsert(
      {
        phone_number: num,
        elevenlabs_phone_number_id: match.phoneNumberId,
      },
      { onConflict: "phone_number" }
    );
    synced += 1;
  }
  return synced;
}

/** Returns pool rows assigned to this user. */
export async function getAssignedPoolNumbers(
  userId: string
): Promise<PoolNumber[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("forwarding_number_pool")
    .select("*")
    .eq("assigned_user_id", userId)
    .order("assigned_at", { ascending: true });
  return (data ?? []).map((row) => ({
    phoneNumber: row.phone_number,
    elevenLabsPhoneNumberId: row.elevenlabs_phone_number_id,
    assignedUserId: row.assigned_user_id ?? undefined,
    assignedAt: row.assigned_at ?? undefined,
  }));
}

/** Returns the first pool row assigned to this user, if any. */
export async function getAssignedPoolNumber(
  userId: string
): Promise<PoolNumber | null> {
  const numbers = await getAssignedPoolNumbers(userId);
  return numbers[0] ?? null;
}

/** Assigns the next free pool number to a user (atomic via admin client). */
export async function assignNumberFromPool(
  userId: string,
  options?: { allowExisting?: boolean }
): Promise<PoolNumber> {
  if (options?.allowExisting !== false) {
    const existing = await getAssignedPoolNumber(userId);
    if (existing) return existing;
  }

  await syncNumberPoolFromEnv();

  const admin = createAdminClient();

  const { data: free } = await admin
    .from("forwarding_number_pool")
    .select("*")
    .is("assigned_user_id", null)
    .limit(1)
    .maybeSingle();

  if (!free) {
    throw new Error(
      "Keine Weiterleitungsnummern mehr verfügbar. Bitte CURA_NUMBER_POOL erweitern."
    );
  }

  const { data: claimed, error } = await admin
    .from("forwarding_number_pool")
    .update({
      assigned_user_id: userId,
      assigned_at: new Date().toISOString(),
    })
    .eq("phone_number", free.phone_number)
    .is("assigned_user_id", null)
    .select("*")
    .maybeSingle();

  if (error || !claimed) {
    throw new Error(
      "Weiterleitungsnummer konnte nicht zugewiesen werden (Race). Bitte erneut versuchen."
    );
  }

  return {
    phoneNumber: normalizePhoneNumber(claimed.phone_number),
    elevenLabsPhoneNumberId: claimed.elevenlabs_phone_number_id,
    assignedUserId: userId,
    assignedAt: claimed.assigned_at ?? undefined,
  };
}
