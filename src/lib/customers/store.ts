import "server-only";

import type {
  CustomerDataProviderId,
  CustomerRecord,
} from "@/lib/customers/types";
import { toE164 } from "@/lib/phone/normalize";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUserId } from "@/lib/supabase/server";

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToRecord(row: any): CustomerRecord {
  return {
    id: `${row.provider}:${row.external_id}`,
    provider: row.provider as CustomerDataProviderId,
    recordType:
      row.record_type === "craftsman"
        ? "craftsman"
        : row.record_type === "customer"
          ? "customer"
          : undefined,
    externalId: row.external_id ?? undefined,
    name: row.name,
    phone: row.phone ?? undefined,
    phoneNormalized: row.phone_normalized ?? undefined,
    email: row.email ?? undefined,
    address: row.address ?? undefined,
    propertyLabel: row.property_label ?? undefined,
    unit: row.unit ?? undefined,
    trade: row.trade ?? undefined,
    rentalStart: row.rental_start ?? undefined,
    rentalEnd: row.rental_end ?? undefined,
    rentalInfo: row.rental_info ?? undefined,
    raw: (row.raw as Record<string, unknown> | null) ?? undefined,
  };
}

function recordToRow(
  userId: string,
  provider: CustomerDataProviderId,
  record: CustomerRecord,
  syncedAt: string,
  phoneNormalized: string | null
): Record<string, unknown> {
  return {
    user_id: userId,
    provider,
    external_id: record.externalId ?? record.id,
    record_type: record.recordType ?? "customer",
    name: record.name,
    phone: record.phone ?? null,
    phone_normalized: phoneNormalized,
    email: record.email ?? null,
    address: record.address ?? null,
    property_label: record.propertyLabel ?? null,
    unit: record.unit ?? null,
    trade: record.trade ?? null,
    rental_start: record.rentalStart ?? null,
    rental_end: record.rentalEnd ?? null,
    rental_info: record.rentalInfo ?? null,
    raw: record.raw ?? null,
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

  // Compute strict E.164 once and de-duplicate by phone so the
  // UNIQUE (user_id, phone_normalized) index never trips. The first record
  // for a number keeps it; later duplicates are stored with a null phone_e164.
  const seenPhones = new Set<string>();
  const rows = records.map((record) => {
    const e164 = record.phoneNormalized ?? toE164(record.phone ?? "") ?? null;
    let phoneNormalized: string | null = null;
    if (e164 && !seenPhones.has(e164)) {
      seenPhones.add(e164);
      phoneNormalized = e164;
    }
    return recordToRow(userId, provider, record, syncedAt, phoneNormalized);
  });

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

/** Synced tenant/customer records for the signed-in user (optionally one provider). */
export async function getCustomerRecords(
  provider?: CustomerDataProviderId
): Promise<CustomerRecord[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  let query = supabase
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .eq("record_type", "customer")
    .order("name", { ascending: true });

  if (provider) {
    query = query.eq("provider", provider);
  }

  const { data } = await query;
  return (data ?? []).map(rowToRecord);
}

/** Synced craftsman records from the active Daten source. */
export async function getCraftsmanRecords(
  provider?: CustomerDataProviderId
): Promise<CustomerRecord[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  let query = supabase
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .eq("record_type", "craftsman")
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
  const normalized = toE164(phone);
  if (!normalized) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .eq("record_type", "customer")
    .eq("phone_normalized", normalized)
    .limit(1)
    .maybeSingle();

  return data ? rowToRecord(data) : null;
}

/**
 * Find customer records by (partial) name from the Supabase mirror ONLY.
 * Safe during a live call (service-role, no user session).
 */
export async function findCustomersByNameForUser(
  userId: string,
  name: string,
  limit = 5
): Promise<CustomerRecord[]> {
  const needle = name.trim();
  if (!needle) return [];

  const admin = createAdminClient();
  // Escape PostgREST ilike wildcards/special chars in the user-provided needle.
  const escaped = needle.replace(/[%_,]/g, " ").trim();
  const { data } = await admin
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .eq("record_type", "customer")
    .ilike("name", `%${escaped}%`)
    .order("name", { ascending: true })
    .limit(limit);

  return (data ?? []).map(rowToRecord);
}

/** Craftsman records for a user (service-role, e.g. message inquiry analysis). */
export async function getCraftsmanRecordsForUser(
  userId: string
): Promise<CustomerRecord[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("customer_records")
    .select("*")
    .eq("user_id", userId)
    .eq("record_type", "craftsman")
    .order("name", { ascending: true });

  return (data ?? []).map(rowToRecord);
}
