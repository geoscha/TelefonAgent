import type { CalendarAgentPermissions } from "@/lib/integrations/calendar-agent-permissions";
import {
  DEFAULT_CALENDAR_AGENT_PERMISSIONS,
  normalizeCalendarAgentPermissions,
} from "@/lib/integrations/calendar-agent-permissions";
import type { StoredAgent } from "@/lib/onboarding-types";
import type { CalendarProvider, ElevenLabsSettings } from "@/lib/store";

export interface AgentCalendarIntegration {
  appointmentBookingEnabled: boolean;
  calendarProvider: CalendarProvider | null;
  calendarPermissions: CalendarAgentPermissions;
}

export function getAgentCalendarIntegration(
  settings: Pick<ElevenLabsSettings, "agents">,
  agentId: string
): AgentCalendarIntegration {
  const agent = settings.agents?.find((entry) => entry.id === agentId);
  return {
    appointmentBookingEnabled: Boolean(agent?.appointmentBookingEnabled),
    calendarProvider: agent?.calendarProvider ?? null,
    calendarPermissions: normalizeCalendarAgentPermissions(
      agent?.calendarPermissions ?? DEFAULT_CALENDAR_AGENT_PERMISSIONS
    ),
  };
}

export function patchStoredAgentCalendar(
  agent: StoredAgent,
  patch: Partial<AgentCalendarIntegration>
): StoredAgent {
  return {
    ...agent,
    ...(patch.appointmentBookingEnabled !== undefined
      ? { appointmentBookingEnabled: patch.appointmentBookingEnabled }
      : {}),
    ...(patch.calendarProvider !== undefined
      ? { calendarProvider: patch.calendarProvider }
      : {}),
    ...(patch.calendarPermissions !== undefined
      ? {
          calendarPermissions: normalizeCalendarAgentPermissions(
            patch.calendarPermissions
          ),
        }
      : {}),
  };
}
