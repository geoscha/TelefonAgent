import { NextResponse, type NextRequest } from "next/server";

import { analyzePendingThreads, reanalyzeChannelInquiries } from "@/lib/messages/inquiry-service";
import { listOpenThreadListItems } from "@/lib/messages/inquiry-store";
import {
  listMessagesForChannel,
  listThreadsForChannel,
} from "@/lib/messages/store";
import type { MessageChannelType } from "@/lib/messages/types";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<MessageChannelType>([
  "gmail",
  "outlook",
  "apple_mail",
  "whatsapp",
]);

export async function GET(req: NextRequest) {
  const channelType = req.nextUrl.searchParams.get(
    "channelType"
  ) as MessageChannelType | null;
  const channelRef = req.nextUrl.searchParams.get("channelRef")?.trim();
  const reanalyze = req.nextUrl.searchParams.get("reanalyze") === "1";

  if (!channelType || !channelRef || !VALID_TYPES.has(channelType)) {
    return NextResponse.json(
      { ok: false, error: "Kanal nicht angegeben." },
      { status: 400 }
    );
  }

  try {
    const messages = await listMessagesForChannel({ channelType, channelRef });
    const { threads } = await listThreadsForChannel({ channelType, channelRef });

    if (reanalyze) {
      await reanalyzeChannelInquiries({
        channelType,
        channelRef,
        threads,
        messages,
      });
    } else {
      void analyzePendingThreads({ threads, messages }).catch((error) => {
        console.error("[messages/inquiries] background analyze:", error);
      });
    }

    const inquiries = await listOpenThreadListItems({
      channelType,
      channelRef,
      messages,
    });

    return NextResponse.json({ ok: true, inquiries });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[messages/inquiries]", error);
    return NextResponse.json(
      { ok: false, error: "Anfragen konnten nicht geladen werden." },
      { status: 500 }
    );
  }
}
