import { NextResponse, type NextRequest } from "next/server";

import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";
import {
  getAgentCalendarIntegration,
} from "@/lib/integrations/agent-calendar";
import { buildSystemPrompt } from "@/lib/elevenlabs/prompt";
import { normalizeEscalationPhone } from "@/lib/integrations/medical-guardrails";
import { buildLiveAgentConversationConfig } from "@/lib/elevenlabs/agent-sync";
import {
  filterAgentVoices,
  normalizeAgentLanguage,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import { linkAgentToPhone, reconcileUserPhoneAgentLink, unlinkUserPhonesFromAgent } from "@/lib/elevenlabs/sync-agent";
import { completeAgentOnboarding } from "@/lib/phone/onboarding";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
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
  phoneNumberId?: string;
  euComplianceEnabled?: boolean;
  website?: string;
  escalationPhoneNumber?: string;
  medicalGuardrailsEnabled?: boolean;
  /** Save to app settings only — used for auto-save in the detail panel. */
  persistOnly?: boolean;
  /** Clear the active agent without deleting it. */
  deactivate?: boolean;
  /** Set this agent as the active inbound handler (persists agentId + phone link). */
  activate?: boolean;
}


async function persistAgentRecord(params: {
  body: AgentBody;
  agentId: string;
  name: string;
  voiceId: string;
  language: ReturnType<typeof normalizeAgentLanguage>;
  greeting: string;
  systemPrompt: string;
  userId: string;
}) {
  const { body, agentId, name, voiceId, language, greeting, systemPrompt, userId } =
    params;
  const settings = await getSettings();
  const existingAgents = settings.agents ?? [];
  const existing = existingAgents.find((a) => a.id === agentId);

  const euComplianceEnabled =
    typeof body.euComplianceEnabled === "boolean"
      ? body.euComplianceEnabled
      : (existing?.euComplianceEnabled ?? false);

  const stored: StoredAgent = {
    id: agentId,
    name,
    voiceId,
    voiceName: body.voiceName,
    language,
    greeting,
    systemPrompt,
    phoneNumberId: body.phoneNumberId ?? existing?.phoneNumberId,
    euComplianceEnabled,
    website: body.website?.trim() || existing?.website,
    calendarProvider: existing?.calendarProvider ?? null,
    calendarPermissions: existing?.calendarPermissions,
    appointmentBookingEnabled: existing?.appointmentBookingEnabled,
    appointmentConfig: existing?.appointmentConfig,
    escalationPhoneNumber:
      body.escalationPhoneNumber !== undefined
        ? normalizeEscalationPhone(body.escalationPhoneNumber)
        : existing?.escalationPhoneNumber,
    medicalGuardrailsEnabled:
      typeof body.medicalGuardrailsEnabled === "boolean"
        ? body.medicalGuardrailsEnabled
        : existing?.medicalGuardrailsEnabled,
  };

  const phones = await listUserPhoneNumbers(userId);
  if (!stored.phoneNumberId && phones.length === 1) {
    stored.phoneNumberId = phones[0].id;
  } else if (!stored.phoneNumberId) {
    stored.phoneNumberId = existingAgents.find((a) => a.id === agentId)?.phoneNumberId;
  }

  const agents = existingAgents.some((a) => a.id === agentId)
    ? existingAgents.map((a) => (a.id === agentId ? stored : a))
    : [...existingAgents, stored];

  const isActiveAgent =
    settings.agentId === agentId || body.activate === true;

  let updated = await updateSettings({
    agents,
    lastSync: new Date().toISOString(),
    ...(isActiveAgent
      ? {
          agentId,
          agentName: name,
          voiceId,
          voiceName: body.voiceName,
          language,
          greeting,
          systemPrompt,
        }
      : {}),
  });

  if (isActiveAgent && updated.onboardingPhase === "agent") {
    updated = await completeAgentOnboarding();
  }

  if (isActiveAgent) {
    try {
      await reconcileUserPhoneAgentLink(userId);
      updated = await getSettings();
    } catch (err) {
      console.warn("[agent] phone reconcile on activate:", err);
      if (stored.phoneNumberId || updated.curaForwardingNumber) {
        await linkAgentToPhone(userId, agentId, stored.phoneNumberId);
      }
    }
  }

  return { updated, agents, agentId, stored };
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

  if (body.deactivate) {
    try {
      const userId = await requireUserId();
      const settings = await getSettings();
      await unlinkUserPhonesFromAgent(userId);
      const updated = await updateSettings({
        agentId: undefined,
        agentName: undefined,
        voiceId: undefined,
        voiceName: undefined,
        greeting: undefined,
        systemPrompt: undefined,
      });
      return NextResponse.json({
        ok: true,
        settings: updated,
        agents: settings.agents ?? [],
      });
    } catch (error) {
      const { status, message } = describeElevenLabsError(error);
      return NextResponse.json({ ok: false, error: message }, { status });
    }
  }

  const name = body.name?.trim();
  const voiceId = body.voiceId?.trim();
  const language = normalizeAgentLanguage(body.language);
  const greeting = body.greeting?.trim();
  const systemPrompt =
    body.systemPrompt?.trim() || buildSystemPrompt(name ?? "Cura Telefonagent");

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
    const userId = await requireUserId();

    if (body.activate === true) {
      const phones = await listUserPhoneNumbers(userId);
      if (phones.length === 0) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Ohne Telefonnummer kann kein Agent aktiviert werden. Richten Sie zuerst eine Nummer unter Telefonnummern ein.",
          },
          { status: 400 }
        );
      }
    }

    const settings = await getSettings();
    const targetAgentId =
      body.agentId?.trim() || (body.createNew ? undefined : settings.agentId);

    const existingAgents = settings.agents ?? [];
    const existing = targetAgentId
      ? existingAgents.find((a) => a.id === targetAgentId)
      : undefined;
    const complianceEnabled =
      typeof body.euComplianceEnabled === "boolean"
        ? body.euComplianceEnabled
        : (existing?.euComplianceEnabled ?? false);

    if (body.persistOnly) {
      if (!targetAgentId) {
        return NextResponse.json(
          { ok: false, error: "Agent nicht gefunden." },
          { status: 400 }
        );
      }

      const { updated, agents, agentId } = await persistAgentRecord({
        body,
        agentId: targetAgentId,
        name,
        voiceId,
        language,
        greeting,
        systemPrompt,
        userId,
      });

      return NextResponse.json({
        ok: true,
        agentId,
        settings: updated,
        agents,
        persistedOnly: true,
      });
    }

    const client = getElevenLabsClient();

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

    const resolvedAgentId = body.createNew ? undefined : targetAgentId;
    const draftAgent: StoredAgent = {
      ...(existing ?? {
        id: "draft",
        name,
        voiceId,
        language,
        greeting,
        systemPrompt,
      }),
      id: resolvedAgentId ?? existing?.id ?? "draft",
      name,
      voiceId,
      voiceName: body.voiceName ?? existing?.voiceName,
      language,
      greeting,
      systemPrompt,
      euComplianceEnabled: complianceEnabled,
      website: body.website?.trim() || existing?.website,
      escalationPhoneNumber:
        body.escalationPhoneNumber !== undefined
          ? normalizeEscalationPhone(body.escalationPhoneNumber)
          : existing?.escalationPhoneNumber,
      medicalGuardrailsEnabled:
        typeof body.medicalGuardrailsEnabled === "boolean"
          ? body.medicalGuardrailsEnabled
          : existing?.medicalGuardrailsEnabled,
      appointmentBookingEnabled:
        existing?.appointmentBookingEnabled ??
        getAgentCalendarIntegration(settings, resolvedAgentId ?? "").appointmentBookingEnabled,
      appointmentConfig: existing?.appointmentConfig,
      calendarProvider: existing?.calendarProvider ?? null,
      calendarPermissions: existing?.calendarPermissions,
      phoneNumberId: body.phoneNumberId ?? existing?.phoneNumberId,
    };

    if (
      body.escalationPhoneNumber?.trim() &&
      !normalizeEscalationPhone(body.escalationPhoneNumber)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Bitte eine gültige Eskalationsnummer im internationalen Format angeben (z. B. +41791234567).",
        },
        { status: 400 }
      );
    }

    const conversationConfig = buildLiveAgentConversationConfig(draftAgent);

    let agentId = body.createNew ? undefined : targetAgentId;

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

    const { updated, agents } = await persistAgentRecord({
      body,
      agentId,
      name,
      voiceId,
      language,
      greeting,
      systemPrompt,
      userId,
    });

    return NextResponse.json({ ok: true, agentId, settings: updated, agents });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
