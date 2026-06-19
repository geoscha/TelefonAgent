import { NextResponse, type NextRequest } from "next/server";

import { createCalendarEvent, DEFAULT_TZ } from "@/lib/calendar";
import { getAgentCalendarIntegration } from "@/lib/integrations/agent-calendar";
import {
  getCalendarForUser,
  getSettingsForUser,
  getUserIdByAgentId,
  upsertCalendarForUser,
} from "@/lib/store";

export const dynamic = "force-dynamic";

/**
 * Public tool endpoint called by the ElevenLabs agent (server/webhook tool)
 * during a live call. Secured with a bearer token so only the agent can reach
 * it. Two actions:
 *   - "check_availability": may the agent offer to book a slot?
 *   - "book_appointment":   create the event in the connected calendar.
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.AGENT_TOOL_SECRET;
  if (!secret) return true; // not configured → allow (dev only)
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const token = bearer || new URL(req.url).searchParams.get("token") || "";
  return token === secret;
}

interface ToolBody {
  action?: "check_availability" | "book_appointment";
  /** Identifies which customer/agent is calling (ElevenLabs {{system__agent_id}}). */
  agentId?: string;
  title?: string;
  /** ISO 8601 start, ideally with Europe/Zurich offset. */
  startIso?: string;
  durationMinutes?: number;
  attendeeName?: string;
  attendeePhone?: string;
  notes?: string;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json(
      { ok: false, error: "Nicht autorisiert." },
      { status: 401 }
    );
  }

  let body: ToolBody;
  try {
    body = (await req.json()) as ToolBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "agentId fehlt." },
      { status: 400 }
    );
  }
  const userId = await getUserIdByAgentId(agentId);
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Kein Konto für diese agentId gefunden." },
      { status: 404 }
    );
  }

  const settings = await getSettingsForUser(userId);
  const integration = getAgentCalendarIntegration(settings, agentId);
  const provider = integration.calendarProvider;
  const enabled = integration.appointmentBookingEnabled;
  const connection = provider
    ? await getCalendarForUser(userId, provider)
    : undefined;
  const ready = enabled && provider && connection?.connected;

  if (body.action === "check_availability") {
    return NextResponse.json({
      ok: true,
      available: Boolean(ready),
      message: ready
        ? "Terminvereinbarung ist möglich. Frage nach Wunschdatum und Uhrzeit."
        : "Terminvereinbarung ist derzeit nicht möglich. Biete einen Rückruf an.",
    });
  }

  if (body.action === "book_appointment") {
    if (!ready || !provider) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Terminvereinbarung ist nicht aktiviert oder kein Kalender verbunden.",
      });
    }
    if (!body.title || !body.startIso) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Titel und Startzeitpunkt (startIso) werden benötigt.",
      });
    }

    const start = new Date(body.startIso);
    if (Number.isNaN(start.getTime())) {
      return NextResponse.json({
        ok: false,
        booked: false,
        message: "Ungültiger Startzeitpunkt.",
      });
    }
    const duration = Math.min(Math.max(body.durationMinutes ?? 30, 15), 240);
    const end = new Date(start.getTime() + duration * 60_000);

    const descriptionParts = [
      body.attendeeName ? `Kontakt: ${body.attendeeName}` : null,
      body.attendeePhone ? `Telefon: ${body.attendeePhone}` : null,
      body.notes ? `Notiz: ${body.notes}` : null,
      "Automatisch durch den Cura Telefonagenten erstellt.",
    ].filter(Boolean);

    try {
      const event = await createCalendarEvent(
        provider,
        {
          title: body.title,
          description: descriptionParts.join("\n"),
          startIso: start.toISOString(),
          endIso: end.toISOString(),
          timeZone: DEFAULT_TZ,
        },
        {
          connection: connection!,
          save: async (patch) => {
            await upsertCalendarForUser(userId, provider, patch);
          },
        }
      );
      return NextResponse.json({
        ok: true,
        booked: true,
        eventId: event.id,
        message: `Termin eingetragen für ${start.toLocaleString("de-CH", {
          dateStyle: "full",
          timeStyle: "short",
          timeZone: DEFAULT_TZ,
        })}.`,
      });
    } catch (error) {
      return NextResponse.json(
        {
          ok: false,
          booked: false,
          message:
            error instanceof Error
              ? error.message
              : "Termin konnte nicht eingetragen werden.",
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { ok: false, error: "Unbekannte Aktion." },
    { status: 400 }
  );
}
