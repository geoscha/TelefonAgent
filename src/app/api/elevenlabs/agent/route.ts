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
import { normalizeBusinessHours, type BusinessHoursSchedule } from "@/lib/integrations/business-hours";
import { buildLiveAgentConversationConfig, syncAgentConversationConfig } from "@/lib/elevenlabs/agent-sync";
import {
  filterAgentVoices,
  normalizeAgentLanguage,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import { linkAgentToPhone, reconcileUserPhoneAgentLink, unlinkUserPhonesFromAgent } from "@/lib/elevenlabs/sync-agent";
import { completeAgentOnboarding } from "@/lib/phone/onboarding";
import { CALENDAR_PROVIDERS } from "@/lib/calendar/resolve-connected";
import {
  assistantBranchChanged,
  branchAppointmentPatch,
  inferAssistantBranch,
  normalizeAssistantBranch,
  type AssistantBranchId,
} from "@/lib/assistant-branch";
import { getCalendars, getSettings, updateSettings, type StoredAgent } from "@/lib/store";
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
  businessHours?: BusinessHoursSchedule;
  escalationPhoneNumber?: string;
  medicalGuardrailsEnabled?: boolean;
  assistantBranch?: AssistantBranchId;
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

  const assistantBranch =
    body.assistantBranch !== undefined
      ? normalizeAssistantBranch(body.assistantBranch)
      : inferAssistantBranch(existing ?? { appointmentBookingEnabled: false });

  const appointmentPatch = branchAppointmentPatch(assistantBranch);
  const branchChanged = assistantBranchChanged(body.assistantBranch, existing);

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
    assistantBranch,
    businessHours:
      body.businessHours !== undefined
        ? normalizeBusinessHours(body.businessHours)
        : existing?.businessHours,
    calendarProvider: existing?.calendarProvider ?? null,
    calendarPermissions: existing?.calendarPermissions,
    appointmentBookingEnabled: branchChanged
      ? appointmentPatch.appointmentBookingEnabled
      : existing?.appointmentBookingEnabled,
    appointmentConfig: branchChanged
      ? appointmentPatch.appointmentConfig
      : existing?.appointmentConfig,
    escalationPhoneNumber:
      body.escalationPhoneNumber !== undefined
        ? normalizeEscalationPhone(body.escalationPhoneNumber)
        : existing?.escalationPhoneNumber,
    medicalGuardrailsEnabled:
      typeof body.medicalGuardrailsEnabled === "boolean"
        ? body.medicalGuardrailsEnabled
        : existing?.medicalGuardrailsEnabled,
  };

  if (
    (assistantBranch === "coiffeur" || assistantBranch === "private_assistant") &&
    !stored.calendarProvider &&
    appointmentPatch.appointmentBookingEnabled
  ) {
    const calendars = await getCalendars();
    const connected = CALENDAR_PROVIDERS.map(
      (provider) => calendars[provider]
    ).find((entry) => entry?.connected);
    if (connected) {
      stored.calendarProvider = connected.provider;
    }
  }

  if (!stored.phoneNumberId) {
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
      if (stored.phoneNumberId || updated.linkerForwardingNumber) {
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
    body.systemPrompt?.trim() || buildSystemPrompt(name ?? "Linker Telefonagent");

  if (!name || !voiceId || !greeting) {
    return NextResponse.json(
      {
        ok: false,
        error: "Bitte Assistenten-Name, Stimme und Begrüssungstext angeben.",
      },
      { status: 400 }
    );
  }

  try {
    const userId = await requireUserId();
    const settings = await getSettings();

    if (body.activate === true) {
      const targetId = body.agentId?.trim();
      const targetAgent = (settings.agents ?? []).find((a) => a.id === targetId);
      if (!targetAgent?.phoneNumberId) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Wählen Sie unter Konfiguration eine Telefonnummer aus, bevor Sie den Assistenten aktivieren.",
          },
          { status: 400 }
        );
      }
    }

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
          { ok: false, error: "Assistent nicht gefunden." },
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
    const assistantBranch =
      body.assistantBranch !== undefined
        ? normalizeAssistantBranch(body.assistantBranch)
        : inferAssistantBranch(existing ?? { appointmentBookingEnabled: false });
    const appointmentPatch = branchAppointmentPatch(assistantBranch);
    const branchChanged = assistantBranchChanged(body.assistantBranch, existing);

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
      assistantBranch,
      escalationPhoneNumber:
        body.escalationPhoneNumber !== undefined
          ? normalizeEscalationPhone(body.escalationPhoneNumber)
          : existing?.escalationPhoneNumber,
      medicalGuardrailsEnabled:
        typeof body.medicalGuardrailsEnabled === "boolean"
          ? body.medicalGuardrailsEnabled
          : existing?.medicalGuardrailsEnabled,
      appointmentBookingEnabled: branchChanged
        ? appointmentPatch.appointmentBookingEnabled
        : existing?.appointmentBookingEnabled ??
          getAgentCalendarIntegration(settings, resolvedAgentId ?? "")
            .appointmentBookingEnabled,
      appointmentConfig: branchChanged
        ? appointmentPatch.appointmentConfig
        : existing?.appointmentConfig,
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

    let agentId = body.createNew ? undefined : targetAgentId;

    if (agentId) {
      await syncAgentConversationConfig(client, { ...draftAgent, id: agentId });
    } else {
      const created = (await client.conversationalAi.agents.create({
        name,
        conversationConfig: buildLiveAgentConversationConfig({
          ...draftAgent,
          id: "pending",
        }),
        tags: ["linker"],
      } as Parameters<typeof client.conversationalAi.agents.create>[0])) as {
        agentId: string;
      };
      agentId = created.agentId;
      await syncAgentConversationConfig(client, { ...draftAgent, id: agentId });
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
