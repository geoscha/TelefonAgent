import "server-only";

import { isConfigured } from "@/lib/calendar";
import { isMailConfigured } from "@/lib/integrations/mail/config";
import { getMailConnections } from "@/lib/integrations/mail/store";
import { getSmsConnections } from "@/lib/integrations/sms/store";
import { listWhatsAppConnections } from "@/lib/integrations/whatsapp/store";
import { getWebsiteIntegration } from "@/lib/integrations/website/store";
import type {
  CraftsmanEmailDraft,
  InquiryCapabilities,
  InquiryQuickAction,
  MatchedInquiryWorkflow,
  MessageActionIntegration,
  MessageInquiry,
  MessageSuggestedAction,
} from "@/lib/messages/inquiry-types";
import type { MessageChannelType } from "@/lib/messages/types";
import type { StoredAgent } from "@/lib/onboarding-types";
import { getCalendars, getSettings } from "@/lib/store";

function actionIntegration(
  action: MessageSuggestedAction,
  capabilities: InquiryCapabilities
): MessageActionIntegration {
  switch (action.type) {
    case "book_appointment":
    case "cancel_appointment":
    case "reschedule_appointment":
      return capabilities.calendar ? "calendar" : "none";
    case "contact_craftsman":
    case "schedule_repair":
      return capabilities.craftsmanEmail ? "craftsman_gmail" : "none";
    case "info_only":
      return "none";
    default:
      return "none";
  }
}

export async function resolveInquiryCapabilities(input: {
  channelType: MessageChannelType;
  agent?: StoredAgent | null;
}): Promise<InquiryCapabilities> {
  const [mailMap, whatsappConnections, calendarsMap, websiteIntegration, settings, smsMap] =
    await Promise.all([
      getMailConnections(),
      listWhatsAppConnections(),
      getCalendars(),
      getWebsiteIntegration(),
      getSettings(),
      getSmsConnections(),
    ]);

  const gmailConnected = Boolean(mailMap.gmail?.connected && isMailConfigured("gmail"));
  const whatsappConnected = whatsappConnections.some((entry) => entry.connected);
  const calendarConnected = Object.values(calendarsMap).some(
    (entry) => entry?.connected && isConfigured(entry.provider)
  );
  const smsConnected = Object.values(smsMap).some((entry) => entry?.connected);

  const customerReplyChannel =
    input.channelType === "whatsapp"
      ? whatsappConnected
        ? "whatsapp"
        : gmailConnected
          ? "gmail"
          : input.channelType
      : gmailConnected
        ? "gmail"
        : input.channelType;

  return {
    customerReply: {
      gmail: gmailConnected,
      whatsapp: whatsappConnected,
      channel: customerReplyChannel,
      preferred:
        input.channelType === "whatsapp" && whatsappConnected
          ? "whatsapp"
          : gmailConnected
            ? "gmail"
            : input.channelType === "whatsapp" && whatsappConnected
              ? "whatsapp"
              : "none",
    },
    craftsmanEmail: gmailConnected,
    calendar:
      calendarConnected &&
      Boolean(input.agent?.appointmentBookingEnabled ?? settings.appointmentBookingEnabled),
    websiteKnowledge: Boolean(
      websiteIntegration?.connected && websiteIntegration.knowledgeText?.trim()
    ),
    sms: smsConnected,
  };
}

export function enrichSuggestedActions(
  actions: MessageSuggestedAction[],
  capabilities: InquiryCapabilities
): MessageSuggestedAction[] {
  return actions.map((action) => {
    const integration = actionIntegration(action, capabilities);
    let disabledReason: string | undefined;

    if (
      (action.type === "book_appointment" ||
        action.type === "cancel_appointment" ||
        action.type === "reschedule_appointment") &&
      !capabilities.calendar
    ) {
      disabledReason = "Kalender-Integration nicht verbunden.";
    } else if (
      (action.type === "contact_craftsman" || action.type === "schedule_repair") &&
      !capabilities.craftsmanEmail
    ) {
      disabledReason = "Gmail für Handwerker-E-Mails nicht verbunden.";
    }

    return {
      ...action,
      integration,
      disabledReason,
    };
  });
}

