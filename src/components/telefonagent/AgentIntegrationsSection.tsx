"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Plug } from "lucide-react";
import { toast } from "sonner";

import { landingBtnPrimary } from "@/components/landing/landing-buttons";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_CALENDAR_AGENT_PERMISSIONS,
  type CalendarAgentPermissions,
} from "@/lib/integrations/calendar-agent-permissions";
import type { StoredAgent } from "@/lib/onboarding-types";
import type { CalendarProvider } from "@/lib/store";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<CalendarProvider, string> = {
  apple: "Apple Kalender",
  google: "Google Kalender",
  microsoft: "Microsoft Outlook",
};

interface ConnectedCalendar {
  provider: CalendarProvider;
  accountLabel?: string;
}

function PermissionToggleRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
  ariaLabel,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-[#E1E4EA] bg-[#FAFAFA] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] text-[#0E121B]">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11px] text-[#99A0AE]">{description}</p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={ariaLabel}
      />
    </div>
  );
}

export function AgentIntegrationsSection({
  agent,
  onAgentsChange,
}: {
  agent: StoredAgent;
  onAgentsChange?: (agents: StoredAgent[]) => void;
}) {
  const [connectedCalendars, setConnectedCalendars] = useState<
    ConnectedCalendar[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const [calendarProvider, setCalendarProvider] = useState<
    CalendarProvider | null
  >(agent.calendarProvider ?? null);
  const [appointmentBookingEnabled, setAppointmentBookingEnabled] = useState(
    Boolean(agent.appointmentBookingEnabled)
  );
  const [permissions, setPermissions] = useState<CalendarAgentPermissions>(
    agent.calendarPermissions ?? { ...DEFAULT_CALENDAR_AGENT_PERMISSIONS }
  );

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      if (!res.ok || !data.ok) return;

      const connected = (
        data.calendars as Array<{
          provider: CalendarProvider;
          connected: boolean;
          accountLabel?: string;
        }>
      )
        .filter((calendar) => calendar.connected)
        .map((calendar) => ({
          provider: calendar.provider,
          accountLabel: calendar.accountLabel,
        }));

      setConnectedCalendars(connected);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    setCalendarProvider(agent.calendarProvider ?? null);
    setAppointmentBookingEnabled(Boolean(agent.appointmentBookingEnabled));
    setPermissions(
      agent.calendarPermissions ?? { ...DEFAULT_CALENDAR_AGENT_PERMISSIONS }
    );
  }, [agent.id, agent.calendarProvider, agent.appointmentBookingEnabled, agent.calendarPermissions]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  async function persist(patch: {
    calendarProvider?: CalendarProvider | null;
    appointmentBookingEnabled?: boolean;
    calendarPermissions?: Partial<CalendarAgentPermissions>;
  }) {
    setSaving(true);
    try {
      const res = await fetch("/api/elevenlabs/agent/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          ...patch,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        toast.error("Einstellungen konnten nicht gespeichert werden.", {
          description: data.error,
        });
        return;
      }
      if (data.agents) onAgentsChange?.(data.agents as StoredAgent[]);
    } catch {
      toast.error("Netzwerkfehler beim Speichern");
    } finally {
      setSaving(false);
    }
  }

  function schedulePermissionSave(patch: Partial<CalendarAgentPermissions>) {
    const nextPermissions = { ...permissions, ...patch };
    setPermissions(nextPermissions);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ calendarPermissions: nextPermissions });
    }, 500);
  }

  async function handleProviderChange(provider: CalendarProvider) {
    setCalendarProvider(provider);
    await persist({ calendarProvider: provider });
  }

  async function handleBookingToggle(enabled: boolean) {
    let provider = calendarProvider;
    if (enabled && !provider && connectedCalendars.length > 0) {
      provider = connectedCalendars[0].provider;
      setCalendarProvider(provider);
    }

    setAppointmentBookingEnabled(enabled);
    await persist({
      appointmentBookingEnabled: enabled,
      ...(provider ? { calendarProvider: provider } : {}),
    });
    toast.success(
      enabled
        ? "Terminvereinbarung für diesen Agenten aktiviert"
        : "Terminvereinbarung für diesen Agenten deaktiviert"
    );
  }

  if (loading) {
    return (
      <div className="h-20 animate-pulse rounded border border-[#E1E4EA] bg-[#FAFAFA]" />
    );
  }

  if (connectedCalendars.length === 0) {
    return (
      <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#E1E4EA] bg-white text-[#525866]">
            <Plug className="h-4 w-4 stroke-[1.5]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-[#0E121B]">
              Noch keine Integration verbunden
            </p>
            <p className="mt-1 text-[12px] text-[#99A0AE]">
              Verbinden Sie z. B. Apple Kalender in Ihrem Konto, um Termine pro
              Agent freizuschalten.
            </p>
            <Link
              href="/integrations"
              className={cn(landingBtnPrimary, "mt-3 inline-flex px-3 py-1.5 text-[12px]")}
            >
              Zu Integrationen
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const activeProvider =
    calendarProvider &&
    connectedCalendars.some((entry) => entry.provider === calendarProvider)
      ? calendarProvider
      : connectedCalendars[0]?.provider ?? null;

  const activeCalendar = connectedCalendars.find(
    (entry) => entry.provider === activeProvider
  );

  return (
    <div className="overflow-hidden rounded border border-[#E1E4EA]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-white px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#0E121B]">
            {activeProvider
              ? PROVIDER_LABELS[activeProvider]
              : "Kalender-Integration"}
          </p>
          <p className="truncate text-[11px] text-[#99A0AE]">
            {activeCalendar?.accountLabel ??
              "Integration und Berechtigungen für diesen Agenten"}
          </p>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[#99A0AE] transition-transform duration-200",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div className="space-y-3 border-t border-[#E1E4EA] bg-white p-3">
          {connectedCalendars.length > 1 ? (
            <div className="space-y-1.5">
              <Label
                htmlFor={`agent-${agent.id}-calendar-provider`}
                className="text-[12px] text-[#525866]"
              >
                Integration
              </Label>
              <select
                id={`agent-${agent.id}-calendar-provider`}
                value={activeProvider ?? ""}
                disabled={saving}
                onChange={(event) =>
                  void handleProviderChange(
                    event.target.value as CalendarProvider
                  )
                }
                className="landing-body landing-radius-sm h-9 w-full border border-[#E1E4EA] bg-white px-3 text-[13px] text-[#0E121B] focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20"
              >
                {connectedCalendars.map((entry) => (
                  <option key={entry.provider} value={entry.provider}>
                    {PROVIDER_LABELS[entry.provider]}
                    {entry.accountLabel ? ` (${entry.accountLabel})` : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {saving ? (
            <p className="flex items-center gap-1.5 text-[11px] text-[#99A0AE]">
              <Loader2 className="h-3 w-3 animate-spin" />
              Speichert…
            </p>
          ) : null}

          <PermissionToggleRow
            label="Termine durch den Agenten eintragen"
            description="Dieser Agent darf Besichtigungen und Termine buchen."
            checked={appointmentBookingEnabled}
            disabled={saving || !activeProvider}
            onCheckedChange={(checked) => void handleBookingToggle(checked)}
            ariaLabel="Termine durch den Agenten eintragen"
          />

          <PermissionToggleRow
            label="Zugriff auf private Termine"
            description="Der Agent darf private Kalendereinträge berücksichtigen."
            checked={permissions.allowPrivateEvents}
            disabled={saving}
            onCheckedChange={(checked) =>
              schedulePermissionSave({ allowPrivateEvents: checked })
            }
            ariaLabel="Zugriff auf private Termine"
          />

          <div className="space-y-2 rounded border border-[#E1E4EA] bg-[#FAFAFA] p-3">
            <PermissionToggleRow
              label="Zugriff auf Termine einer Kategorie"
              description="Nur Termine aus einer bestimmten Kategorie verwenden."
              checked={permissions.allowCategoryEvents}
              disabled={saving}
              onCheckedChange={(checked) =>
                schedulePermissionSave({ allowCategoryEvents: checked })
              }
              ariaLabel="Zugriff auf Termine einer Kategorie"
            />
            {permissions.allowCategoryEvents ? (
              <div className="space-y-1.5 pl-0.5">
                <Label
                  htmlFor={`agent-${agent.id}-calendar-category`}
                  className="text-[12px] text-[#525866]"
                >
                  Kategoriename
                </Label>
                <Input
                  id={`agent-${agent.id}-calendar-category`}
                  placeholder="z. B. Besichtigungen"
                  value={permissions.allowedCategory}
                  disabled={saving}
                  onChange={(event) =>
                    schedulePermissionSave({
                      allowedCategory: event.target.value,
                    })
                  }
                  className="h-9 border-[#E1E4EA] bg-white text-[13px]"
                />
              </div>
            ) : null}
          </div>

          <Link
            href="/integrations"
            className="inline-flex text-[12px] text-[#335cff] underline"
          >
            Integrationen verwalten
          </Link>
        </div>
      ) : null}
    </div>
  );
}
