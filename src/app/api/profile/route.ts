import { NextResponse, type NextRequest } from "next/server";

import { enforceTokenState, getTokenBalanceForUser } from "@/lib/billing/tokens";
import { getProfile, updateProfile, type BillingPlan } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireUserId();
  await enforceTokenState(userId);
  const [profile, tokenBalance] = await Promise.all([
    getProfile(),
    getTokenBalanceForUser(userId),
  ]);
  return NextResponse.json({ ...profile, tokenBalance });
}

export async function POST(req: NextRequest) {
  let body: { name?: string; email?: string; plan?: BillingPlan };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const patch: Parameters<typeof updateProfile>[0] = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json(
        { error: "Der Name darf nicht leer sein." },
        { status: 400 }
      );
    }
    patch.name = name;
  }
  if (typeof body.email === "string" && body.email.trim()) {
    patch.email = body.email.trim();
  }
  if (body.plan === "free" || body.plan === "pro") {
    patch.plan = body.plan;
  }

  const profile = await updateProfile(patch);
  return NextResponse.json(profile);
}
