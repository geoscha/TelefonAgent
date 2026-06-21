import "server-only";

import { syncGmailInbox } from "@/lib/integrations/mail/gmail-sync";
import { analyzePendingThreads } from "@/lib/messages/inquiry-service";
import { listOpenThreadListItems } from "@/lib/messages/inquiry-store";
import {
  listMessagesForChannel,
  listThreadsForChannel,
} from "@/lib/messages/store";
import type { MessageInquiryListItem } from "@/lib/messages/inquiry-types";
import type { MessageChannelType } from "@/lib/messages/types";

export interface ChannelSyncResult {
  imported: number;
  removed: number;
  providerSynced: boolean;
  inquiries: MessageInquiryListItem[];
}

/** Pull fresh messages from the provider, analyze new relevant threads, return open list. */
export async function syncMessageChannel(input: {
  channelType: MessageChannelType;
  channelRef: string;
}): Promise<ChannelSyncResult> {
  let imported = 0;
  let removed = 0;
  let providerSynced = false;

  if (input.channelType === "gmail" && input.channelRef === "gmail") {
    const gmailResult = await syncGmailInbox();
    imported = gmailResult.imported;
    removed = gmailResult.removed;
    providerSynced = true;
  }

  const { messages, threads } = await listThreadsForChannel({
    channelType: input.channelType,
    channelRef: input.channelRef,
  });

  await analyzePendingThreads({ threads, messages });

  const inquiries = await listOpenThreadListItems({
    channelType: input.channelType,
    channelRef: input.channelRef,
    messages,
  });

  return { imported, removed, providerSynced, inquiries };
}
