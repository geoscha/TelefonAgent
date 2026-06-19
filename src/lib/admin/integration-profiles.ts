import "server-only";

import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

import { createAdminClient } from "@/lib/supabase/admin";

export interface TwilioCredentials {
  id?: string;
  label?: string;
  accountSid: string;
  authToken: string;
}

export interface ElevenLabsCredentials {
  id?: string;
  label?: string;
  apiKey: string;
}

export interface TwilioAccountPublic {
  id: string;
  label: string;
  accountSidMasked: string;
  isDefault: boolean;
  createdAt: string;
}

export interface ElevenLabsAccountPublic {
  id: string;
  label: string;
  apiKeyMasked: string;
  isDefault: boolean;
  fromEnv?: boolean;
  createdAt: string;
}

function maskSecret(value: string, visible = 4): string {
  if (!value) return "";
  if (value.length <= visible) return "••••";
  return `${"•".repeat(8)}${value.slice(-visible)}`;
}

function envElevenLabsKey(): string {
  return process.env.ELEVENLABS_API_KEY?.trim() ?? "";
}

const TWILIO_SID_PATTERN = /^AC[0-9a-fA-F]{32}$/;

export function parseTwilioCredentialFields(
  accountSid: string,
  authToken: string
): { accountSid: string; authToken: string } {
  const sid = accountSid.trim();
  const token = authToken.trim();

  if (!sid) {
    throw new Error(
      "Twilio Account SID fehlt. Bitte die SID eingeben (beginnt mit AC)."
    );
  }
  if (!TWILIO_SID_PATTERN.test(sid)) {
    throw new Error(
      "Ungültige Account SID. Sie muss mit AC beginnen und 34 Zeichen lang sein."
    );
  }
  if (!token) {
    throw new Error(
      "Twilio Auth Token fehlt. Bitte neben der SID auch den Auth Token eingeben."
    );
  }

  return { accountSid: sid, authToken: token };
}

function rowToTwilioCredentials(row: {
  id: string;
  label: string;
  account_sid: string;
  auth_token: string;
}): TwilioCredentials {
  const { accountSid, authToken } = parseTwilioCredentialFields(
    row.account_sid,
    row.auth_token
  );
  return {
    id: row.id,
    label: row.label,
    accountSid,
    authToken,
  };
}

async function readLegacyTwilioFromConfig(): Promise<TwilioCredentials | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("twilio_account_sid, twilio_auth_token")
    .eq("id", 1)
    .maybeSingle();

  const accountSid = (data?.twilio_account_sid as string)?.trim() ?? "";
  const authToken = (data?.twilio_auth_token as string)?.trim() ?? "";
  if (!accountSid || !authToken) return null;

  try {
    return {
      ...parseTwilioCredentialFields(accountSid, authToken),
      label: "Legacy",
    };
  } catch {
    return null;
  }
}

async function readLegacyElevenLabsFromConfig(): Promise<ElevenLabsCredentials | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("elevenlabs_finance_api_key")
    .eq("id", 1)
    .maybeSingle();

  const apiKey = (data?.elevenlabs_finance_api_key as string)?.trim() ?? "";
  if (!apiKey) return null;
  return { label: "Legacy", apiKey };
}

async function syncDefaultTwilioToAdminConfig(
  accountSid: string,
  authToken: string
): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("admin_config")
    .update({
      twilio_account_sid: accountSid,
      twilio_auth_token: authToken,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
}

async function clearOtherTwilioDefaults(
  admin: ReturnType<typeof createAdminClient>,
  exceptId?: string
) {
  let q = admin
    .from("admin_twilio_accounts")
    .update({ is_default: false })
    .eq("is_default", true);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

async function clearOtherElevenLabsDefaults(
  admin: ReturnType<typeof createAdminClient>,
  exceptId?: string
) {
  let q = admin
    .from("admin_elevenlabs_accounts")
    .update({ is_default: false })
    .eq("is_default", true);
  if (exceptId) q = q.neq("id", exceptId);
  await q;
}

export async function listTwilioAccountsPublic(): Promise<TwilioAccountPublic[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_twilio_accounts")
    .select("id, label, account_sid, is_default, created_at")
    .order("created_at", { ascending: true });

  return (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    accountSidMasked: maskSecret(row.account_sid as string, 6),
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at as string,
  }));
}

