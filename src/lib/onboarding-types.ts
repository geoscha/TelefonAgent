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
}
