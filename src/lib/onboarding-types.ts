export type OnboardingPhase =
  | "nummer_anfragen"
  | "nummer_warte"
  | "weiterleitung"
  | "agent"
  | "fertig";

export interface StoredAgent {
  id: string;
  name: string;
  voiceId: string;
  voiceName?: string;
  language: string;
  greeting: string;
  systemPrompt: string;
}
