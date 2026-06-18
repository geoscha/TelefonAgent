import { NextResponse } from "next/server";

import { mapSignupError } from "@/lib/auth/errors";
import { grantWelcomeTokensIfNeeded } from "@/lib/billing/tokens";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface SignupBody {
  name?: string;
  email?: string;
  password?: string;
}

/** Creates a confirmed user via service role — no confirmation e-mail, no auth e-mail rate limit. */
export async function POST(request: Request) {
  let body: SignupBody;
  try {
    body = (await request.json()) as SignupBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";

  if (!name) {
    return NextResponse.json(
      { ok: false, error: "Bitte geben Sie Ihren Namen ein." },
      { status: 400 }
    );
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Bitte geben Sie eine gültige E-Mail-Adresse ein." },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      {
        ok: false,
        error: "Das Passwort muss mindestens 6 Zeichen lang sein.",
      },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });

    if (error) {
      console.error("[auth/signup] createUser failed:", error.message);
      return NextResponse.json(
        { ok: false, error: mapSignupError(error.message) },
        { status: 400 }
      );
    }

    if (data.user?.id) {
      await grantWelcomeTokensIfNeeded(data.user.id).catch((err) =>
        console.error("[auth/signup] welcome tokens failed:", err)
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth/signup]", err);
    return NextResponse.json(
      { ok: false, error: "Registrierung fehlgeschlagen. Bitte erneut versuchen." },
      { status: 500 }
    );
  }
}
