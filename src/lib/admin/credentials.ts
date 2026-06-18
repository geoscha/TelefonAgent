import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  envAdminCredentials,
  hashAdminCode,
  verifyAdminCode,
} from "@/lib/admin/crypto";

export interface AdminCredentials {
  username: string;
}

/** Returns stored admin username + verifies code against DB or env fallback. */
export async function verifyAdminLogin(
  username: string,
  code: string
): Promise<boolean> {
  const inputUser = username.trim();
  const inputCode = code.trim();
  if (!inputUser || !inputCode) return false;

  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("username, code_hash")
    .eq("id", 1)
    .maybeSingle();

  if (data) {
    if (inputUser !== data.username) return false;
    return verifyAdminCode(inputCode, data.code_hash);
  }

  const env = envAdminCredentials();
  return inputUser === env.username && inputCode === env.code;
}

/** Ensures admin_config row exists (seeds from env on first admin settings save). */
export async function getAdminUsername(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("admin_config")
    .select("username")
    .eq("id", 1)
    .maybeSingle();
  if (data?.username) return data.username;
  return envAdminCredentials().username;
}

export async function updateAdminCredentials(
  username: string,
  code: string
): Promise<void> {
  const trimmedUser = username.trim();
  const trimmedCode = code.trim();
  if (!trimmedUser || trimmedCode.length < 4) {
    throw new Error("Benutzername und Code (min. 4 Zeichen) erforderlich.");
  }

  const admin = createAdminClient();
  const { error } = await admin.from("admin_config").upsert(
    {
      id: 1,
      username: trimmedUser,
      code_hash: hashAdminCode(trimmedCode),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) throw error;
}
