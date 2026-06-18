import { NextResponse } from "next/server";

import { provisionCurrentUser } from "@/lib/provision";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/telefonagent";

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await provisionCurrentUser().catch((err) =>
        console.warn("[auth/callback] provision skipped:", err)
      );
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "auth");
  return NextResponse.redirect(loginUrl);
}
