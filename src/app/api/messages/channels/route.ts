import { NextResponse } from "next/server";

import { countOpenThreadsAwaitingReplyForChannel } from "@/lib/messages/inquiry-store";
import { listConnectedMessageChannels, listMessagesForChannel } from "@/lib/messages/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const channels = await listConnectedMessageChannels();
    const withActionableCounts = await Promise.all(
      channels.map(async (channel) => {
        const messages = await listMessagesForChannel({
          channelType: channel.type,
          channelRef: channel.ref,
        });
        return {
          ...channel,
          unreadCount: await countOpenThreadsAwaitingReplyForChannel({
            channelType: channel.type,
            channelRef: channel.ref,
            messages,
          }),
        };
      })
    );
    return NextResponse.json({ ok: true, channels: withActionableCounts });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json(
        { ok: false, error: "Nicht angemeldet." },
        { status: 401 }
      );
    }
    console.error("[messages/channels]", error);
    return NextResponse.json(
      { ok: false, error: "Kanäle konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