export function buildInquiryQuickActions(input: {
  inquiry: MessageInquiry;
  capabilities: InquiryCapabilities;
  matchedWorkflow?: MatchedInquiryWorkflow;
  craftsmanDrafts?: CraftsmanEmailDraft[];
}): InquiryQuickAction[] {
  const actions: InquiryQuickAction[] = [];
  const { inquiry, capabilities } = input;
  const craftsmanDrafts = input.craftsmanDrafts ?? inquiry.craftsmanDrafts ?? [];
  const pendingCraftsmanDrafts = craftsmanDrafts.filter(
    (draft) =>
      draft.status !== "sent" &&
      draft.recipientEmail?.trim() &&
      draft.body?.trim() &&
      draft.subject?.trim()
  );
  const hasDraftReply = Boolean(inquiry.draftReply?.trim());

  if (hasDraftReply) {
    const preferred = capabilities.customerReply.preferred;
    if (preferred === "gmail" && capabilities.customerReply.gmail) {
      actions.push({
        id: "send-customer-gmail",
        label: "Antwort per E-Mail senden",
        description: input.matchedWorkflow
          ? `Entwurf für «${input.matchedWorkflow.name}» versenden`
          : "Kundenantwort via Gmail",
        kind: "send_customer_reply",
        integration: "gmail",
        primary: true,
      });
    } else if (preferred === "whatsapp" && capabilities.customerReply.whatsapp) {
      actions.push({
        id: "send-customer-whatsapp",
        label: "Antwort per WhatsApp senden",
        description: input.matchedWorkflow
          ? `Entwurf für «${input.matchedWorkflow.name}» versenden`
          : "Kundenantwort via WhatsApp",
        kind: "send_customer_reply",
        integration: "whatsapp",
        primary: true,
      });
    } else if (capabilities.customerReply.gmail) {
      actions.push({
        id: "send-customer-gmail-fallback",
        label: "Antwort per E-Mail senden",
        description: "Gmail als Versandkanal",
        kind: "send_customer_reply",
        integration: "gmail",
        primary: true,
      });
    } else {
      actions.push({
        id: "send-customer-unavailable",
        label: "Antwort senden",
        description: "Kein Mail- oder WhatsApp-Kanal verbunden",
        kind: "send_customer_reply",
        integration: "none",
        disabled: true,
        disabledReason: "Bitte Gmail oder WhatsApp in Integrationen verbinden.",
      });
    }
  }

  for (const draft of pendingCraftsmanDrafts) {
    actions.push({
      id: `send-craftsman-${draft.id}`,
      label: `Handwerker: ${draft.recipientName}`,
      description: capabilities.craftsmanEmail
        ? `${draft.trade ? `${draft.trade} · ` : ""}${draft.recipientEmail}`
        : "Gmail nicht verbunden",
      kind: "send_craftsman_email",
      craftsmanDraftId: draft.id,
      integration: "craftsman_gmail",
      disabled: !capabilities.craftsmanEmail,
      disabledReason: capabilities.craftsmanEmail
        ? undefined
        : "Gmail für Handwerker-E-Mails nicht verbunden.",
    });
  }

  for (const action of inquiry.suggestedActions) {
    if (action.status === "done" || action.status === "skipped") continue;
    if (action.type === "info_only") continue;
    if (action.type === "contact_craftsman" && pendingCraftsmanDrafts.length > 0) {
      continue;
    }

    actions.push({
      id: `run-action-${action.id}`,
      label: action.label,
      description:
        action.integration === "calendar"
          ? "Kalender-Integration"
          : action.integration === "craftsman_gmail"
            ? "Handwerker per E-Mail"
            : action.type === "schedule_repair"
              ? "Reparatur koordinieren"
              : undefined,
      kind: "run_action",
      actionId: action.id,
      integration: action.integration ?? "none",
      disabled: Boolean(action.disabledReason),
      disabledReason: action.disabledReason,
    });
  }

  if (
    hasDraftReply ||
    pendingCraftsmanDrafts.length > 0 ||
    inquiry.suggestedActions.some((action) => action.steps?.length)
  ) {
    actions.push({
      id: "execute-all",
      label: "Alles senden & umsetzen",
      description: "Kundenantwort, Handwerker-Mails und Kalenderaktionen",
      kind: "execute_all",
      integration: "none",
      primary: actions.some((entry) => entry.primary) ? false : true,
      disabled:
        !hasDraftReply &&
        pendingCraftsmanDrafts.length === 0 &&
        !inquiry.suggestedActions.some((action) => action.steps?.length),
    });
  }

  if (capabilities.websiteKnowledge && input.matchedWorkflow?.slug === "allgemeine-auskunft") {
    actions.unshift({
      id: "kb-hint",
      label: "Wissensdatenbank aktiv",
      description: "Entwurf basiert auf Website- und FAQ-Inhalten",
      kind: "info",
      integration: "none",
      disabled: true,
    });
  }

  return actions;
}
