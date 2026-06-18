import "server-only";

import { createUserRequest } from "@/lib/admin/requests";
import type { RequestStatus } from "@/lib/admin/request-types";
import { createAdminClient } from "@/lib/supabase/admin";

export interface SupportMessage {
  id: string;
  message: string;
  status: RequestStatus;
  createdAt: string;
}

function rowToMessage(row: Record<string, unknown>): SupportMessage {
  const payload = (row.payload as Record<string, unknown>) ?? {};
  return {
    id: row.id as string,
    message:
      typeof payload.message === "string" ? payload.message : "",
    status: row.status as RequestStatus,
    createdAt: row.created_at as string,
  };
}

export async function listSupportMessagesForUser(
  userId: string
): Promise<SupportMessage[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("requests")
    .select("id, status, payload, created_at")
    .eq("user_id", userId)
    .eq("type", "support")
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) =>
    rowToMessage(row as Record<string, unknown>)
  );
}

export async function sendSupportMessage(
  userId: string,
  message: string
): Promise<SupportMessage> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("MESSAGE_EMPTY");

  const request = await createUserRequest(userId, "support", {
    message: trimmed,
  });

  return {
    id: request.id,
    message: trimmed,
    status: request.status,
    createdAt: request.createdAt,
  };
}

export async function loadOpenSupportByUserIds(
  userIds: string[]
): Promise<Map<string, { count: number; preview?: string; at?: string }>> {
  if (userIds.length === 0) return new Map();

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("requests")
    .select("user_id, payload, created_at, status")
    .eq("type", "support")
    .in("status", ["offen", "in_arbeit"])
    .in("user_id", userIds)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const map = new Map<string, { count: number; preview?: string; at?: string }>();
  for (const row of data ?? []) {
    const uid = row.user_id as string;
    const payload = (row.payload as Record<string, unknown>) ?? {};
    const preview =
      typeof payload.message === "string" ? payload.message : undefined;
    const at = row.created_at as string;
    const existing = map.get(uid);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(uid, { count: 1, preview, at });
    }
  }
  return map;
}
