import { NextResponse, type NextRequest } from "next/server";

import { syncAgentConversationConfig } from "@/lib/elevenlabs/agent-sync";
import {
  describeElevenLabsError,
  getElevenLabsClient,
} from "@/lib/elevenlabs/client";
import {
  getAgentCalendarIntegration,
  patchStoredAgentCalendar,
  resolveConnectedCalendarProvider,
} from "@/lib/integrations/agent-calendar";
import {
  normalizeCalendarAgentPermissions,
  type CalendarAgentPermissions,
} from "@/lib/integrations/calendar-agent-permissions";
import {
  normalizeAppointmentConfig,
  type AppointmentConfig,
} from "@/lib/integrations/appointment-config";
import {
  businessHoursFromSummaryStrings,
  normalizeBusinessHours,
  type BusinessHoursSchedule,
} from "@/lib/integrations/business-hours";
import { normalizeEscalationPhone } from "@/lib/integrations/medical-guardrails";
import {
  getCalendar,
  getSettings,
  updateSettings,
  type CalendarProvider,
  type StoredAgent,
} from "@/lib/store";
import { requireUserId } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Body {
  agentId?: string;
  calendarProvider?: CalendarProvider | null;
  appointmentBookingEnabled?: boolean;
  calendarPermissions?: Partial<CalendarAgentPermissions>;
  appointmentConfig?: Partial<AppointmentConfig>;
  businessHours?: Partial<BusinessHoursSchedule> & {
    summary?: Partial<BusinessHoursSchedule["summary"]>;
  };
  escalationPhoneNumber?: string;
  medicalGuardrailsEnabled?: boolean;
}

async function syncLiveAgentPrompt(
  agent: StoredAgent,
  activeAgentId?: string
) {
  if (!activeAgentId || activeAgentId !== agent.id) return;

  const client = getElevenLabsClient();
  await syncAgentConversationConfig(client, agent);
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

  try {
    const userId = await requireUserId();
    const settings = await getSettings();
    const agents = settings.agents ?? [];
    const existing = agents.find((agent) => agent.id === agentId);
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: "Agent nicht gefunden." },
        { status: 404 }
      );
    }

    const current = getAgentCalendarIntegration(settings, agentId);
    let calendarProvider =
      body.calendarProvider !== undefined
        ? body.calendarProvider
        : current.calendarProvider;
    const appointmentBookingEnabled =
      body.appointmentBookingEnabled !== undefined
        ? body.appointmentBookingEnabled
        : current.appointmentBookingEnabled;

    if (appointmentBookingEnabled && !calendarProvider) {
      calendarProvider = await resolveConnectedCalendarProvider(
        userId,
        existing,
        settings
      );
    }
    const calendarPermissions = normalizeCalendarAgentPermissions({
      ...current.calendarPermissions,
      ...body.calendarPermissions,
    });
    const appointmentConfig = normalizeAppointmentConfig({
      ...current.appointmentConfig,
      ...body.appointmentConfig,
    });
    const businessHours =
      body.businessHours !== undefined
        ? body.businessHours.summary
          ? businessHoursFromSummaryStrings(body.businessHours.summary)
          : normalizeBusinessHours({
              ...existing.businessHours,
              ...body.businessHours,
            })
        : normalizeBusinessHours(existing.businessHours);

    if (appointmentBookingEnabled) {
      if (!calendarProvider) {
        return NextResponse.json(
          {
            ok: false,
            error: "Bitte eine verbundene Integration auswählen.",
          },
          { status: 400 }
        );
      }
      const conn = await getCalendar(calendarProvider);
      if (!conn?.connected) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Die gewählte Integration ist nicht verbunden. Bitte zuerst unter Integrationen verbinden.",
          },
          { status: 400 }
        );
      }
    }

    if (calendarProvider) {
      const conn = await getCalendar(calendarProvider);
      if (!conn?.connected) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Die gewählte Integration ist nicht verbunden. Bitte zuerst unter Integrationen verbinden.",
          },
          { status: 400 }
        );
      }
    }

    const updatedAgent: StoredAgent = {
      ...patchStoredAgentCalendar(existing, {
        calendarProvider,
        appointmentBookingEnabled,
        calendarPermissions,
        appointmentConfig,
      }),
      businessHours,
      ...(body.escalationPhoneNumber !== undefined
        ? {
            escalationPhoneNumber: normalizeEscalationPhone(
              body.escalationPhoneNumber
            ),
          }
        : {}),
      ...(typeof body.medicalGuardrailsEnabled === "boolean"
        ? { medicalGuardrailsEnabled: body.medicalGuardrailsEnabled }
        : {}),
    };

    const nextAgents = agents.map((agent) =>
      agent.id === agentId ? updatedAgent : agent
    );

    const updatedSettings = await updateSettings({ agents: nextAgents });

    try {
      await syncLiveAgentPrompt(updatedAgent, updatedSettings.agentId);
    } catch (error) {
      const { message } = describeElevenLabsError(error);
      return NextResponse.json(
        {
          ok: false,
          error: `Gespeichert, aber Agent-Aktualisierung fehlgeschlagen: ${message}`,
          integration: getAgentCalendarIntegration(
            { agents: nextAgents },
            agentId
          ),
          agents: nextAgents,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      integration: getAgentCalendarIntegration({ agents: nextAgents }, agentId),
      agents: nextAgents,
    });
  } catch (error) {
    const { status, message } = describeElevenLabsError(error);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
