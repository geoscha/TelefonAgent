export interface CalendarAgentPermissions {
  allowPrivateEvents: boolean;
  allowCategoryEvents: boolean;
  allowedCategory: string;
}

export const DEFAULT_CALENDAR_AGENT_PERMISSIONS: CalendarAgentPermissions = {
  allowPrivateEvents: false,
  allowCategoryEvents: false,
  allowedCategory: "",
};

export function normalizeCalendarAgentPermissions(
  value: unknown
): CalendarAgentPermissions {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_CALENDAR_AGENT_PERMISSIONS };
  }

  const raw = value as Record<string, unknown>;
  return {
    allowPrivateEvents: Boolean(raw.allowPrivateEvents),
    allowCategoryEvents: Boolean(raw.allowCategoryEvents),
    allowedCategory:
      typeof raw.allowedCategory === "string" ? raw.allowedCategory : "",
  };
}
