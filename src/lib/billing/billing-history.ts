import "server-only";

import {
  listTokenPurchases,
  type BillingPurchaseEntry,
  type BillingTransactionRow,
} from "@/lib/billing/billing-history-format";
import { createClient } from "@/lib/supabase/server";

interface TokenTransactionDbRow {
  id: string;
  created_at: string;
  amount: number;
  balance_after: number;
  source: string;
  reference_id: string | null;
  metadata: Record<string, unknown> | null;
}

function mapTransaction(row: TokenTransactionDbRow): BillingTransactionRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    amount: row.amount,
    balanceAfter: row.balance_after,
    source: row.source,
    referenceId: row.reference_id,
    metadata: row.metadata ?? {},
  };
}

export async function loadUserBillingTransactions(
  userId: string
): Promise<BillingTransactionRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("token_transactions")
    .select("id, created_at, amount, balance_after, source, reference_id, metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[billing-history] load transactions:", error.message);
    throw new Error("TRANSACTIONS_LOAD_FAILED");
  }

  return (data as TokenTransactionDbRow[]).map(mapTransaction);
}

export async function getUserBillingHistory(userId: string): Promise<{
  purchases: BillingPurchaseEntry[];
  transactions: BillingTransactionRow[];
}> {
  const transactions = await loadUserBillingTransactions(userId);
  return {
    transactions,
    purchases: listTokenPurchases(transactions),
  };
}
