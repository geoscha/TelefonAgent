import "server-only";

import { chargeCallTokens } from "@/lib/billing/tokens";

/** @deprecated Use chargeCallTokens from @/lib/billing/tokens */
export async function addCallUsage(
  userId: string,
  seconds: number,
  callId?: string
): Promise<void> {
  if (!callId) {
    console.warn("[quota] addCallUsage without callId — skipped token debit");
    return;
  }
  await chargeCallTokens(userId, callId, seconds);
}

/** @deprecated Token billing — no-op */
export async function enforceFreeQuotaIfNeeded(userId: string): Promise<void> {
  void userId;
}