export async function listElevenLabsAccountsPublic(): Promise<
  ElevenLabsAccountPublic[]
> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_elevenlabs_accounts")
    .select("id, label, api_key, is_default, created_at")
    .order("created_at", { ascending: true });

  const accounts: ElevenLabsAccountPublic[] = (data ?? []).map((row) => ({
    id: row.id as string,
    label: row.label as string,
    apiKeyMasked: maskSecret(row.api_key as string),
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at as string,
  }));

  const envKey = envElevenLabsKey();
  if (envKey && !accounts.some((a) => a.isDefault)) {
    accounts.unshift({
      id: "__env__",
      label: "Umgebungsvariable",
      apiKeyMasked: `${maskSecret(envKey)} (Env)`,
      isDefault: accounts.length === 0,
      fromEnv: true,
      createdAt: new Date(0).toISOString(),
    });
  }

  return accounts;
}

export async function getTwilioCredentials(
  accountId?: string
): Promise<TwilioCredentials> {
  const admin = createAdminClient();

  if (accountId) {
    const { data, error } = await admin
      .from("admin_twilio_accounts")
      .select("id, label, account_sid, auth_token")
      .eq("id", accountId)
      .maybeSingle();
    if (error || !data) {
      throw new Error("Twilio-Konto nicht gefunden.");
    }
    return rowToTwilioCredentials({
      id: data.id as string,
      label: data.label as string,
      account_sid: data.account_sid as string,
      auth_token: data.auth_token as string,
    });
  }

  const { data: defaultRow } = await admin
    .from("admin_twilio_accounts")
    .select("id, label, account_sid, auth_token")
    .eq("is_default", true)
    .maybeSingle();

  if (defaultRow) {
    try {
      return rowToTwilioCredentials({
        id: defaultRow.id as string,
        label: defaultRow.label as string,
        account_sid: defaultRow.account_sid as string,
        auth_token: defaultRow.auth_token as string,
      });
    } catch {
      // Fall through to legacy / next account.
    }
  }

  const { data: anyRow } = await admin
    .from("admin_twilio_accounts")
    .select("id, label, account_sid, auth_token")
    .order("created_at", { ascending: true });

  for (const row of anyRow ?? []) {
    try {
      return rowToTwilioCredentials({
        id: row.id as string,
        label: row.label as string,
        account_sid: row.account_sid as string,
        auth_token: row.auth_token as string,
      });
    } catch {
      continue;
    }
  }

  const legacy = await readLegacyTwilioFromConfig();
  if (legacy) return legacy;

  throw new Error(
    "Kein gültiges Twilio-Konto hinterlegt. Bitte unter Einstellungen SID (AC…) und Auth Token speichern."
  );
}

export async function getElevenLabsCredentials(
  accountId?: string
): Promise<ElevenLabsCredentials> {
  if (accountId === "__env__") {
    const key = envElevenLabsKey();
    if (!key) throw new Error("ELEVENLABS_API_KEY ist nicht gesetzt.");
    return { id: "__env__", label: "Umgebungsvariable", apiKey: key };
  }

  const admin = createAdminClient();

  if (accountId) {
    const { data, error } = await admin
      .from("admin_elevenlabs_accounts")
      .select("id, label, api_key")
      .eq("id", accountId)
      .maybeSingle();
    if (error || !data) {
      throw new Error("ElevenLabs-Konto nicht gefunden.");
    }
    return {
      id: data.id as string,
      label: data.label as string,
      apiKey: data.api_key as string,
    };
  }

  const { data: defaultRow } = await admin
    .from("admin_elevenlabs_accounts")
    .select("id, label, api_key")
    .eq("is_default", true)
    .maybeSingle();

  if (defaultRow?.api_key) {
    return {
      id: defaultRow.id as string,
      label: defaultRow.label as string,
      apiKey: defaultRow.api_key as string,
    };
  }

  const { data: anyRow } = await admin
    .from("admin_elevenlabs_accounts")
    .select("id, label, api_key")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (anyRow?.api_key) {
    return {
      id: anyRow.id as string,
      label: anyRow.label as string,
      apiKey: anyRow.api_key as string,
    };
  }

  const envKey = envElevenLabsKey();
  if (envKey) {
    return { id: "__env__", label: "Umgebungsvariable", apiKey: envKey };
  }

  const legacy = await readLegacyElevenLabsFromConfig();
  if (legacy) return legacy;

  throw new Error(
    "Kein ElevenLabs-Konto hinterlegt. Bitte unter Einstellungen ein Konto anlegen."
  );
}

