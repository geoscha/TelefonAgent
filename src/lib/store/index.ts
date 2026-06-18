import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Call, SuggestedAction, TranscriptLine } from "@/lib/types";
import { teardownUserResources } from "@/lib/account/teardown";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUserId } from "@/lib/supabase/server";

/**
 * Supabase-backed data layer (replaces the former file store).
 *
 * Two access modes:
 *  - Session functions (getSettings, getProfile, …) run as the signed-in user
 *    via the cookie-bound client. Row Level Security scopes every query.
 *  - Admin functions (…ForUser, getUserIdByAgentId) run with the service role
 *    for trusted, session-less contexts (webhook, agent tool) and ALWAYS scope
 *    to an explicit user_id.
 */

// ── Types (unchanged public surface) ─────────────────────────────────────────

export type ForwardingType = "alle" | "bedingt";
export type ForwardingStatus = "nicht_eingerichtet" | "anleitung" | "aktiv";
export type {
  OnboardingPhase,
  SetupDemoStatus,
  StoredAgent,
} from "@/lib/onboarding-types";
import type { OnboardingPhase, SetupDemoStatus, StoredAgent } from "@/lib/onboarding-types";
export type CalendarProvider = "google" | "microsoft" | "apple";
export type BillingPlan = "free" | "pro";
export type BillingInterval = "monthly" | "yearly";

export interface ElevenLabsSettings {
  connected: boolean;
  workspaceInfo?: string;
  agentId?: string;
  agentName?: string;
  voiceId?: string;
  voiceName?: string;
  language?: string;
  greeting?: string;
  systemPrompt?: string;
  customerNumber?: string;
  customerNumberLabel?: string;
  forwardingType?: ForwardingType;
  forwardingStatus?: ForwardingStatus;
  forwardingActivatedAt?: string;
  appointmentBookingEnabled?: boolean;
  appointmentProvider?: CalendarProvider;
  /** This user's dedicated Cura DID (from the number pool). */
  curaForwardingNumber?: string;
  /** ElevenLabs phone_numbers id for agent assignment. */
  elevenLabsPhoneNumberId?: string;
  lastSync?: string;
  onboardingPhase?: OnboardingPhase;
  setupDemoStatus?: SetupDemoStatus;
  forwardingInstructions?: string;
  agents?: StoredAgent[];
  /** Set when the ElevenLabs agent was removed after free quota exhaustion. */
  agentSuspendedAt?: string;
  /** Call history snapshot preserved when the agent was suspended. */
  archivedCallStats?: Array<{ startedAt: string; durationSeconds: number }>;
}

export interface CalendarConnection {
  provider: CalendarProvider;
  connected: boolean;
  accountLabel?: string;
  connectedAt?: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  appPassword?: string;
  caldavCalendarUrl?: string;
}

export interface Profile {
  name: string;
  email: string;
  plan: BillingPlan;
  billingInterval?: BillingInterval;
}

const DEFAULT_SETTINGS: ElevenLabsSettings = { connected: false };
const DEFAULT_PROFILE: Profile = { name: "", email: "", plan: "free" };

// ── Row <-> object mapping ───────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToSettings(row: any): ElevenLabsSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    connected: Boolean(row.connected),
    workspaceInfo: row.workspace_info ?? undefined,
    agentId: row.agent_id ?? undefined,
    agentName: row.agent_name ?? undefined,
    voiceId: row.voice_id ?? undefined,
    voiceName: row.voice_name ?? undefined,
    language: row.language ?? undefined,
    greeting: row.greeting ?? undefined,
    systemPrompt: row.system_prompt ?? undefined,
    customerNumber: row.customer_number ?? undefined,
    customerNumberLabel: row.customer_number_label ?? undefined,
    forwardingType: row.forwarding_type ?? undefined,
    forwardingStatus: row.forwarding_status ?? undefined,
    forwardingActivatedAt: row.forwarding_activated_at ?? undefined,
    appointmentBookingEnabled: row.appointment_booking_enabled ?? undefined,
    appointmentProvider: row.appointment_provider ?? undefined,
    curaForwardingNumber: row.cura_forwarding_number ?? undefined,
    elevenLabsPhoneNumberId: row.elevenlabs_phone_number_id ?? undefined,
    lastSync: row.last_sync ?? undefined,
    onboardingPhase: row.onboarding_phase ?? undefined,
    setupDemoStatus: row.setup_demo_status ?? undefined,
    forwardingInstructions: row.forwarding_instructions ?? undefined,
    agents: Array.isArray(row.agents) ? (row.agents as StoredAgent[]) : undefined,
    agentSuspendedAt: row.agent_suspended_at ?? undefined,
    archivedCallStats: Array.isArray(row.archived_call_stats)
      ? (row.archived_call_stats as Array<{
          startedAt: string;
          durationSeconds: number;
        }>)
      : undefined,
  };
}

