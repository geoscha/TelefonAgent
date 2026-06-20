import type { AppointmentConfig } from "@/lib/integrations/appointment-config";
import type { BusinessHoursSchedule } from "@/lib/integrations/business-hours";
import type { CalendarAgentPermissions } from "@/lib/integrations/calendar-agent-permissions";
import type { CalendarProvider } from "@/lib/store";

export type OnboardingPhase =
  | "nummer_anfragen"
  | "nummer_warte"
  | "weiterleitung"
  | "agent"
  | "fertig";

/** Post-signup guided demo: agent → first phone number. */
export type SetupDemoStatus = "agent" | "phone" | "skipped" | "done";

export interface StoredAgent {
  id: string;
  name: string;
  voiceId: string;
  voiceName?: string;
  language: string;
  greeting: string;
  systemPrompt: string;
  /** user_phone_numbers.id — which inbound number this agent handles. */
  phoneNumberId?: string;
  /** Append EU/DE/CH compliance instructions to the live agent prompt. */
  euComplianceEnabled?: boolean;
  /** Company website used for AI configuration. */
  website?: string;
  /** Connected calendar provider this agent may use for appointments. */
  calendarProvider?: CalendarProvider | null;
  /** Per-agent calendar access rules. */
  calendarPermissions?: CalendarAgentPermissions;
  /** Whether this agent may book appointments into the selected calendar. */
  appointmentBookingEnabled?: boolean;
  /** Branchen-Preset, Terminarten und Buchungsregeln für diesen Agenten. */
  appointmentConfig?: AppointmentConfig;
  /** E.164-Nummer für Weiterleitung an eine echte Person (z. B. Praxisteam). */
  escalationPhoneNumber?: string;
  /** Medizinische Guardrails erzwingen (keine Diagnosen, Weiterleitung bei Beschwerden). */
  medicalGuardrailsEnabled?: boolean;
  /** Öffnungszeiten für Terminbuchungen (aus Website oder manuell). */
  businessHours?: BusinessHoursSchedule;
}
