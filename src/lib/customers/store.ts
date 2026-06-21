import "server-only";

import type {
  CustomerDataProviderId,
  CustomerRecord,
} from "@/lib/customers/types";
import { normalizePhoneNumber } from "@/lib/phone/normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUserId } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToRecord(row: any): CustomerRecord {
  return {
    id: `${row.provider}:${row.external_id}`,
    provider: row.provider as CustomerDataProviderId,
    externalId: row.external_id ?? undefined,
    name: row.name,
    phone: row.phone ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    propertyLabel: row.property_label ?? undefined,
    rentalStart: row.rental_start ?? undefined,
    rentalEnd: row.rental_end ?? undefined,
    rentalInfo: row.rental_info ?? undefined,
  };
}

function recordToRow(
  userId: string,
  provider: CustomerDataProviderId,
  record: CustomerRecord,
  syncedAt: string
): Record<string, unknown> {
  return {
    user_id: userId,
    provider,
    external_id: record.externalId ?? record.id,
    name: record.name,
    phone: record.phone ?? null,
    phone_normalized: record.phone
      ? normalizePhoneNumber(record.phone)
      : null,
    email: record.email ?? null,
    address: record.address ?? null,
    property_label: record.propertyLabel ?? null,
    rental_start: record.rentalStart ?? null,
    rental_end: record.rentalEnd ?? null,
    rental_info: record.rentalInfo ?? null,
    synced_at: syncedAt,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Replace all synced records for a provider with a fresh set (full mirror).
 * Runs as the signed-in user (RLS-enforced).
 */
export async function replaceCustomerRecords(
  provider: CustomerDataProviderId,
  records: CustomerRecord[]
): Promise<number> {
  const supabase = createClient();
  const userId = await requireUserId();
  const syncedAt = new Date().toISOString();

  await supabase
    .from("customer_records")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  if (records.length === 0) return 0;

  const rows = records.map((record) =>
    recordToRow(userId, provider, record, syncedAt)
  );

  // Insert in batches to stay within payload limits.
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const { error } = await supabase.from("customer_records").insert(slice);
    if (error) throw error;
    inserted += slice.length;
  }
  return inserted;
}

/** Synced customer records for the signed-in user (optionally one provider). */
export async function getCustomerRecords(
  provider?: CustomerDataProviderId
): Promise<CustomerRecord[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  let query = supabase
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .order("name", { ascending: true });

  if (provider) {
    query = query.eq("provider", provider);
  }

  const { data } = await query;
  return (data ?? []).map(rowToRecord);
}

/** Remove mirrored records for all providers except the active one. */
export async function clearCustomerRecordsExcept(
  keepProvider: CustomerDataProviderId
): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("customer_records")
    .delete()
    .eq("user_id", userId)
    .neq("provider", keepProvider);
}

/**
 * Identify a caller by phone number from the Supabase mirror ONLY.
 * Safe to call during a live phone call (service-role, no user session).
 * The source file is never read here.
 */
export async function findCustomerByPhoneForUser(
  userId: string,
  phone: string
): Promise<CustomerRecord | null> {
  if (!phone) return null;
  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .eq("phone_normalized", normalized)
    .limit(1)
    .maybeSingle();

  return data ? rowToRecord(data) : null;
}
