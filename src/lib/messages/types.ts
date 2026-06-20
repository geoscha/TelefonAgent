export type MessageChannelType = "gmail" | "outlook" | "apple_mail" | "whatsapp";

export type MessageDirection = "inbound" | "outbound";

export interface MessageChannel {
  id: string;
  type: MessageChannelType;
  ref: string;
  label: string;
  subtitle?: string;
  unreadCount: number;
}

export interface MessageThread {
  id: string;
  channelId: string;
  title: string;
  subtitle?: string;
  preview: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface InboundMessage {
  id: string;
  channelType: MessageChannelType;
  channelRef: string;
  threadId: string;
  direction: MessageDirection;
  senderLabel?: string;
  senderAddress?: string;
  subject?: string;
  body: string;
  preview?: string;
  receivedAt: string;
  read: boolean;
}

export function channelId(type: MessageChannelType, ref: string): string {
  return `${type}:${ref}`;
}

export function parseChannelId(id: string): {
  type: MessageChannelType;
  ref: string;
} | null {
  const [type, ...rest] = id.split(":");
  const ref = rest.join(":");
  if (
    !ref ||
    (type !== "gmail" &&
      type !== "outlook" &&
      type !== "apple_mail" &&
      type !== "whatsapp")
  ) {
    return null;
  }
  return { type: type as MessageChannelType, ref };
}

export const CHANNEL_TYPE_LABELS: Record<MessageChannelType, string> = {
  gmail: "Gmail",
  outlook: "Outlook Mail",
  apple_mail: "Apple Mail",
  whatsapp: "WhatsApp",
};
