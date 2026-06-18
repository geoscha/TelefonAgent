import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  RequestStatus,
  RequestType,
  UserRequest,
} from "@/lib/admin/request-types";

export type { RequestStatus, RequestType, UserRequest };
export {
  requestTypeLabel,
  STATUS_LABELS,
} from "@/lib/admin/request-types";

async function loadProfiles(userIds: string[]) {
  if (userIds.length === 0) return new Map<string, { name: string; email: string }>();
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, name, email")
    .in("id", userIds);
  return new Map(
    (data ?? []).map((p) => [p.id as string, { name: p.name as string, email: p.email as string }])
  );
}

function rowToRequest(
  row: Record<string, unknown>,
  profiles: Map<string, { name: string; email: string }>
): UserRequest {
  const userId = row.user_id as string;
  const profile = profiles.get(userId);
  return {
    id: row.id as string,
    userId,
    type: row.type as string,
    status: row.status as RequestStatus,
    payload: (row.payload as Record<string, unknown>) ?? {},
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    userName: profile?.name,
    userEmail: profile?.email,
  };
}

export async function listRequests(options: {
  status?: RequestStatus | "all";
  search?: string;
}): Promise<UserRequest[]> {
  const admin = createAdminClient();
  let query = admin
    .from("requests")
    .select("*")
    .order("created_at", { ascending: false });

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const profiles = await loadProfiles(rows.map((r) => r.user_id as string));
  let result = rows.map((r) =>
    rowToRequest(r as Record<string, unknown>, profiles)
  );

  const q = options.search?.trim().toLowerCase();
  if (q) {
    result = result.filter(
      (r) =>
        r.userName?.toLowerCase().includes(q) ||
        r.userEmail?.toLowerCase().includes(q)
    );
  }

  return result;
}

export async function getRequest(id: string): Promise<UserRequest | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const profiles = await loadProfiles([data.user_id as string]);
  return rowToRequest(data as Record<string, unknown>, profiles);
}

export async function updateRequestStatus(
  id: string,
  status: RequestStatus
): Promise<UserRequest> {
  return updateRequest(id, { status });
}

export async function updateRequest(
  id: string,
  patch: {
    status?: RequestStatus;
    payload?: Record<string, unknown>;
    type?: string;
  }
): Promise<UserRequest> {
  const admin = createAdminClient();
  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (patch.status) row.status = patch.status;
  if (patch.payload) row.payload = patch.payload;
  if (patch.type) row.type = patch.type;

  const { data, error } = await admin
    .from("requests")
    .update(row)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  const profiles = await loadProfiles([data.user_id as string]);
  return rowToRequest(data as Record<string, unknown>, profiles);
}

export async function createUserRequest(
  userId: string,
  type: RequestType,
  payload: Record<string, unknown> = {}
): Promise<UserRequest> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("requests")
    .insert({
      user_id: userId,
      type,
      status: "offen",
      payload,
    })
    .select("*")
    .single();
  if (error) throw error;
  const profiles = await loadProfiles([userId]);
  return rowToRequest(data as Record<string, unknown>, profiles);
}
