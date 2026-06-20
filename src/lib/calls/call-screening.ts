import "server-only";

import {
  applyPostCallBookingResult,
  bookAppointmentFromCall,
  ensureCalendarSuggestedAction,
  type PostCallBookingResult,
} from "@/lib/integrations/post-call-booking";
import { isBindingAppointmentCommitment } from "@/lib/integrations/customer-confirmation";
import type { Call, CallScreening } from "@/lib/types";

export function isCallScreened(call: Call): boolean {
  if (!call.screening || call.screening.status === "pending") return false;
  if (call.screening.appointmentBooked) return true;
  if (call.screening.agentCommitted) return false;
  if (
    call.screening.appointmentAttempted &&
    isBindingAppointmentCommitment(call.transcript)
  ) {
    return false;
  }
  return call.screening.status === "processed";
}

export function markCallPendingScreening(call: Call): Call {
  const screening: CallScreening = {
    status: "pending",
  };
  return {
    ...call,
    screening,
    structuredSummary: {
      ...call.structuredSummary,
      callScreening: screening,
    },
  };
}

export function markCallScreened(call: Call, result: PostCallBookingResult): Call {
  const needsRetry = Boolean(result.agentCommitted && !result.booked);
  const screening: CallScreening = {
    status: needsRetry ? "pending" : "processed",
    processedAt: new Date().toISOString(),
    appointmentAttempted: result.attempted,
    appointmentBooked: result.booked,
    agentCommitted: result.agentCommitted,
    message: result.message,
  };
  return {
    ...call,
    screening,
    structuredSummary: {
      ...call.structuredSummary,
      callScreening: screening,
    },
  };
}

/** Analyzes one call transcript and books a calendar event when a meeting was agreed. */
export async function screenCall(userId: string, call: Call): Promise<Call> {
  let working = ensureCalendarSuggestedAction(call);
  const result = await bookAppointmentFromCall(userId, working);
  working = applyPostCallBookingResult(working, result);
  return markCallScreened(working, result);
}

export interface ScreenCallsSummary {
  scanned: number;
  booked: number;
  pending: number;
}

/** Screens all calls that have not been analyzed yet. */
export async function screenUnanalyzedCalls(
  userId: string,
  calls: Call[],
  save: (call: Call) => Promise<void>
): Promise<ScreenCallsSummary> {
  const unanalyzed = calls.filter((call) => !isCallScreened(call));
  let scanned = 0;
  let booked = 0;

  for (const call of unanalyzed) {

    try {
      const updated = await screenCall(userId, call);
      await save(updated);
      scanned += 1;
      if (updated.screening?.appointmentBooked) booked += 1;
    } catch (error) {
      console.error("[call-screening] failed", {
        callId: call.id,
        error: error instanceof Error ? error.message : String(error),
      });
      const agentCommitted = isBindingAppointmentCommitment(call.transcript);
      const failed: CallScreening = {
        status: agentCommitted ? "pending" : "processed",
        processedAt: new Date().toISOString(),
        appointmentAttempted: false,
        appointmentBooked: false,
        agentCommitted,
        message:
          error instanceof Error
            ? error.message
            : "Analyse fehlgeschlagen.",
      };
      await save({
        ...call,
        screening: failed,
        structuredSummary: {
          ...call.structuredSummary,
          callScreening: failed,
        },
      });
      scanned += 1;
    }
  }

  return {
    scanned,
    booked,
    pending: Math.max(0, unanalyzed.length - scanned),
  };
}

/** Screens all unanalyzed calls for one user (webhook, sync, admin). */
export async function screenAllCallsForUser(
  userId: string
): Promise<ScreenCallsSummary> {
  const { getCallsForUser, updateCallForUser } = await import("@/lib/store");
  const calls = await getCallsForUser(userId);
  return screenUnanalyzedCalls(userId, calls, (call) =>
    updateCallForUser(userId, call)
  );
}

/** Screens all unanalyzed calls for the signed-in user. */
export async function screenAllStoredCalls(): Promise<ScreenCallsSummary> {
  const { requireUserId } = await import("@/lib/supabase/server");
  const { getStoredCalls, updateStoredCall } = await import("@/lib/store");
  const userId = await requireUserId();
  const calls = await getStoredCalls();
  return screenUnanalyzedCalls(userId, calls, updateStoredCall);
}
