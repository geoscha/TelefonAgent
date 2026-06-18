/**
 * Applies token RPC migration 0027 via Supabase database connection.
 * Requires SUPABASE_DB_URL in .env.local (Project Settings → Database → Connection string).
 * Usage: node scripts/apply-token-migration.mjs
 */
import { readFileSync } from "fs";
import { resolve } from "path";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  const raw = readFileSync(path, "utf8");
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    process.env[m[1]] = val;
  }
}

loadEnv();

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(
    "Set SUPABASE_DB_URL in .env.local (Postgres connection string from Supabase dashboard), then re-run."
  );
  console.error("Or paste supabase/migrations/0027_token_rpc_no_updated_at.sql into the Supabase SQL editor.");
  process.exit(1);
}

const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0027_token_rpc_no_updated_at.sql"),
  "utf8"
);

const { Client } = await import("pg");
const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });

try {
  await client.connect();
  await client.query(sql);
  console.log("Migration 0027 applied successfully.");
} finally {
  await client.end();
}
