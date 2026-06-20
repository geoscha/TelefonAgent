export interface BookedAppointmentInfo {
  eventId: string;
  startIso: string;
  appointmentType?: string;
  message?: string;
}

export interface TextChatMessage {
  role: "user" | "agent";
  content: string;
}
