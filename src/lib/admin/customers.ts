import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getSettingsForUser,
  updateSettingsForUser,
  type BillingInterval,
  type BillingPlan,
  type ElevenLabsSettings,
  type Profile,
} from "@/lib/store";

export interface AdminCustomerSummary {
  id: string;
  name: string;
  email: string;
  plan: BillingPlan;
  billingInterval?: BillingInterval;
  createdAt: string;
  curaNumber?: string;
  onboardingPhase?: string;
  callCount: number;
  lastCallAt?: string;
}

export interface AdminCustomerDetail {
  profile: Profile & { id: string; createdAt: string };
  settings: ElevenLabsSettings;
  stats: {
    callCount: number;
    totalMinutes: number;
    lastCallAt?: string;
  };
  calls: {
    id: string;
    title: string;
    startedAt: string;
    durationSeconds: number;
    summary: string;
    callerPhone: string;
    status: string;
  }[];
  requests: {
    id: string;
    type: string;
    status: string;
    createdAt: string;
    payload: Record<string, unknown>;
  }[];
}

function rowToProfile(row: Record<string, unknown>): Profile & {
  id: string;
  createdAt: string;
} {
  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    email: (row.email as string) ?? "",
    plan: row.plan === "pro" ? "pro" : "free",
    billingInterval: (row.billing_interval as BillingInterval) ?? undefined,
    createdAt: row.created_at as string,
  };
}

export async function listAdminCustomers(options?: {
  search?: string;
}): Promise<AdminCustomerSummary[]> {
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, name, email, plan, billing_interval, created_at")
    .order("created_at", { ascending: false });

  if (!profiles?.length) return [];

  const ids = profiles.map((p) => p.id as string);

  const [{ data: settingsRows }, { data: callStats }] = await Promise.all([
    admin
      .from("app_settings")
      .select("user_id, cura_forwarding_number, onboarding_phase")
      .in("user_id", ids),
    admin.from("calls").select("user_id, started_at, duration_seconds").in("user_id", ids),
  ]);

  const settingsByUser = new Map(
    (settingsRows ?? []).map((r) => [r.user_id as string, r])
  );

  const callsByUser = new Map<
    string,
    { count: number; lastCallAt?: string; minutes: number }
  >();
  for (const c of callStats ?? []) {
    const uid = c.user_id as string;
    const prev = callsByUser.get(uid) ?? { count: 0, minutes: 0 };
    prev.count += 1;
    prev.minutes += (c.duration_seconds as number) ?? 0;
    const started = c.started_at as string;
    if (!prev.lastCallAt || started > prev.lastCallAt) {
      prev.lastCallAt = started;
    }
    callsByUser.set(uid, prev);
  }

  let result: AdminCustomerSummary[] = profiles.map((p) => {
    const id = p.id as string;
    const settings = settingsByUser.get(id);
    const calls = callsByUser.get(id);
    return {
      id,
      name: (p.name as string) ?? "",
      email: (p.email as string) ?? "",
      plan: p.plan === "pro" ? "pro" : "free",
      billingInterval: (p.billing_interval as BillingInterval) ?? undefined,
      createdAt: p.created_at as string,
      curaNumber: (settings?.cura_forwarding_number as string) ?? undefined,
      onboardingPhase: (settings?.onboarding_phase as string) ?? undefined,
      callCount: calls?.count ?? 0,
      lastCallAt: calls?.lastCallAt,
    };
  });

  const q = options?.search?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.curaNumber?.includes(q)
    );
  }

  return result;
}

export async function getAdminCustomer(
  userId: string
): Promise<AdminCustomerDetail | null> {
  const admin = createAdminClient();

  const { data: profileRow } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (!profileRow) return null;

  const [settings, { data: calls }, { data: requests }] = await Promise.all([
    getSettingsForUser(userId),
    admin
      .from("calls")
      .select("id, title, started_at, duration_seconds, summary, caller_phone, status")
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(50),
    admin
      .from("requests")
      .select("id, type, status, created_at, payload")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const callRows = calls ?? [];
  const totalMinutes =
    callRows.reduce((s, c) => s + ((c.duration_seconds as number) ?? 0), 0) /
    60;

  return {
    profile: rowToProfile(profileRow as Record<string, unknown>),
    settings,
    stats: {
      callCount: callRows.length,
      totalMinutes,
      lastCallAt: callRows[0]?.started_at as string | undefined,
    },
    calls: callRows.map((c) => ({
      id: c.id as string,
      title: (c.title as string) ?? "",
      startedAt: c.started_at as string,
      durationSeconds: (c.duration_seconds as number) ?? 0,
      summary: (c.summary as string) ?? "",
      callerPhone: (c.caller_phone as string) ?? "",
      status: (c.status as string) ?? "",
    })),
    requests: (requests ?? []).map((r) => ({
      id: r.id as string,
      type: r.type as string,
      status: r.status as string,
      createdAt: r.created_at as string,
      payload: (r.payload as Record<string, unknown>) ?? {},
    })),
  };
}

export async function updateAdminCustomer(
  userId: string,
  patch: {
    profile?: Partial<Profile>;
    settings?: Partial<ElevenLabsSettings>;
  }
): Promise<AdminCustomerDetail> {
  const admin = createAdminClient();

  if (patch.profile) {
    const row: Record<string, unknown> = {};
    if (patch.profile.name !== undefined) row.name = patch.profile.name;
    if (patch.profile.email !== undefined) row.email = patch.profile.email;
    if (patch.profile.plan !== undefined) row.plan = patch.profile.plan;
    if (patch.profile.billingInterval !== undefined) {
      row.billing_interval = patch.profile.billingInterval;
    }
    if (Object.keys(row).length > 0) {
      await admin.from("profiles").update(row).eq("id", userId);
    }
  }

  if (patch.settings && Object.keys(patch.settings).length > 0) {
    await updateSettingsForUser(userId, patch.settings);
  }

  const detail = await getAdminCustomer(userId);
  if (!detail) throw new Error("Customer not found");
  return detail;
}
