import { NextResponse, type NextRequest } from "next/server";

import { getCallQuotaForUser } from "@/lib/billing/quota";
import {
  getProfileForUser,
  upgradeUserToPro,
} from "@/lib/billing/upgrade";
import type { BillingInterval } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let interval: BillingInterval = "monthly";
  try {
    const body = (await req.json()) as { interval?: string };
    if (body.interval === "yearly" || body.interval === "monthly") {
      interval = body.interval;
    }
  } catch {
    /* default monthly */
  }

  try {
    const userId = await requireUserId();
    const profile = await getProfileForUser(userId);
    if (profile.plan === "pro") {
      const callQuota = await getCallQuotaForUser(userId);
      return NextResponse.json({ ok: true, ...profile, callQuota });
    }

    await upgradeUserToPro(userId, interval);
    const [updatedProfile, callQuota] = await Promise.all([
      getProfileForUser(userId),
      getCallQuotaForUser(userId),
    ]);

    return NextResponse.json({ ok: true, ...updatedProfile, callQuota });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Upgrade fehlgeschlagen." },
      { status: 400 }
    );
  }
}