function settingsPatchToRow(patch: Partial<ElevenLabsSettings>): Record<string, unknown> {
  const map: Record<keyof ElevenLabsSettings, string> = {
    connected: "connected",
    workspaceInfo: "workspace_info",
    agentId: "agent_id",
    agentName: "agent_name",
    voiceId: "voice_id",
    voiceName: "voice_name",
    language: "language",
    greeting: "greeting",
    systemPrompt: "system_prompt",
    customerNumber: "customer_number",
    customerNumberLabel: "customer_number_label",
    forwardingType: "forwarding_type",
    forwardingStatus: "forwarding_status",
    forwardingActivatedAt: "forwarding_activated_at",
    appointmentBookingEnabled: "appointment_booking_enabled",
    appointmentProvider: "appointment_provider",
    curaForwardingNumber: "cura_forwarding_number",
    elevenLabsPhoneNumberId: "elevenlabs_phone_number_id",
    lastSync: "last_sync",
    onboardingPhase: "onboarding_phase",
    setupDemoStatus: "setup_demo_status",
    forwardingInstructions: "forwarding_instructions",
    agents: "agents",
    agentSuspendedAt: "agent_suspended_at",
    archivedCallStats: "archived_call_stats",
  };
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    const col = map[key as keyof ElevenLabsSettings];
    if (col) row[col] = value ?? null;
  }
  row.updated_at = new Date().toISOString();
  return row;
}

function rowToProfile(row: any): Profile {
  if (!row) return { ...DEFAULT_PROFILE };
  return {
    name: row.name ?? "",
    email: row.email ?? "",
    plan: row.plan === "pro" ? "pro" : "free",
    billingInterval: row.billing_interval ?? undefined,
  };
}

function rowToCall(row: any): Call {
  return {
    id: row.id,
    title: row.title ?? "",
    callerName: row.caller_name ?? undefined,
    callerPhone: row.caller_phone ?? "Unbekannt",
    property: row.property ?? "Unbekannt",
    startedAt: row.started_at,
    durationSeconds: row.duration_seconds ?? 0,
    summary: row.summary ?? "",
    category: row.category ?? "Allgemein",
    urgency: row.urgency ?? "niedrig",
    status: row.status ?? "offen",
    transcript: (row.transcript ?? []) as TranscriptLine[],
    structuredSummary:
      row.structured_summary ?? {
        property: row.property ?? "Unbekannt",
        concernType: row.category ?? "Allgemein",
        urgency: row.urgency ?? "niedrig",
      },
    suggestedActions: (row.suggested_actions ?? []) as SuggestedAction[],
  };
}

function callToRow(userId: string, call: Call): Record<string, unknown> {
  return {
    id: call.id,
    user_id: userId,
    title: call.title,
    caller_name: call.callerName ?? null,
    caller_phone: call.callerPhone,
    property: call.property,
    started_at: call.startedAt,
    duration_seconds: call.durationSeconds,
    summary: call.summary,
    category: call.category,
    urgency: call.urgency,
    status: call.status,
    transcript: call.transcript,
    structured_summary: call.structuredSummary,
    suggested_actions: call.suggestedActions,
  };
}

function rowToCalendar(row: any): CalendarConnection {
  return {
    provider: row.provider,
    connected: Boolean(row.connected),
    accountLabel: row.account_label ?? undefined,
    connectedAt: row.connected_at ?? undefined,
    accessToken: row.access_token ?? undefined,
    refreshToken: row.refresh_token ?? undefined,
    expiresAt: row.expires_at ?? undefined,
    appPassword: row.app_password ?? undefined,
    caldavCalendarUrl: row.caldav_calendar_url ?? undefined,
  };
}

function calendarPatchToRow(patch: Partial<CalendarConnection>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (patch.connected !== undefined) row.connected = patch.connected;
  if (patch.accountLabel !== undefined) row.account_label = patch.accountLabel;
  if (patch.connectedAt !== undefined) row.connected_at = patch.connectedAt;
  if (patch.accessToken !== undefined) row.access_token = patch.accessToken;
  if (patch.refreshToken !== undefined) row.refresh_token = patch.refreshToken;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;
  if (patch.appPassword !== undefined) row.app_password = patch.appPassword;
  if (patch.caldavCalendarUrl !== undefined)
    row.caldav_calendar_url = patch.caldavCalendarUrl;
  return row;
}

// ── Settings (session) ───────────────────────────────────────────────────────

export async function getSettings(): Promise<ElevenLabsSettings> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("app_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return rowToSettings(data);
}

export async function updateSettings(
  patch: Partial<ElevenLabsSettings>
): Promise<ElevenLabsSettings> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("app_settings")
    .upsert({ user_id: userId, ...settingsPatchToRow(patch) }, {
      onConflict: "user_id",
    })
    .select("*")
    .single();
  return rowToSettings(data);
}

// ── Settings (admin, explicit user) ──────────────────────────────────────────

export async function getUserIdByAgentId(
  agentId: string
): Promise<string | null> {
  const { resolveUserIdForIncomingCall } = await import(
    "@/lib/calls/resolve-user"
  );
  return resolveUserIdForIncomingCall({ agentId });
}

export async function getSettingsForUser(
  userId: string
): Promise<ElevenLabsSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  return rowToSettings(data);
}

