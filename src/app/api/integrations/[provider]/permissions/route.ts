import { NextResponse, type NextRequest } from "next/server";

import {
  normalizeCalendarAgentPermissions,
  type CalendarAgentPermissions,
} from "@/lib/integrations/calendar-agent-permissions";
import { getCalendar, upsertCalendar, type CalendarProvider } from "@/lib/store";

export const dynamic = "force-dynamic";

const ALLOWED: CalendarProvider[] = ["apple"];

export async function POST(
  req: NextRequest,
  { params }: { params: { provider: string } }
) {
  const provider = params.provider as CalendarProvider;
  if (!ALLOWED.includes(provider)) {
    return NextResponse.json(
      { ok: false, error: "Unbekannter Anbieter." },
      { status: 400 }
    );
  }

  let body: Partial<CalendarAgentPermissions>;
  try {
    body = (await req.json()) as Partial<CalendarAgentPermissions>;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const existing = await getCalendar(provider);
  if (!existing?.connected) {
    return NextResponse.json(
      { ok: false, error: "Kalender ist nicht verbunden." },
      { status: 400 }
    );
  }

  const current = normalizeCalendarAgentPermissions(existing.agentPermissions);
  const next = normalizeCalendarAgentPermissions({
    ...current,
    ...body,
    allowedCategory:
      body.allowedCategory !== undefined
        ? body.allowedCategory
        : current.allowedCategory,
  });

  const conn = await upsertCalendar(provider, { agentPermissions: next });
  return NextResponse.json({
    ok: true,
    permissions: normalizeCalendarAgentPermissions(conn.agentPermissions),
  });
}
