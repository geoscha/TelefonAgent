import "server-only";

import {
  DEFAULT_TOKEN_PACKS,
  formatTokenPackLabel,
  isValidStripeCheckoutPrice,
  STRIPE_MIN_PRICE_CHF,
  type TokenPackConfig,
} from "@/lib/billing/token-pack-types";
import { createAdminClient } from "@/lib/supabase/admin";

function slugifyId(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || `pack_${Date.now()}`;
}

export function normalizeTokenPacks(input: unknown): TokenPackConfig[] {
  if (!Array.isArray(input) || input.length === 0) {
    return DEFAULT_TOKEN_PACKS.map((pack, index) => ({
      ...pack,
      sortOrder: index,
    }));
  }

  const seen = new Set<string>();
  const packs: TokenPackConfig[] = [];

  for (let index = 0; index < input.length; index++) {
    const raw = input[index];
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;

    const tokens = Math.round(Number(row.tokens));
    const priceChf = Number(row.priceChf);
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new Error("Jedes Paket braucht eine positive Token-Anzahl.");
    }
    if (!Number.isFinite(priceChf) || priceChf <= 0) {
      throw new Error("Jedes Paket braucht einen Preis grösser als 0.");
    }
    if (!isValidStripeCheckoutPrice(priceChf)) {
      throw new Error(
        `Preis CHF ${priceChf} ist unter dem Stripe-Minimum von CHF ${STRIPE_MIN_PRICE_CHF.toFixed(2)}.`
      );
    }

    const label =
      typeof row.label === "string" && row.label.trim()
        ? row.label.trim()
        : formatTokenPackLabel(tokens);

    let id =
      typeof row.id === "string" && row.id.trim()
        ? row.id.trim()
        : slugifyId(label);
    if (seen.has(id)) {
      id = `${id}_${index}`;
    }
    seen.add(id);

    packs.push({
      id,
      tokens,
      priceChf: Math.round(priceChf * 100) / 100,
      label,
      enabled: row.enabled !== false,
      sortOrder:
        typeof row.sortOrder === "number" && Number.isFinite(row.sortOrder)
          ? row.sortOrder
          : index,
    });
  }

  if (packs.length === 0) {
    throw new Error("Mindestens ein Token-Paket erforderlich.");
  }

  if (!packs.some((pack) => pack.enabled)) {
    throw new Error("Mindestens ein Token-Paket muss aktiv sein.");
  }

  return packs.sort((a, b) => a.sortOrder - b.sortOrder);
}

async function readTokenPacksRow(): Promise<TokenPackConfig[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("admin_config")
    .select("token_packs")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    const message = error.message ?? "";
    if (message.includes("token_packs")) {
      return DEFAULT_TOKEN_PACKS;
    }
    throw error;
  }

  const raw = data?.token_packs;
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_TOKEN_PACKS;
  }

  try {
    return normalizeTokenPacks(raw);
  } catch {
    return DEFAULT_TOKEN_PACKS;
  }
}

export async function getTokenPacks(options?: {
  enabledOnly?: boolean;
}): Promise<TokenPackConfig[]> {
  const packs = await readTokenPacksRow();
  if (options?.enabledOnly) {
    return packs.filter((pack) => pack.enabled);
  }
  return packs;
}

export async function getTokenPackById(
  packId: string
): Promise<TokenPackConfig | undefined> {
  const packs = await getTokenPacks();
  return packs.find((pack) => pack.id === packId && pack.enabled);
}

export async function updateTokenPacks(
  packs: unknown
): Promise<TokenPackConfig[]> {
  const normalized = normalizeTokenPacks(packs);
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("admin_config")
    .select("id")
    .eq("id", 1)
    .maybeSingle();

  const row = {
    token_packs: normalized,
    updated_at: new Date().toISOString(),
  };

  if (!existing) {
    const { envAdminCredentials, hashAdminCode } = await import(
      "@/lib/admin/crypto"
    );
    const env = envAdminCredentials();
    await admin.from("admin_config").insert({
      id: 1,
      username: env.username,
      code_hash: hashAdminCode(env.code),
      ...row,
    });
    return normalized;
  }

  const { error } = await admin.from("admin_config").update(row).eq("id", 1);
  if (error) throw error;
  return normalized;
}
