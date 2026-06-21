import { NextResponse, type NextRequest } from "next/server";

import { syncMessageChannel } from "@/lib/messages/channel-sync";
import type { MessageChannelType } from "@/lib/messages/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const VALID_TYPES = new Set<MessageChannelType>([
  "gmail",
  "outlook",
  "apple_mail",
  "whatsapp",
]);

export async function POST(req: NextRequest) {
  let body: { channelType?: string; channelRef?: string };
  try {
    body = (await req.json()) as { channelType?: string; channelRef?: string };
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const channelType = body.channelType as MessageChannelType | undefined;
  const channelRef = body.channelRef?.trim();

  if (!channelType || !channelRef || !VALID_TYPES.has(channelType)) {
    return NextResponse.json(
      { ok: false, error: "Kanal nicht angegeben." },
      { status: 400 }
    );
  }

  try {
    const result = await syncMessageChannel({ channelType, channelRef });
    return NextResponse.json({
      ok: true,
      imported: result.imported,
      removed: result.removed,
      providerSynced: result.providerSynced,
      inquiries: result.inquiries,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    console.error("[messages/sync]", error);
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Synchronisation fehlgeschlagen.",
      },
      { status: 500 }
    );
  }
}
