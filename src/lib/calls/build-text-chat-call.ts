import "server-only";

import type { BookedAppointmentInfo } from "@/lib/text-assistant/types";
import type { Call, CallScreening, TranscriptLine } from "@/lib/types";

function formatOffset(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function buildCallFromTextChat(input: {
  sessionId: string;
  agentId: string;
  agentName?: string;
  startedAt: string;
  messages: Array<{ role: "user" | "agent"; content: string }>;
  bookedAppointment?: BookedAppointmentInfo;
}): Call {
  const endedAt = new Date();
  const started = new Date(input.startedAt);
  const durationSeconds = Math.max(
    0,
    Math.floor((endedAt.getTime() - started.getTime()) / 1000)
  );

  const transcript: TranscriptLine[] = input.messages
    .filter((m) => m.content.trim().length > 0)
    .map((m, index) => ({
      speaker: m.role === "user" ? "Anrufer" : "Agent",
      text: m.content.trim(),
      timestamp: formatOffset(index * 15),
    }));

  const booked = Boolean(input.bookedAppointment?.eventId);
  const screening: CallScreening = {
    status: "processed",
    processedAt: endedAt.toISOString(),
    appointmentBooked: booked,
    appointmentAttempted: Boolean(input.bookedAppointment),
    message: input.bookedAppointment?.message,
  };

  const agentLabel = input.agentName?.trim() || "Assistent";
  const title = booked
    ? `Termin: ${input.bookedAppointment?.appointmentType ?? "Termin"}`
    : `Chat · ${agentLabel}`;

  const summary =
    transcript.length > 0
      ? transcript
          .slice(-4)
          .map((line) => `${line.speaker}: ${line.text}`)
          .join(" · ")
          .slice(0, 480)
      : `Chat mit ${agentLabel}`;

  return {
    id: `chat-${input.sessionId}`,
    title,
    callerPhone: "Chat",
    property: "—",
    startedAt: input.startedAt,
    durationSeconds: durationSeconds || transcript.length * 15,
    summary,
    category: booked ? "Besichtigung" : "Allgemein",
    urgency: "niedrig",
    status: booked ? "erledigt" : "offen",
    transcript,
    structuredSummary: {
      property: "—",
      concernType: booked ? "Termin" : "Chat",
      urgency: "niedrig",
      notes: input.bookedAppointment?.message ?? summary,
    },
    suggestedActions: booked
      ? [
          {
            id: `cal-${input.sessionId}`,
            label: "Termin eingetragen",
            type: "Kalendereintrag",
            status: "erledigt",
          },
        ]
      : [],
    agentId: input.agentId,
    screening,
  };
}
