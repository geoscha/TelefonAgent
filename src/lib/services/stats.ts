import type { DashboardStats } from "@/lib/types";
import { mockDashboardStats } from "@/lib/mock/stats";
import { clone, simulateLatency } from "@/lib/services/latency";

export async function getDashboardStats(): Promise<DashboardStats> {
  await simulateLatency();
  // TODO(integration): aggregate from Supabase call records.
  return clone(mockDashboardStats);
}
