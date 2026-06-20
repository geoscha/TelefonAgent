import "server-only";

import { parseAppointmentFromTranscript } from "@/lib/calls/parse-appointment-from-transcript";
import {
  agentConfirmedAppointment,
  extractAgentRecapText,
  hasAppointmentConversationContext,
  hasBookableAppointmentInTranscript,
  isBindingAppointmentCommitment,
  isCustomerRejection,
} from "@/lib/integrations/customer-confirmation";
import { getAgentCalendarIntegration } from "@/lib/integrations/agent-calendar";
import { bookAppointmentForAgent } from "@/lib/integrations/book-appointment";
import type { Call, SuggestedAction } from "@/lib/types";

export interface PostCallBookingResult {
  attempted: boolean;
  booked: boolean;
  duplicate?: boolean;
  agentCommitted?: boolean;
  message: string;
}

const POST_CALL_RETRY_ATTEMPTS = 3;
const POST_CALL_RETRY_DELAY_MS = 800;

function calendarActionId(callId: string): string {
  return `sa-${callId}-calendar`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function transcriptExcerpt(call: Call, maxLines = 6): string {
  return call.transcript
    .slice(-maxLines)
    .map((line) => `${line.speaker}: ${line.text}`)
    .join(" | ");
}

/** Ensures a Kalendereintrag action exists when the transcript looks like a booking. */
export function ensureCalendarSuggestedAction(call: Call): Call {
  const parsed = parseAppointmentFromTranscript({
    transcript: call.transcript,
    callerName: call.callerName,
    referenceDate: new Date(call.startedAt),
  });
  const transcriptText = call.transcript.map((line) => line.text).join(" ");
  const shouldOffer =
    Boolean(parsed) ||
    isBindingAppointmentCommitment(call.transcript) ||
    hasAppointmentConversationContext(transcriptText);

  if (!shouldOffer) return call;

  const hasCalendarAction = call.suggestedActions.some(
    (action) => action.type === "Kalendereintrag"
  );
  if (hasCalendarAction) return call;

  const action: SuggestedAction = {
    id: calendarActionId(call.id),
    label: "Termin eintragen",
    type: "Kalendereintrag",
    status: "offen",
  };

  return {
    ...call,
    suggestedActions: [...call.suggestedActions, action],
  };
}

export function applyPostCallBookingResult(
  call: Call,
  result: PostCallBookingResult
): Call {
  if (!result.attempted) {
    if (!result.message) return call;
    return {
      ...call,
      structuredSummary: {
        ...call.structuredSummary,
        notes: result.message,
      },
    };
  }

  const actionId = calendarActionId(call.id);
  const hasCalendarAction = call.suggestedActions.some(
    (action) => action.type === "Kalendereintrag"
  );
  const baseActions = hasCalendarAction
    ? call.suggestedActions
    : [
        ...call.suggestedActions,
        {
          id: actionId,
          label: "Termin eintragen",
          type: "Kalendereintrag" as const,
          status: "offen" as const,
        },
      ];

  const nextActions = baseActions.map((action) =>
    action.type === "Kalendereintrag"
      ? {
          ...action,
          status: result.booked ? ("erledigt" as const) : ("offen" as const),
          label: result.booked
            ? "Termin eingetragen"
            : "Termin eintragen",
        }
      : action
  );

  return {
    ...call,
    status: result.booked && call.status === "offen" ? "erledigt" : call.status,
    suggestedActions: nextActions,
    structuredSummary: {
      ...call.structuredSummary,
      notes: result.message,
    },
  };
}

async function writeAppointmentWithRetries(
  input: Parameters<typeof bookAppointmentForAgent>[0]
): Promise<Awaited<ReturnType<typeof bookAppointmentForAgent>>> {
  let last = await bookAppointmentForAgent(input);

  for (let attempt = 2; attempt <= POST_CALL_RETRY_ATTEMPTS; attempt += 1) {
    if (last.booked || last.duplicate) return last;
    console.warn("[post-call-booking] retry calendar write", {
      attempt,
      message: last.message,
      startIso: input.startIso,
      attendeeName: input.attendeeName,
    });
    await sleep(POST_CALL_RETRY_DELAY_MS * (attempt - 1));
    last = await bookAppointmentForAgent(input);
  }

  return last;
}

/** Books a confirmed appointment from the call transcript after hang-up. */
export async function bookAppointmentFromCall(
  userId: string,
  call: Call
): Promise<PostCallBookingResult> {
  const agentId = call.agentId?.trim();
  const agentCommitted = isBindingAppointmentCommitment(call.transcript);
  const bookable = hasBookableAppointmentInTranscript(call.transcript);

  console.info("[post-call-booking] start", {
    callId: call.id,
    agentId: agentId ?? null,
    agentCommitted,
    bookable,
    callerName: call.callerName ?? null,
    callerPhone: call.callerPhone,
    recap: extractAgentRecapText(call.transcript).slice(0, 200),
    excerpt: transcriptExcerpt(call),
  });

  if (!agentId) {
    return {
      attempted: false,
      booked: false,
      agentCommitted,
      message: "Kein Agent zugeordnet.",
    };
  }

  if (!bookable && !agentCommitted) {
    return {
      attempted: false,
      booked: false,
      agentCommitted: false,
      message: "Kein verbindlich vereinbarter Termin im Gespräch erkannt.",
    };
  }

  const { getSettingsForUser } = await import("@/lib/store");
  const settings = await getSettingsForUser(userId);
  const integration = getAgentCalendarIntegration(settings, agentId);

  if (!integration.appointmentBookingEnabled) {
    console.info("[post-call-booking] appointment flag off, attempting calendar write anyway", {
      callId: call.id,
      agentId,
    });
  }

  const parsed = parseAppointmentFromTranscript({
    transcript: call.transcript,
    callerName: call.callerName,
    referenceDate: new Date(call.startedAt),
  });

  if (!parsed) {
    const message = agentCommitted
      ? "Agent hat Termin zugesagt, aber Datum/Uhrzeit konnten nicht aus dem Transkript gelesen werden."
      : "Keine Termindetails im Transkript gefunden (Name, Datum, Uhrzeit).";
    console.warn("[post-call-booking] parse failed", {
      callId: call.id,
      agentCommitted,
      recap: extractAgentRecapText(call.transcript),
      excerpt: transcriptExcerpt(call, 10),
    });
    return {
      attempted: true,
      booked: false,
      agentCommitted,
      message,
    };
  }

  const callerText = call.transcript
    .filter((line) => line.speaker === "Anrufer")
    .map((line) => line.text)
    .join(" ");
  if (callerText && isCustomerRejection(callerText) && !agentCommitted) {
    return {
      attempted: false,
      booked: false,
      agentCommitted: false,
      message: "Anrufer hat den Termin abgelehnt.",
    };
  }

  console.info("[post-call-booking] creating calendar event", {
    callId: call.id,
    agentId,
    attendeeName: parsed.attendeeName,
    startIso: parsed.startIso,
    appointmentType: parsed.title,
    callerPhone: call.callerPhone,
    agentCommitted,
    agentConfirmed: agentConfirmedAppointment(call.transcript),
  });

  const booking = await writeAppointmentWithRetries({
    agentId,
    title: parsed.title,
    appointmentTypeId: parsed.appointmentTypeId,
    startIso: parsed.startIso,
    attendeeName: parsed.attendeeName,
    attendeePhone: call.callerPhone !== "Unbekannt" ? call.callerPhone : undefined,
    notes: [
      `Automatisch nach Anruf ${call.id} eingetragen.`,
      `Zweck: ${parsed.title}`,
      agentCommitted ? "Verbindlich vom Agenten bestätigt." : null,
    ]
      .filter(Boolean)
      .join(" "),
    bookingSource: "post-call",
  });

  if (!booking.booked) {
    console.warn("[post-call-booking] calendar write failed", {
      callId: call.id,
      agentCommitted,
      message: booking.message,
      bookingError: booking.bookingError,
      parsed,
    });
  } else {
    console.info("[post-call-booking] calendar write ok", {
      callId: call.id,
      eventId: booking.eventId,
      duplicate: booking.duplicate,
      message: booking.message,
    });
  }

  return {
    attempted: true,
    booked: booking.booked,
    duplicate: booking.duplicate,
    agentCommitted,
    message: booking.message,
  };
}
