import type { AppointmentConfig } from "@/lib/integrations/appointment-config";

/** Current agent form values sent when starting a chat test session. */
export type AgentChatDraft = {
  greeting?: string;
  systemPrompt?: string;
  language?: string;
  voiceId?: string;
  euComplianceEnabled?: boolean;
  escalationPhoneNumber?: string;
  medicalGuardrailsEnabled?: boolean;
  appointmentBookingEnabled?: boolean;
  appointmentConfig?: AppointmentConfig;
};
