import { NextResponse } from "next/server";

import {
  describeElevenLabsError,
  reconcileUserPhoneAgentLink,
} from "@/lib/elevenlabs/sync-agent";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Re-assigns the user's pool number to their Cura agent in ElevenLabs. */
export async function POST() {
  try {
    const userId = await requireUserId();
    const result = await reconcileUserPhoneAgentLink(userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    const msg = error instanceof Error ? error.message : message;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
