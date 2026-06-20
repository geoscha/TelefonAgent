export type CallCategory =
  | "Schadenmeldung"
  | "Mietzins"
  | "Besichtigung"
  | "Allgemein"
  | "Notfall";

export type Urgency = "niedrig" | "mittel" | "hoch";

export type CallStatus = "offen" | "erledigt" | "eskaliert";

export type SuggestionType =
  | "Kalendereintrag"
  | "Aufgabe"
  | "Rückruf"
  | "Eskalation";

export type SuggestionStatus = "pending" | "accepted" | "dismissed";

export type IntegrationStatus = "connected" | "disconnected";

export type Language =
  | "Schweizerdeutsch"
  | "Deutsch"
  | "Französisch"
  | "Italienisch"
  | "Englisch";

export interface TranscriptLine {
  speaker: "Agent" | "Anrufer";
  text: string;
  timestamp: string;
}

export interface SuggestedAction {
  id: string;
  label: string;
  type: SuggestionType;
  status: CallStatus;
}

export interface CallScreening {
  status: "pending" | "processed";
  processedAt?: string;
  appointmentAttempted?: boolean;
  appointmentBooked?: boolean;
  /** Agent verbally committed — retry until calendar write succeeds. */
  agentCommitted?: boolean;
  message?: string;
}

export interface Call {
  id: string;
  /** Short AI-generated intent, 2–4 words (e.g. "Defekter Aufzug"). */
  title: string;
  callerName?: string;
  callerPhone: string;
  property: string;
  startedAt: string;
  durationSeconds: number;
  summary: string;
  category: CallCategory;
  urgency: Urgency;
  status: CallStatus;
  transcript: TranscriptLine[];
  structuredSummary: {
    tenant?: string;
    property: string;
    concernType: string;
    urgency: Urgency;
    notes?: string;
    callScreening?: CallScreening;
    callbackRequired?: boolean;
  };
  suggestedActions: SuggestedAction[];
  recordingUrl?: string;
  /** ElevenLabs agent that handled the call. */
  agentId?: string;
  /** Post-call transcript analysis + optional calendar booking. */
  screening?: CallScreening;
  /** Caller asked for a human; agent promised a callback (no live transfer). */
  callbackRequired?: boolean;
}

export interface Suggestion {
  id: string;
  callId: string;
  type: SuggestionType;
  title: string;
  description: string;
  prefilledData?: Record<string, string>;
  status: SuggestionStatus;
  createdAt: string;
}

export interface Integration {
  id: string;
  name: string;
  description: string;
  category: "pms" | "calendar" | "crm" | "data";
  status: IntegrationStatus;
  logoInitials: string;
}

export interface AgentConfig {
  name: string;
  voiceId: string;
  language: Language;
  greeting: string;
  businessHours: {
    weekdays: string;
    saturday: string;
    sunday: string;
  };
  escalationRules: string[];
  knowledgeBase: string[];
}

export interface DashboardStats {
  callsToday: number;
  avgDurationSeconds: number;
  openSuggestions: number;
  autoResolvedPercent: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface BillingPlan {
  name: string;
  priceChf: number;
  callsIncluded: number;
  callsUsed: number;
}
