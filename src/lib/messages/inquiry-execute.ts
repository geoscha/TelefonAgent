import "server-only";

import { sendGmailReply } from "@/lib/integrations/mail/gmail-send";
import { sendWhatsAppTextMessage } from "@/lib/integrations/whatsapp/send";
import type {
  CraftsmanEmailDraft,
  MessageInquiry,
  MessageSuggestedAction,
} from "@/lib/messages/inquiry-types";
import { saveChannelMessage } from "@/lib/messages/store";
import type { InboundMessage } from "@/lib/messages/types";
import { runTextAssistantAppointmentTool } from "@/lib/text-assistant/appointment-tool";

export interface ExecuteInquiryResult {
  inquiry: MessageInquiry;
  sent: boolean;
  sentCraftsmanEmails: number;
  executedActions: number;
  errors: string[];
}

async function sendCraftsmanEmails(
  drafts: CraftsmanEmailDraft[]
): Promise<{ drafts: CraftsmanEmailDraft[]; sent: number; errors: string[] }> {
  const errors: string[] = [];
  let sent = 0;
  const updated: CraftsmanEmailDraft[] = [];

  for (const draft of drafts) {
    const email = draft.recipientEmail?.trim();
    const body = draft.body?.trim();
    const subject = draft.subject?.trim();
    if (!email || !body || !subject) {
      updated.push({ ...draft, status: "skipped" });
      continue;
    }
    if (draft.status === "sent") {
      updated.push(draft);
      sent += 1;
      continue;
    }

    try {
      await sendGmailReply({
        to: email,
        subject,
        body,
      });
      updated.push({ ...draft, status: "sent" });
      sent += 1;
    } catch (error) {
      errors.push(
        error instanceof Error
          ? `Handwerker ${draft.recipientName}: ${error.message}`
          : `Handwerker ${draft.recipientName}: Senden fehlgeschlagen`
      );
      updated.push({
        ...draft,
        status: "failed",
      });
    }
  }

  return { drafts: updated, sent, errors };
}

async function runActionSteps(
  agentId: string,
  action: MessageSuggestedAction
): Promise<MessageSuggestedAction> {
  if (!action.steps?.length) {
    return { ...action, status: "done" };
  }

  const errors: string[] = [];
  for (const step of action.steps) {
    const result = await runTextAssistantAppointmentTool(
      agentId,
      step.tool,
      step.params
    );

    const failedBook =
      step.tool === "book_appointment" && result.booked !== true && result.ok !== true;
    const failedCancel =
      step.tool === "cancel_appointment" &&
      result.cancelled !== true &&
      result.ok !== true;
    const failedCheck =
      step.tool === "check_availability" && result.available !== true && result.ok === false;

    if (failedBook || failedCancel || failedCheck) {
      errors.push(
        typeof result.message === "string"
          ? result.message
          : `Schritt ${step.tool} fehlgeschlagen`
      );
    }
  }

  if (errors.length > 0) {
    return {
      ...action,
      status: "failed",
      resultMessage: errors.join(" · "),
    };
  }

  return { ...action, status: "done" };
}

async function sendReply(
  inquiry: Pick<MessageInquiry, "channelType" | "channelRef" | "threadId">,
  messages: InboundMessage[],
  draftReply: string
): Promise<boolean> {
  const latestInbound = [...messages]
    .reverse()
    .find((message) => message.direction === "inbound");
  if (!latestInbound) return false;

  await saveChannelMessage({
    channelType: inquiry.channelType,
    channelRef: inquiry.channelRef,
    threadId: inquiry.threadId,
    direction: "outbound",
    body: draftReply,
    preview: draftReply.slice(0, 160),
    senderLabel: "Verwaltung",
  });

  if (inquiry.channelType === "whatsapp" && latestInbound.senderAddress?.trim()) {
    await sendWhatsAppTextMessage({
      to: latestInbound.senderAddress.trim(),
      body: draftReply,
    });
    return true;
  }

  if (inquiry.channelType === "gmail" && latestInbound.senderAddress?.trim()) {
    await sendGmailReply({
      to: latestInbound.senderAddress.trim(),
      subject: latestInbound.subject
        ? latestInbound.subject.startsWith("Re:")
          ? latestInbound.subject
          : `Re: ${latestInbound.subject}`
        : "Re: Ihre Anfrage",
      body: draftReply,
      threadId: inquiry.threadId,
    });
    return true;
  }

  return false;
}

export async function sendThreadReply(input: {
  inquiry: Pick<MessageInquiry, "channelType" | "channelRef" | "threadId">;
  messages: InboundMessage[];
  draftReply: string;
}): Promise<boolean> {
  return sendReply(input.inquiry, input.messages, input.draftReply);
}


