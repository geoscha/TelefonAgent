import { NextResponse } from "next/server";

import { deleteAccount } from "@/lib/store";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Permanently deletes the signed-in account and ends the session. */
export async function POST() {
  try {
    await deleteAccount();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Konto konnte nicht gelöscht werden." },
      { status: 400 }
    );
  }
  // End the session (the user no longer exists).
  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
}
