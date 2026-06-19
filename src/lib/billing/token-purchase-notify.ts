import "server-only";

import { getTokenPack } from "@/lib/billing/quota-display";
import { sendTokenPurchaseReceiptEmail } from "@/lib/email/token-purchase-receipt";
import { createAdminClient } from "@/lib/supabase/admin";

export interface NotifyTokenPurchaseInput {
  userId: string;
  tokens: number;
  packId?: string;
  priceChf?: number;
  referenceId: string;
  purchasedAt?: string;
  receiptUrl?: string | null;
}

async function loadProfileContact(userId: string): Promise<{
  email: string;
  name: string;
} | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("email, name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[token-purchase-notify] profile load:", error.message);
    return null;
  }

  if (!data?.email?.trim()) return null;
  return {
    email: data.email.trim(),
    name: data.name?.trim() ?? "",
  };
}

function resolvePriceChf(input: NotifyTokenPurchaseInput): number {
  if (input.priceChf != null && input.priceChf > 0) return input.priceChf;
  const pack = input.packId ? getTokenPack(input.packId) : undefined;
  if (pack) return pack.priceChf;
  return Math.round((input.tokens / 1000) * 100) / 100;
}

export async function notifyTokenPurchaseEmail(
  input: NotifyTokenPurchaseInput
): Promise<void> {
  try {
    const contact = await loadProfileContact(input.userId);
    if (!contact) {
      console.warn("[token-purchase-notify] no email for user", input.userId);
      return;
    }

    const pack = input.packId ? getTokenPack(input.packId) : undefined;
    const result = await sendTokenPurchaseReceiptEmail({
      to: contact.email,
      customerName: contact.name || undefined,
      tokens: input.tokens,
      priceChf: resolvePriceChf(input),
      packLabel: pack?.label,
      purchasedAt: input.purchasedAt ?? new Date().toISOString(),
      referenceId: input.referenceId,
      receiptUrl: input.receiptUrl,
    });

    if (!result.ok && !result.skipped) {
      console.error("[token-purchase-notify] email failed for", input.userId);
    }
  } catch (error) {
    console.error("[token-purchase-notify] unexpected error:", error);
  }
}