export function createElevenLabsClientForCredentials(
  credentials: ElevenLabsCredentials
): ElevenLabsClient {
  return new ElevenLabsClient({ apiKey: credentials.apiKey });
}

export async function createTwilioAccount(input: {
  label: string;
  accountSid: string;
  authToken: string;
  isDefault?: boolean;
}): Promise<TwilioAccountPublic> {
  const label = input.label.trim();
  const { accountSid, authToken } = parseTwilioCredentialFields(
    input.accountSid,
    input.authToken
  );

  if (!label) throw new Error("Bitte eine Bezeichnung angeben.");

  const admin = createAdminClient();
  const isDefault = input.isDefault ?? false;

  if (isDefault) await clearOtherTwilioDefaults(admin);

  const { count } = await admin
    .from("admin_twilio_accounts")
    .select("id", { count: "exact", head: true });
  const makeDefault = isDefault || (count ?? 0) === 0;

  if (makeDefault && !isDefault) await clearOtherTwilioDefaults(admin);

  const { data, error } = await admin
    .from("admin_twilio_accounts")
    .insert({
      label,
      account_sid: accountSid,
      auth_token: authToken,
      is_default: makeDefault,
    })
    .select("id, label, account_sid, is_default, created_at")
    .single();

  if (error || !data) throw error ?? new Error("Speichern fehlgeschlagen.");

  if (makeDefault) {
    await syncDefaultTwilioToAdminConfig(accountSid, authToken);
  }

  return {
    id: data.id as string,
    label: data.label as string,
    accountSidMasked: maskSecret(data.account_sid as string, 6),
    isDefault: Boolean(data.is_default),
    createdAt: data.created_at as string,
  };
}

export async function updateTwilioAccount(input: {
  id: string;
  label?: string;
  accountSid?: string;
  authToken?: string;
}): Promise<TwilioAccountPublic> {
  const admin = createAdminClient();
  const { data: existing, error: loadError } = await admin
    .from("admin_twilio_accounts")
    .select("id, label, account_sid, auth_token, is_default")
    .eq("id", input.id)
    .maybeSingle();

  if (loadError || !existing) {
    throw new Error("Twilio-Konto nicht gefunden.");
  }

  const accountSid = input.accountSid ?? (existing.account_sid as string);
  const authToken = input.authToken ?? (existing.auth_token as string);
  const { accountSid: sid, authToken: token } = parseTwilioCredentialFields(
    accountSid,
    authToken
  );

  const label = input.label?.trim() || (existing.label as string);

  const { data, error } = await admin
    .from("admin_twilio_accounts")
    .update({
      label,
      account_sid: sid,
      auth_token: token,
    })
    .eq("id", input.id)
    .select("id, label, account_sid, is_default, created_at")
    .single();

  if (error || !data) throw error ?? new Error("Aktualisierung fehlgeschlagen.");

  if (existing.is_default) {
    await syncDefaultTwilioToAdminConfig(sid, token);
  }

  return {
    id: data.id as string,
    label: data.label as string,
    accountSidMasked: maskSecret(data.account_sid as string, 6),
    isDefault: Boolean(data.is_default),
    createdAt: data.created_at as string,
  };
}

