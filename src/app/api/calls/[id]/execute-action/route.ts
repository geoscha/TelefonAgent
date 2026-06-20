import { NextResponse, type NextRequest } from "next/server";

import { parseAppointmentFromTranscript } from "@/lib/calls/parse-appointment-from-transcript";
import { bookAppointmentForAgent } from "@/lib/integrations/book-appointment";
import {
  getSettings,
  getStoredCalls,
  updateStoredCall,
} from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";
import type { Call, SuggestedAction } from "@/lib/types";

export const dynamic = "force-dynamic";

function resolveAgentId(call: Call, settingsAgentId?: string): string | null {
  if (call.agentId?.trim()) return call.agentId.trim();
  if (settingsAgentId?.trim()) return settingsAgentId.trim();
  return null;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireUserId();
    const calls = await getStoredCalls();
    const call = calls.find((entry) => entry.id === params.id);
    if (!call) {
      return NextResponse.json(
        { ok: false, error: "Anruf nicht gefunden." },
        { status: 404 }
      );
    }

    const openCalendarAction = call.suggestedActions.find(
      (action) =>
        action.type === "Kalendereintrag" && action.status !== "erledigt"
    );
    if (!openCalendarAction) {
      return NextResponse.json(
        { ok: false, error: "Keine offene Kalenderaktion vorhanden." },
        { status: 400 }
      );
    }

    const settings = await getSettings();
    const agentId = resolveAgentId(call, settings.agentId);
    if (!agentId) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Kein Agent zugeordnet. Bitte den Anruf erneut synchronisieren oder den Agenten unter Telefonagent aktivieren.",
        },
        { status: 400 }
      );
    }

    const parsed = parseAppointmentFromTranscript({
      transcript: call.transcript,
      callerName: call.callerName,
      referenceDate: new Date(call.startedAt),
    });

    if (!parsed) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Termindetails konnten nicht aus dem Transkript gelesen werden (Name, Datum, Uhrzeit).",
        },
        { status: 400 }
      );
    }

    const booking = await bookAppointmentForAgent({
      agentId,
      title: parsed.title,
      startIso: parsed.startIso,
      attendeeName: parsed.attendeeName,
      attendeePhone: call.callerPhone !== "Unbekannt" ? call.callerPhone : undefined,
      notes: `Manuell aus Anruf ${call.id} erstellt.`,
    });

    if (!booking.booked) {
      return NextResponse.json(
        { ok: false, error: booking.message },
        { status: 502 }
      );
    }

    const nextActions: SuggestedAction[] = call.suggestedActions.map((action) =>
      action.id === openCalendarAction.id
        ? { ...action, status: "erledigt" }
        : action
    );

    const updatedCall: Call = {
      ...call,
      agentId,
      status: call.status === "offen" ? "erledigt" : call.status,
      suggestedActions: nextActions,
    };

    await updateStoredCall(updatedCall);

    return NextResponse.json({
      ok: true,
      message: booking.message,
      call: updatedCall,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Aktion konnte nicht ausgeführt werden.",
      },
      { status: 500 }
    );
  }
}
