/**
 * Deletes all Supabase auth users (cascades to profiles, settings, calls, calendars)
 * and resets the forwarding number pool. Run: node scripts/reset-platform.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local nicht gefunden.");
  }
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i === -1) continue;
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

async function deleteAllUsers(admin) {
  let deleted = 0;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw error;
    if (!data.users.length) break;
    for (const user of data.users) {
      const { error: delErr } = await admin.auth.admin.deleteUser(user.id);
      if (delErr) throw delErr;
      deleted += 1;
      console.log(`  gelöscht: ${user.email ?? user.id}`);
    }
  }
  return deleted;
}

async function resetPool(admin) {
  const { error } = await admin
    .from("forwarding_number_pool")
    .update({ assigned_user_id: null, assigned_at: null })
    .not("phone_number", "is", null);
  if (error && error.code !== "PGRST116") throw error;
}

async function clearPublicTables(admin) {
  for (const table of ["calls", "calendars", "app_settings", "profiles"]) {
    const { error } = await admin.from(table).delete().neq(
      table === "profiles" ? "id" : "user_id",
      "00000000-0000-0000-0000-000000000000"
    );
    if (error && error.code !== "PGRST116") {
      console.warn(`  warnung ${table}:`, error.message);
    }
  }
}

function clearLegacyStore() {
  const storePath = path.join(root, ".data", "cura-store.json");
  if (!fs.existsSync(storePath)) return false;
  fs.writeFileSync(
    storePath,
    JSON.stringify({ settings: { connected: false }, calls: [] }, null, 2)
  );
  return true;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.");
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log("Lösche alle Auth-User…");
  const deleted = await deleteAllUsers(admin);
  console.log(`  ${deleted} User entfernt.`);

  console.log("Leere verbleibende Tabellen…");
  await clearPublicTables(admin);

  console.log("Setze Nummern-Pool zurück…");
  await resetPool(admin);

  if (clearLegacyStore()) {
    console.log("Legacy-Datei .data/cura-store.json zurückgesetzt.");
  }

  console.log("\nFertig — Plattform ist zurückgesetzt.");
  console.log("Neue User können sich unter /signup registrieren.");
}

main().catch((err) => {
  console.error("Reset fehlgeschlagen:", err.message ?? err);
  process.exit(1);
});