export async function executeMessageInquiry(input: {
  inquiry: MessageInquiry;
  messages: InboundMessage[];
  draftReply: string;
  craftsmanDrafts?: CraftsmanEmailDraft[];
  actionIds?: string[];
  craftsmanDraftIds?: string[];
  sendCustomerReply?: boolean;
}): Promise<ExecuteInquiryResult> {
  const { inquiry, messages, draftReply } = input;
  const craftsmanDrafts = input.craftsmanDrafts ?? inquiry.craftsmanDrafts ?? [];
  const sendCustomerReply = input.sendCustomerReply !== false;
  const actionIds = input.actionIds?.length ? new Set(input.actionIds) : null;
  const craftsmanDraftIds = input.craftsmanDraftIds?.length
    ? new Set(input.craftsmanDraftIds)
    : null;
  const agentId = inquiry.agentId?.trim();
  if (!agentId) {
    throw new Error("Kein KI-Assistent zugeordnet.");
  }

  const errors: string[] = [];
  let executedActions = 0;
  const updatedActions: MessageSuggestedAction[] = [];

  const hasContactCraftsman = inquiry.suggestedActions.some(
    (action) => action.type === "contact_craftsman"
  );
  const pendingCraftsmanDrafts = craftsmanDrafts.filter(
    (draft) =>
      draft.status !== "sent" &&
      draft.recipientEmail?.trim() &&
      draft.body?.trim() &&
      draft.subject?.trim() &&
      (!craftsmanDraftIds || craftsmanDraftIds.has(draft.id))
  );

  for (const action of inquiry.suggestedActions) {
    if (actionIds && !actionIds.has(action.id)) {
      updatedActions.push(action);
      continue;
    }
    if (action.type === "contact_craftsman") {
      updatedActions.push({ ...action, status: "pending" });
      continue;
    }
    if (action.type === "info_only" || !action.steps?.length) {
      updatedActions.push({ ...action, status: "done" });
      continue;
    }

    const result = await runActionSteps(agentId, action);
    updatedActions.push(result);
    if (result.status === "done") executedActions += 1;
    if (result.status === "failed" && result.resultMessage) {
      errors.push(result.resultMessage);
    }
  }

  let sentCraftsmanEmails = 0;
  let updatedCraftsmanDrafts = craftsmanDrafts;
  if (pendingCraftsmanDrafts.length > 0) {
    const craftsmanResult = await sendCraftsmanEmails(craftsmanDrafts);
    updatedCraftsmanDrafts = craftsmanResult.drafts;
    sentCraftsmanEmails = craftsmanResult.sent;
    errors.push(...craftsmanResult.errors);

    for (let index = 0; index < updatedActions.length; index += 1) {
      const action = updatedActions[index];
      if (action.type !== "contact_craftsman") continue;
      if (craftsmanResult.sent > 0 && craftsmanResult.errors.length === 0) {
        updatedActions[index] = { ...action, status: "done" };
        executedActions += 1;
      } else if (craftsmanResult.sent > 0) {
        updatedActions[index] = {
          ...action,
          status: "done",
          resultMessage: craftsmanResult.errors.join(" · "),
        };
        executedActions += 1;
      } else {
        updatedActions[index] = {
          ...action,
          status: "failed",
          resultMessage:
            craftsmanResult.errors[0] ?? "Handwerker-E-Mail konnte nicht gesendet werden.",
        };
      }
    }
  } else if (hasContactCraftsman) {
    for (let index = 0; index < updatedActions.length; index += 1) {
      if (updatedActions[index].type === "contact_craftsman") {
        updatedActions[index] = {
          ...updatedActions[index],
          status: "skipped",
          resultMessage: "Kein Handwerker-Entwurf mit E-Mail-Adresse vorhanden.",
        };
      }
    }
  }

  let sent = false;
  if (sendCustomerReply && draftReply.trim()) {
    try {
      sent = await sendReply(inquiry, messages, draftReply);
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Antwort konnte nicht gesendet werden."
      );
    }
  }

  const resolved: MessageInquiry = {
    ...inquiry,
    draftReply,
    craftsmanDrafts: updatedCraftsmanDrafts,
    suggestedActions: updatedActions,
    status:
      errors.length > 0 && executedActions === 0 && !sent && sentCraftsmanEmails === 0
        ? "open"
        : "resolved",
    resolvedAt: new Date().toISOString(),
  };

  return { inquiry: resolved, sent, sentCraftsmanEmails, executedActions, errors };
}
