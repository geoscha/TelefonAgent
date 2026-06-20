import { NextResponse, type NextRequest } from "next/server";

import { parseAppointmentFromTranscript } from "@/lib/calls/parse-appointment-from-transcript";
import { bookAppointmentForAgent } from "@/lib/integrations/book-appointment";
import { markCallScreened } from "@/lib/calls/call-screening";
import { applyPostCallBookingResult } from "@/lib/integrations/post-call-booking";
import {
  getSettings,
  getStoredCalls,
  updateStoredCall,
} from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";
import type { Call } from "@/lib/types";

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
      appointmentTypeId: parsed.appointmentTypeId,
      startIso: parsed.startIso,
      attendeeName: parsed.attendeeName,
      attendeePhone: call.callerPhone !== "Unbekannt" ? call.callerPhone : undefined,
      notes: [
        `Manuell aus Anruf ${call.id} erstellt.`,
        `Zweck: ${parsed.title}`,
      ].join(" "),
      bookingSource: "post-call",
    });

    if (!booking.booked) {
      return NextResponse.json(
        { ok: false, error: booking.message },
        { status: 502 }
      );
    }

    const bookingResult = {
      attempted: true as const,
      booked: true as const,
      duplicate: booking.duplicate,
      agentCommitted: true,
      message: booking.message,
    };
    const updatedCall = markCallScreened(
      applyPostCallBookingResult({ ...call, agentId }, bookingResult),
      bookingResult
    );

    await updateStoredCall(updatedCall);

    return NextResponse.json({
      ok: true,
      message: booking.message,
      duplicate: booking.duplicate,
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
