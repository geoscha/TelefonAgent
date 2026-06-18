import { NextResponse, type NextRequest } from "next/server";

import { removeCalendar, type CalendarProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

const VALID: CalendarProvider[] = ["google", "microsoft", "apple"];

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as CalendarProvider;
  if (!VALID.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: "Unbekannter Anbieter." },
      { status: 400 }
    );
  }
  await removeCalendar(provider);
  return NextResponse.json({ ok: true });
}