export async function createElevenLabsAccount(input: {
  label: string;
  apiKey: string;
  isDefault?: boolean;
}): Promise<ElevenLabsAccountPublic> {
  const label = input.label.trim();
  const apiKey = input.apiKey.trim();

  if (!label) throw new Error("Bitte eine Bezeichnung angeben.");
  if (!apiKey) throw new Error("API Key erforderlich.");

  const admin = createAdminClient();
  const isDefault = input.isDefault ?? false;

  if (isDefault) await clearOtherElevenLabsDefaults(admin);

  const { count } = await admin
    .from("admin_elevenlabs_accounts")
    .select("id", { count: "exact", head: true });
  const makeDefault = isDefault || (count ?? 0) === 0;

  if (makeDefault && !isDefault) await clearOtherElevenLabsDefaults(admin);

  const { data, error } = await admin
    .from("admin_elevenlabs_accounts")
    .insert({
      label,
      api_key: apiKey,
      is_default: makeDefault,
    })
    .select("id, label, api_key, is_default, created_at")
    .single();

  if (error || !data) throw error ?? new Error("Speichern fehlgeschlagen.");

  return {
    id: data.id as string,
    label: data.label as string,
    apiKeyMasked: maskSecret(data.api_key as string),
    isDefault: Boolean(data.is_default),
    createdAt: data.created_at as string,
  };
}

export async function updateElevenLabsAccount(input: {
  id: string;
  label?: string;
  apiKey?: string;
}): Promise<ElevenLabsAccountPublic> {
  const admin = createAdminClient();
  const { data: existing, error: loadError } = await admin
    .from("admin_elevenlabs_accounts")
    .select("id, label, api_key, is_default")
    .eq("id", input.id)
    .maybeSingle();

  if (loadError || !existing) {
    throw new Error("ElevenLabs-Konto nicht gefunden.");
  }

  const apiKey = (input.apiKey ?? (existing.api_key as string)).trim();
  if (!apiKey) throw new Error("API Key erforderlich.");

  const label = input.label?.trim() || (existing.label as string);

  const { data, error } = await admin
    .from("admin_elevenlabs_accounts")
    .update({
      label,
      api_key: apiKey,
    })
    .eq("id", input.id)
    .select("id, label, api_key, is_default, created_at")
    .single();

  if (error || !data) throw error ?? new Error("Aktualisierung fehlgeschlagen.");

  return {
    id: data.id as string,
    label: data.label as string,
    apiKeyMasked: maskSecret(data.api_key as string),
    isDefault: Boolean(data.is_default),
    createdAt: data.created_at as string,
  };
}

export async function deleteTwilioAccount(id: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("admin_twilio_accounts")
    .select("is_default")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin.from("admin_twilio_accounts").delete().eq("id", id);
  if (error) throw error;

  if (row?.is_default) {
    const { data: next } = await admin
      .from("admin_twilio_accounts")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await admin
        .from("admin_twilio_accounts")
        .update({ is_default: true })
        .eq("id", next.id);
    }
  }
}

export async function deleteElevenLabsAccount(id: string): Promise<void> {
  if (id === "__env__") {
    throw new Error("Die Umgebungsvariable kann hier nicht gelöscht werden.");
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("admin_elevenlabs_accounts")
    .select("is_default")
    .eq("id", id)
    .maybeSingle();

  const { error } = await admin
    .from("admin_elevenlabs_accounts")
    .delete()
    .eq("id", id);
  if (error) throw error;

  if (row?.is_default) {
    const { data: next } = await admin
      .from("admin_elevenlabs_accounts")
      .select("id")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (next?.id) {
      await admin
        .from("admin_elevenlabs_accounts")
        .update({ is_default: true })
        .eq("id", next.id);
    }
  }
}

export async function setDefaultTwilioAccount(id: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("admin_twilio_accounts")
    .select("account_sid, auth_token")
    .eq("id", id)
    .maybeSingle();

  if (!row) throw new Error("Twilio-Konto nicht gefunden.");

  const { accountSid, authToken } = parseTwilioCredentialFields(
    row.account_sid as string,
    row.auth_token as string
  );

  await clearOtherTwilioDefaults(admin, id);
  const { error } = await admin
    .from("admin_twilio_accounts")
    .update({ is_default: true })
    .eq("id", id);
  if (error) throw error;

  await syncDefaultTwilioToAdminConfig(accountSid, authToken);
}

export async function setDefaultElevenLabsAccount(id: string): Promise<void> {
  if (id === "__env__") {
    await clearOtherElevenLabsDefaults(createAdminClient());
    return;
  }

  const admin = createAdminClient();
  await clearOtherElevenLabsDefaults(admin, id);
  const { error } = await admin
    .from("admin_elevenlabs_accounts")
    .update({ is_default: true })
    .eq("id", id);
  if (error) throw error;
}
