import type { MessageChannelType } from "@/lib/messages/types";

export type MessageInquiryStatus = "open" | "resolved" | "dismissed";

export type MessageInquiryUrgency = "niedrig" | "mittel" | "hoch";

/** Coarse intent buckets used for triage badges. */
export type MessageInquiryCategory =
  | "Schadenmeldung"
  | "Terminanfrage"
  | "Terminänderung"
  | "Vertrag/Miete"
  | "Allgemein"
  | "Notfall";

export type MessageActionType =
  | "book_appointment"
  | "cancel_appointment"
  | "reschedule_appointment"
  | "contact_craftsman"
  | "schedule_repair"
  | "info_only";

export type MessageActionIntegration =
  | "gmail"
  | "whatsapp"
  | "calendar"
  | "craftsman_gmail"
  | "sms"
  | "none";

export type MessageActionStatus = "pending" | "done" | "skipped" | "failed";

export interface MessageActionStep {
  tool:
    | "book_appointment"
    | "cancel_appointment"
    | "find_appointments"
    | "check_availability"
    | "lookup_customer";
  params: Record<string, unknown>;
}

export interface MessageSuggestedAction {
  id: string;
  label: string;
  type: MessageActionType;
  status: MessageActionStatus;
  /** Tool calls to run when the user confirms (empty for info-only actions). */
  steps?: MessageActionStep[];
  resultMessage?: string;
  integration?: MessageActionIntegration;
  disabledReason?: string;
}

export interface MatchedInquiryWorkflow {
  slug: string;
  name: string;
  description?: string;
}

export interface InquiryCapabilities {
  customerReply: {
    gmail: boolean;
    whatsapp: boolean;
    channel: MessageChannelType;
    preferred: "gmail" | "whatsapp" | "none";
  };
  craftsmanEmail: boolean;
  calendar: boolean;
  websiteKnowledge: boolean;
  sms: boolean;
}

export type InquiryQuickActionKind =
  | "send_customer_reply"
  | "send_craftsman_email"
  | "run_action"
  | "execute_all"
  | "save_draft"
  | "info";

export interface InquiryQuickAction {
  id: string;
  label: string;
  description?: string;
  kind: InquiryQuickActionKind;
  actionId?: string;
  craftsmanDraftId?: string;
  integration?: MessageActionIntegration;
  primary?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export type CraftsmanDraftStatus = "pending" | "sent" | "failed" | "skipped";

/** Outbound e-mail draft to a craftsman (separate from the customer reply). */
export interface CraftsmanEmailDraft {
  id: string;
  craftsmanId?: string;
  recipientName: string;
  recipientEmail: string;
  trade?: string;
  subject: string;
  body: string;
  status?: CraftsmanDraftStatus;
}

/** Customer record matched from the mirrored database during analysis. */
export interface MatchedCustomer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  propertyLabel?: string;
  rentalInfo?: string;
  matchReason: string;
}

/** One calendar appointment linked to a matched customer (from the mirror). */
export interface DossierAppointment {
  id: string;
  title: string;
  startIso: string;
  endIso?: string;
  cancelled?: boolean;
  agentCreated?: boolean;
  when: "past" | "upcoming";
  /** Best-effort craftsman / trade derived from title/description. */
  craftsman?: string;
}

/** A prior conversation (other thread) involving the same customer. */
export interface DossierConcern {
  threadId: string;
  subject?: string;
  lastMessageAt: string;
  summary?: string;
  status?: MessageInquiryStatus;
}

/** Full per-customer context the bot assembled before drafting a reply. */
export interface CustomerDossier extends MatchedCustomer {
  appointments: DossierAppointment[];
  concerns: DossierConcern[];
}

export interface MessageInquiry {
  id: string;
  threadId: string;
  channelType: MessageChannelType;
  channelRef: string;
  agentId?: string;
  actionable: boolean;
  category?: MessageInquiryCategory;
  urgency?: MessageInquiryUrgency;
  /** Model confidence 0–1 that the analysis/draft is correct. */
  confidence?: number;
  summary?: string;
  /** What the bot knows about this customer & history (rendered to the user). */
  contextSummary?: string;
  draftReply?: string;
  /** E-Mail-Entwürfe an Handwerker (z. B. bei Schadensmeldungen). */
  craftsmanDrafts?: CraftsmanEmailDraft[];
  suggestedActions: MessageSuggestedAction[];
  matchedCustomers: MatchedCustomer[];
  /** Rich context assembled from calendar + past threads (per customer). */
  dossiers?: CustomerDossier[];
  /** Admin governance workflow matched to this inquiry. */
  matchedWorkflow?: MatchedInquiryWorkflow;
  /** Extracted workflow slots (e.g. inquiry_topic, damage_type). */
  workflowSlots?: Record<string, string>;
  status: MessageInquiryStatus;
  resolvedAt?: string;
  analyzedAt?: string;
  createdAt: string;
}

export interface MessageInquiryListItem extends MessageInquiry {
  title: string;
  subtitle?: string;
  preview: string;
  lastMessageAt: string;
  unreadCount: number;
  /** Thread still waits for an outbound reply to the customer. */
  awaitingReply: boolean;
  /** KI has prepared draft/actions for a relevant open case. */
  hasSuggestion: boolean;
}
