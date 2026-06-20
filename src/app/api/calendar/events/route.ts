import { NextResponse, type NextRequest } from "next/server";

import { screenAllStoredCalls } from "@/lib/calls/call-screening";
import {
  createCalendarEvent,
  listCalendarEventsInRange,
  resolveConnectedCalendarProvider,
  type ListedCalendarEvent,
} from "@/lib/calendar";
import {
  defaultEventEndIso,
  eventDayIso,
  weekRangeIso,
  startOfWeekMonday,
} from "@/lib/calendar/week-view";
import {
  getCalendars,
  upsertCalendar,
} from "@/lib/store";

export const dynamic = "force-dynamic";

function zurichUtcOffset(month: number): string {
  return month >= 3 && month <= 10 ? "+02:00" : "+01:00";
}

function zurichRangeBounds(fromIso: string, toExclusiveIso: string): {
  startIso: string;
  endIso: string;
} {
  const startMonth = Number(fromIso.slice(5, 7));
  const endMonth = Number(toExclusiveIso.slice(5, 7));
  return {
    startIso: `${fromIso}T00:00:00${zurichUtcOffset(startMonth)}`,
    endIso: `${toExclusiveIso}T00:00:00${zurichUtcOffset(endMonth)}`,
  };
}

function isValidIso(iso: string): boolean {
  return !Number.isNaN(new Date(iso).getTime());
}

function mapEvent(event: ListedCalendarEvent) {
  const startIso = event.startIso;
  const endIso = event.endIso ?? defaultEventEndIso(startIso);
  if (!isValidIso(startIso) || !isValidIso(endIso)) return null;

  return {
    id: event.id,
    title: event.title,
    startIso,
    endIso,
    dayIso: eventDayIso(startIso),
    eventUrl: event.eventUrl,
    cancelled: Boolean(event.cancelled),
    curaManaged: Boolean(event.agentCreated),
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from")?.trim();
    const to = url.searchParams.get("to")?.trim();
    const shouldScreenCalls =
      url.searchParams.get("screenCalls") === "1" ||
      url.searchParams.get("screenCalls") === "true";

    if (shouldScreenCalls) {
      try {
        const summary = await screenAllStoredCalls();
        if (summary.scanned > 0) {
          console.info("[calendar/events] screened calls before refresh:", summary);
        }
      } catch (screenError) {
        console.warn("[calendar/events] call screening failed:", screenError);
      }
    }

    const allCalendars = await getCalendars();
    const provider = resolveConnectedCalendarProvider(allCalendars);

    if (!provider) {
      return NextResponse.json({
        ok: true,
        connected: false,
        events: [],
      });
    }

    const connection = allCalendars[provider];
    if (!connection?.connected) {
      return NextResponse.json({
        ok: true,
        connected: false,
        events: [],
      });
    }

    const range =
      from && to
        ? { from, to }
        : weekRangeIso(startOfWeekMonday(new Date()));

    const bounds = zurichRangeBounds(range.from, range.to);

    const calendarCtx = {
      connection,
      save: async (patch: Parameters<typeof upsertCalendar>[1]) => {
        await upsertCalendar(provider, patch);
      },
    };

    const events = await listCalendarEventsInRange(
      provider,
      bounds.startIso,
      bounds.endIso,
      calendarCtx
    );

    return NextResponse.json({
      ok: true,
      connected: true,
      provider,
      accountLabel: connection.accountLabel,
      range,
      events: events
        .map(mapEvent)
        .filter((event): event is NonNullable<typeof event> => event !== null)
        .filter((event) => !event.cancelled),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[calendar/events]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Kalender konnte nicht geladen werden.",
      },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      title?: string;
      startIso?: string;
      endIso?: string;
      description?: string;
    };

    const title = body.title?.trim();
    const startIso = body.startIso?.trim();
    const endIso = body.endIso?.trim();

    if (!title) {
      return NextResponse.json(
        { ok: false, error: "Titel wird benötigt." },
        { status: 400 }
      );
    }
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
    if (new Date(endIso) <= new Date(startIso)) {
      return NextResponse.json(
        { ok: false, error: "Ende muss nach dem Start liegen." },
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

    const connection = allCalendars[provider];
    if (!connection?.connected) {
      return NextResponse.json(
        { ok: false, error: "Kein Kalender verbunden." },
        { status: 400 }
      );
    }

    const calendarCtx = {
      connection,
      save: async (patch: Parameters<typeof upsertCalendar>[1]) => {
        await upsertCalendar(provider, patch);
      },
    };

    const created = await createCalendarEvent(
      provider,
      {
        title,
        startIso,
        endIso,
        description: body.description?.trim() || "In Cura Kalender erstellt.",
      },
      calendarCtx
    );

    return NextResponse.json({ ok: true, id: created.id });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[calendar/events POST]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Termin konnte nicht erstellt werden.",
      },
      { status: 502 }
    );
  }
}
