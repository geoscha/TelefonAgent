import { NextResponse, type NextRequest } from "next/server";

import { buildConversationConfig } from "@/lib/elevenlabs/agent-config";
import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";
import { buildAppointmentBlock } from "@/lib/elevenlabs/prompt";
import {
  getCalendar,
  updateSettings,
  type CalendarProvider,
} from "@/lib/store";

export const dynamic = "force-dynamic";

interface Body {
  enabled?: boolean;
  provider?: CalendarProvider | null;
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

  const enabled = Boolean(body.enabled);
  const provider = body.provider ?? undefined;

  if (enabled) {
    if (!provider) {
      return NextResponse.json(
        { ok: false, error: "Bitte einen verbundenen Kalender auswählen." },
        { status: 400 }
      );
    }
    const conn = await getCalendar(provider);
    if (!conn?.connected) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Der gewählte Kalender ist nicht verbunden. Bitte zuerst unter Integrationen verbinden.",
        },
        { status: 400 }
      );
    }
  }

  const updated = await updateSettings({
    appointmentBookingEnabled: enabled,
    appointmentProvider: enabled ? provider : undefined,
  });

  // Re-push the agent prompt so the change takes effect on the live agent.
  if (updated.agentId && updated.greeting && updated.voiceId) {
    try {
      const client = getElevenLabsClient();
      const effectivePrompt =
        (updated.systemPrompt ?? "") + (enabled ? buildAppointmentBlock() : "");
      const conversationConfig = buildConversationConfig({
        greeting: updated.greeting,
        language: updated.language ?? "Deutsch",
        systemPrompt: effectivePrompt,
        voiceId: updated.voiceId,
      });
      await client.conversationalAi.agents.update(updated.agentId, {
        name: updated.agentName,
        conversationConfig,
      } as Parameters<typeof client.conversationalAi.agents.update>[1]);
    } catch (error) {
      const { message } = describeElevenLabsError(error);
      return NextResponse.json(
        {
          ok: false,
          error: `Gespeichert, aber Agent-Aktualisierung fehlgeschlagen: ${message}`,
          settings: updated,
        },
        { status: 502 }
      );
    }
  }

  return NextResponse.json({ ok: true, settings: updated });
}