export async function updateSettingsForUser(
  userId: string,
  patch: Partial<ElevenLabsSettings>
): Promise<ElevenLabsSettings> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .upsert({ user_id: userId, ...settingsPatchToRow(patch) }, {
      onConflict: "user_id",
    })
    .select("*")
    .single();
  return rowToSettings(data);
}

// ── Calls ────────────────────────────────────────────────────────────────────

export async function getStoredCalls(): Promise<Call[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from("calls")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) {
    console.error("[calls] getStoredCalls:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCall);
}

/** All calls for a user (admin/service role — webhooks, sync). */
export async function getCallsForUser(userId: string): Promise<Call[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("calls")
    .select("*")
    .eq("user_id", userId)
    .order("started_at", { ascending: false });
  if (error) {
    console.error("[calls] getCallsForUser:", error.message);
    return [];
  }
  return (data ?? []).map(rowToCall);
}

/** Upserts a batch of the current user's calls (used by normalisation). */
export async function saveCalls(calls: Call[]): Promise<void> {
  if (calls.length === 0) return;
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("calls")
    .upsert(calls.map((c) => callToRow(userId, c)), { onConflict: "id" });
}

/** Inserts a call for a specific user (webhook context, admin client). */
export async function addCallForUser(userId: string, call: Call): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("calls")
    .upsert(callToRow(userId, call), { onConflict: "id" });
  if (error) throw error;
}

// ── Profile (session) ────────────────────────────────────────────────────────

export async function getProfile(): Promise<Profile> {
  const supabase = createClient();
  const userId = await requireUserId();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  const profile = rowToProfile(data);
  if (user?.email) profile.email = user.email;
  return profile;
}

export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const supabase = createClient();
  const userId = await requireUserId();
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.email !== undefined) row.email = patch.email;
  if (patch.plan !== undefined) row.plan = patch.plan;
  if (patch.billingInterval !== undefined)
    row.billing_interval = patch.billingInterval;
  const { data } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...row }, { onConflict: "id" })
    .select("*")
    .single();
  return rowToProfile(data);
}

/** Permanently deletes the signed-in account (cascades to all their data). */
export async function deleteAccount(): Promise<void> {
  const userId = await requireUserId();
  await teardownUserResources(userId);
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("created_at")
    .eq("id", userId)
    .maybeSingle();

  const { data: callAgg } = await admin
    .from("calls")
    .select("duration_seconds")
    .eq("user_id", userId);

  const callSeconds = (callAgg ?? []).reduce(
    (s, c) => s + (c.duration_seconds ?? 0),
    0
  );

  await admin.from("customer_registry").upsert(
    {
      id: userId,
      created_at: profile?.created_at ?? new Date().toISOString(),
      deleted_at: new Date().toISOString(),
      call_seconds_lifetime: callSeconds,
    },
    { onConflict: "id" }
  );

  await admin.auth.admin.deleteUser(userId);
}

// ── Calendar connections (session) ───────────────────────────────────────────

export async function getCalendars(): Promise<
  Partial<Record<CalendarProvider, CalendarConnection>>
> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("calendars")
    .select("*")
    .eq("user_id", userId);
  const out: Partial<Record<CalendarProvider, CalendarConnection>> = {};
  for (const row of data ?? []) {
    out[row.provider as CalendarProvider] = rowToCalendar(row);
  }
  return out;
}

export async function getCalendar(
  provider: CalendarProvider
): Promise<CalendarConnection | undefined> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("calendars")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return data ? rowToCalendar(data) : undefined;
}

export async function upsertCalendar(
  provider: CalendarProvider,
  patch: Partial<CalendarConnection>
): Promise<CalendarConnection> {
  const supabase = createClient();
  const userId = await requireUserId();
  const { data } = await supabase
    .from("calendars")
    .upsert(
      { user_id: userId, provider, ...calendarPatchToRow(patch) },
      { onConflict: "user_id,provider" }
    )
    .select("*")
    .single();
  return rowToCalendar(data);
}

export async function removeCalendar(provider: CalendarProvider): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await supabase
    .from("calendars")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  // If the agent was set to book into this calendar, turn it off.
  const settings = await getSettings();
  if (settings.appointmentProvider === provider) {
    await updateSettings({
      appointmentProvider: undefined,
      appointmentBookingEnabled: false,
    });
  }
}

// ── Calendar connections (admin, explicit user) ──────────────────────────────

export async function getCalendarForUser(
  userId: string,
  provider: CalendarProvider
): Promise<CalendarConnection | undefined> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendars")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return data ? rowToCalendar(data) : undefined;
}

export async function upsertCalendarForUser(
  userId: string,
  provider: CalendarProvider,
  patch: Partial<CalendarConnection>
): Promise<CalendarConnection> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("calendars")
    .upsert(
      { user_id: userId, provider, ...calendarPatchToRow(patch) },
      { onConflict: "user_id,provider" }
    )
    .select("*")
    .single();
  return rowToCalendar(data);
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// Re-export the Supabase client type for consumers that need it.
export type { SupabaseClient };
