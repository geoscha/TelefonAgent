import { NextResponse, type NextRequest } from "next/server";

import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";
import {
  buildAppointmentBlock,
  buildSystemPrompt,
} from "@/lib/elevenlabs/prompt";
import {
  buildConversationConfig,
  filterAgentVoices,
  normalizeAgentLanguage,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import { linkUserPhoneToAgent } from "@/lib/elevenlabs/sync-agent";
import { completeAgentOnboarding } from "@/lib/phone/onboarding";
import { getSettings, updateSettings, type StoredAgent } from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface AgentBody {
  name?: string;
  voiceId?: string;
  voiceName?: string;
  language?: string;
  greeting?: string;
  systemPrompt?: string;
  agentId?: string;
  createNew?: boolean;
}

/** Create the agent on first save, update it on subsequent saves. */
export async function POST(req: NextRequest) {
  let body: AgentBody;
  try {
    body = (await req.json()) as AgentBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Ungültige Anfrage." },
      { status: 400 }
    );
  }

  const name = body.name?.trim();
  const voiceId = body.voiceId?.trim();
  const language = normalizeAgentLanguage(body.language);
  const greeting = body.greeting?.trim();
  const systemPrompt = body.systemPrompt?.trim() || buildSystemPrompt(name ?? "Cura Telefonagent");

  if (!name || !voiceId || !greeting) {
    return NextResponse.json(
      {
        ok: false,
        error: "Bitte Agent-Name, Stimme und Begrüssungstext angeben.",
      },
      { status: 400 }
    );
  }

  try {
    const client = getElevenLabsClient();
    const settings = await getSettings();

    const voiceRes = (await client.voices.getAll()) as {
      voices?: RawElevenLabsVoice[];
    };
    const allowedVoices = filterAgentVoices(voiceRes.voices ?? []);
    if (!allowedVoices.some((v) => v.id === voiceId)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Diese Stimme unterstützt kein Deutsch. Bitte eine andere Stimme wählen.",
        },
        { status: 400 }
      );
    }

    const effectivePrompt = settings.appointmentBookingEnabled
      ? systemPrompt + buildAppointmentBlock()
      : systemPrompt;

    const conversationConfig = buildConversationConfig({
      greeting,
      language,
      systemPrompt: effectivePrompt,
      voiceId,
    });

    let agentId = body.createNew
      ? undefined
      : body.agentId?.trim() || settings.agentId;

    if (agentId) {
      await client.conversationalAi.agents.update(agentId, {
        name,
        conversationConfig,
      } as Parameters<typeof client.conversationalAi.agents.update>[1]);
    } else {
      const created = (await client.conversationalAi.agents.create({
        name,
        conversationConfig,
        tags: ["cura"],
      } as Parameters<typeof client.conversationalAi.agents.create>[0])) as {
        agentId: string;
      };
      agentId = created.agentId;
    }

    const stored: StoredAgent = {
      id: agentId,
      name,
      voiceId,
      voiceName: body.voiceName,
      language,
      greeting,
      systemPrompt,
    };
    const existingAgents = settings.agents ?? [];
    const without = existingAgents.filter((a) => a.id !== agentId);
    const agents = [...without, stored];

    let updated = await updateSettings({
      agentId,
      agentName: name,
      voiceId,
      voiceName: body.voiceName,
      language,
      greeting,
      systemPrompt,
      agents,
      lastSync: new Date().toISOString(),
    });

    if (updated.onboardingPhase === "agent") {
      updated = await completeAgentOnboarding();
    }

    const userId = await requireUserId();
    if (updated.curaForwardingNumber) {
      await linkUserPhoneToAgent(userId);
    }

    return NextResponse.json({ ok: true, agentId, settings: updated, agents });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
