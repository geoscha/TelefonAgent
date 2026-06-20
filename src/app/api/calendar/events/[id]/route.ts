import { NextResponse, type NextRequest } from "next/server";

import {
  deleteCalendarEvent,
  rescheduleCalendarEvent,
  resolveConnectedCalendarProvider,
} from "@/lib/calendar";
import {
  getCalendars,
  upsertCalendar,
  type CalendarProvider,
} from "@/lib/store";

export const dynamic = "force-dynamic";

async function buildCalendarContext(provider: CalendarProvider) {
  const allCalendars = await getCalendars();
  const connection = allCalendars[provider];
  if (!connection?.connected) {
    throw new Error("Kein Kalender verbunden.");
  }

  return {
    provider,
    connection,
    ctx: {
      connection,
      save: async (patch: Parameters<typeof upsertCalendar>[1]) => {
        await upsertCalendar(provider, patch);
      },
    },
  };
}

function isValidIso(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = decodeURIComponent(id).trim();
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Termin-ID fehlt." },
        { status: 400 }
      );
    }

    const body = (await req.json()) as {
      eventUrl?: string;
      startIso?: string;
      endIso?: string;
    };

    const startIso = body.startIso?.trim();
    const endIso = body.endIso?.trim();
    if (!startIso || !endIso) {
      return NextResponse.json(
        { ok: false, error: "Start- und Endzeit werden benötigt." },
        { status: 400 }
      );
    }
    if (!isValidIso(startIso) || !isValidIso(endIso)) {
      return NextResponse.json(
        { ok: false, error: "Ungültige Terminzeit." },
        { status: 400 }
      );
    }

    const allCalendars = await getCalendars();
    const provider = resolveConnectedCalendarProvider(allCalendars);
    if (!provider) {
      return NextResponse.json(
        { ok: false, error: "Kein Kalender verbunden." },
        { status: 400 }
      );
    }

    const { ctx } = await buildCalendarContext(provider);
    await rescheduleCalendarEvent(
      provider,
      {
        eventId,
        eventUrl: body.eventUrl?.trim(),
        startIso,
        endIso,
      },
      ctx
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[calendar/events/:id PATCH]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Termin konnte nicht verschoben werden.",
      },
      { status: 502 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const eventId = decodeURIComponent(id).trim();
    if (!eventId) {
      return NextResponse.json(
        { ok: false, error: "Termin-ID fehlt." },
        { status: 400 }
      );
    }

    let eventUrl: string | undefined;
    try {
      const body = (await req.json()) as { eventUrl?: string };
      eventUrl = body.eventUrl?.trim();
    } catch {
      eventUrl = undefined;
    }

    const allCalendars = await getCalendars();
    const provider = resolveConnectedCalendarProvider(allCalendars);
    if (!provider) {
      return NextResponse.json(
        { ok: false, error: "Kein Kalender verbunden." },
        { status: 400 }
      );
    }

    const { ctx } = await buildCalendarContext(provider);
    await deleteCalendarEvent(provider, eventId, ctx, eventUrl);

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[calendar/events/:id DELETE]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Termin konnte nicht gelöscht werden.",
      },
      { status: 502 }
    );
  }
}
