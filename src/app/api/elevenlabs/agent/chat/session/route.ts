import { NextResponse, type NextRequest } from "next/server";

import { mergeAgentChatDraft } from "@/lib/elevenlabs/chat-overrides";
import type { AgentChatDraft } from "@/lib/elevenlabs/agent-chat-types";
import { syncAgentConversationConfig } from "@/lib/elevenlabs/agent-sync";
import {
  probeAppointmentWebhook,
  resolveAppointmentWebhookBaseUrl,
} from "@/lib/integrations/appointment-webhook-probe";
import { probeAgentCalendar } from "@/lib/integrations/check-slot";
import {
  describeElevenLabsError,
  getElevenLabsClient,
  hasApiKey,
} from "@/lib/elevenlabs/client";
import { getSettings } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  agentId?: string;
  draft?: AgentChatDraft;
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json(
      { ok: false, error: "Agent nicht gefunden." },
      { status: 400 }
    );
  }

  if (!hasApiKey()) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Kein ElevenLabs API-Schlüssel hinterlegt. Bitte zuerst verbinden.",
      },
      { status: 400 }
    );
  }

  try {
    await requireUserId();
    const settings = await getSettings();
    const existing = (settings.agents ?? []).find((a) => a.id === agentId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Agent nicht gefunden." },
        { status: 404 }
      );
    }

    const merged = mergeAgentChatDraft(existing, body.draft);
    const client = getElevenLabsClient();
    const webhookBaseUrl = resolveAppointmentWebhookBaseUrl(req);

    try {
      await syncAgentConversationConfig(client, merged, {
        chatMode: true,
        siteUrl: webhookBaseUrl,
      });
    } catch (syncError) {
      console.error("[chat/session] agent sync failed:", syncError);
      if (merged.appointmentBookingEnabled) {
        const { message } = describeElevenLabsError(syncError);
        return NextResponse.json(
          {
            ok: false,
            error: `Termin-Tools konnten nicht synchronisiert werden: ${message}`,
          },
          { status: 502 }
        );
      }
    }

    if (merged.appointmentBookingEnabled) {
      const calendarProbe = await probeAgentCalendar(agentId);
      if (!calendarProbe.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: `Kalender nicht erreichbar: ${calendarProbe.message}`,
          },
          { status: 502 }
        );
      }

      const webhookProbe = await probeAppointmentWebhook(webhookBaseUrl);
      if (!webhookProbe.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: webhookProbe.message,
          },
          { status: 502 }
        );
      }
    }

    const signed = (await client.conversationalAi.conversations.getSignedUrl({
      agentId,
    })) as { signedUrl?: string };

    const signedUrl = signed.signedUrl;
    if (!signedUrl) {
      return NextResponse.json(
        { ok: false, error: "Chat-Sitzung konnte nicht gestartet werden." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      signedUrl,
      overrides: {
        conversation: { textOnly: true },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      return NextResponse.json({ ok: false, error: "Nicht angemeldet." }, { status: 401 });
    }
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
