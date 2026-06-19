import { type NextRequest } from "next/server";

import { requireAdminSession } from "@/lib/admin/guard";
import { streamConversationAudio } from "@/lib/elevenlabs/stream-conversation-audio";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string; callId: string } }
) {
  try {
    await requireAdminSession();
  } catch {
    return new Response("Nicht autorisiert.", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: call } = await admin
    .from("calls")
    .select("id")
    .eq("id", params.callId)
    .eq("user_id", params.id)
    .maybeSingle();

  if (!call) {
    return new Response("Anruf nicht gefunden.", { status: 404 });
  }

  return streamConversationAudio(params.callId, req.headers.get("range"));
}
