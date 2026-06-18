import "server-only";

import { isPhoneNumberRequest, type UserRequest } from "@/lib/admin/request-types";
import type { AdminPoolNumber } from "@/lib/admin/number-pool";

export interface PhoneSuggestion {
  phoneNumber: string;
  elevenLabsPhoneNumberId?: string;
}

/** Oldest pending phone requests → free pool numbers (top to bottom). */
export function suggestPhoneAssignments(
  requests: UserRequest[],
  pool: AdminPoolNumber[]
): Record<string, PhoneSuggestion> {
  const free = pool.filter((n) => n.status === "frei");

  const pending = requests
    .filter(
      (r) =>
        isPhoneNumberRequest(r.type) &&
        (r.status === "offen" || r.status === "in_arbeit") &&
        typeof r.payload.phoneNumber !== "string"
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

  const out: Record<string, PhoneSuggestion> = {};
  for (let i = 0; i < pending.length && i < free.length; i++) {
    const num = free[i];
    out[pending[i].id] = {
      phoneNumber: num.phoneNumber,
      elevenLabsPhoneNumberId: num.elevenLabsPhoneNumberId || undefined,
    };
  }
  return out;
}

/** Pending phone requests first (oldest on top), then the rest by date desc. */
export function sortRequestsForAdmin(requests: UserRequest[]): UserRequest[] {
  return [...requests].sort((a, b) => {
    const aPending =
      isPhoneNumberRequest(a.type) &&
      (a.status === "offen" || a.status === "in_arbeit");
    const bPending =
      isPhoneNumberRequest(b.type) &&
      (b.status === "offen" || b.status === "in_arbeit");

    if (aPending && bPending) {
      return (
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    }
    if (aPending !== bPending) return aPending ? -1 : 1;
    return (
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  });
}
