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
import {
  configFromPreset,
  DEFAULT_APPOINTMENT_CONFIG,
  normalizeAppointmentConfig,
  type AppointmentConfig,
} from "@/lib/integrations/appointment-config";
import { inferAssistantBranch } from "@/lib/assistant-branch";
import type { StoredAgent } from "@/lib/onboarding-types";
import {
  businessHoursFromSummaryStrings,
  DEFAULT_BUSINESS_HOURS,
  normalizeBusinessHours,
  type BusinessHoursSchedule,
} from "@/lib/integrations/business-hours";
import type { CalendarProvider } from "@/lib/store";
import { cn } from "@/lib/utils";

const PROVIDER_LABELS: Record<CalendarProvider, string> = {
  google: "Google Kalender",
  microsoft: "Microsoft Outlook",
  apple: "Apple Kalender",
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
  const [appointmentConfig, setAppointmentConfig] = useState<AppointmentConfig>(
    normalizeAppointmentConfig(agent.appointmentConfig ?? DEFAULT_APPOINTMENT_CONFIG)
  );
  const [businessHours, setBusinessHours] = useState<BusinessHoursSchedule>(
    normalizeBusinessHours(agent.businessHours ?? DEFAULT_BUSINESS_HOURS)
  );

  const assistantBranch = inferAssistantBranch(agent);
  const isCoiffeur = assistantBranch === "coiffeur";

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
    setAppointmentConfig(
      normalizeAppointmentConfig(agent.appointmentConfig ?? DEFAULT_APPOINTMENT_CONFIG)
    );
    setBusinessHours(
      normalizeBusinessHours(agent.businessHours ?? DEFAULT_BUSINESS_HOURS)
    );
  }, [agent.id, agent.calendarProvider, agent.appointmentBookingEnabled, agent.calendarPermissions, agent.appointmentConfig, agent.businessHours]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function persist(patch: {
    calendarProvider?: CalendarProvider | null;
    appointmentBookingEnabled?: boolean;
    calendarPermissions?: Partial<CalendarAgentPermissions>;
    appointmentConfig?: Partial<AppointmentConfig>;
    businessHours?: { summary: BusinessHoursSchedule["summary"] };
    medicalGuardrailsEnabled?: boolean;
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

  useEffect(() => {
    if (
      !isCoiffeur ||
      connectedCalendars.length === 0 ||
      agent.appointmentBookingEnabled
    ) {
      return;
    }

    const provider = connectedCalendars[0]?.provider ?? null;
    void (async () => {
      setSaving(true);
      try {
        const res = await fetch("/api/elevenlabs/agent/integrations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: agent.id,
            appointmentBookingEnabled: true,
            appointmentConfig: configFromPreset("beauty"),
            ...(provider ? { calendarProvider: provider } : {}),
          }),
        });
        const data = await res.json();
        if (res.ok && data.ok && data.agents) {
          onAgentsChange?.(data.agents as StoredAgent[]);
        }
      } finally {
        setSaving(false);
      }
    })();
  }, [
    agent.appointmentBookingEnabled,
    agent.id,
    connectedCalendars,
    isCoiffeur,
    onAgentsChange,
  ]);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

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

  function scheduleBusinessHoursSave(
    patch: Partial<BusinessHoursSchedule["summary"]>
  ) {
    const nextSummary = { ...businessHours.summary, ...patch };
    const nextHours = businessHoursFromSummaryStrings(nextSummary);
    setBusinessHours(nextHours);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ businessHours: { summary: nextSummary } });
    }, 500);
  }

  function scheduleAppointmentConfigSave(patch: Partial<AppointmentConfig>) {
    const nextConfig = normalizeAppointmentConfig({
      ...appointmentConfig,
      ...patch,
    });
    setAppointmentConfig(nextConfig);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persist({ appointmentConfig: nextConfig });
    }, 500);
  }

  if (!isCoiffeur) {
    return (
      <div className="rounded border border-[#E1E4EA] bg-[#FAFAFA] p-4">
        <p className="text-[13px] font-medium text-[#0E121B]">
          Keine Terminbuchung
        </p>
        <p className="mt-1 text-[12px] text-[#99A0AE]">
          Für Terminvereinbarungen wählen Sie unter Inhalte die Branche
          «Coiffeur Betrieb».
        </p>
      </div>
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
              Verbinden Sie Google Kalender, Microsoft Outlook oder Apple
              Kalender unter Integrationen, um Termine pro Assistent
              freizuschalten.
            </p>
            <Link
              href="/integrationen"
              className={cn(landingBtnPrimary, "mt-3 inline-flex px-3 py-1.5 text-[12px]")}
            >
              Zu den Integrationen
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
              "Integration und Berechtigungen für diesen Assistenten"}
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

          <p className="text-[12px] text-[#525866]">
            Terminvereinbarung ist für Coiffeur Betrieb aktiv. Der Assistent kann
            Termine auf Namen buchen und — je nach Einstellung — stornieren.
          </p>

          {appointmentBookingEnabled ? (
            <div className="space-y-3 rounded border border-[#E1E4EA] bg-[#FAFAFA] p-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor={`agent-${agent.id}-allowed-callers`}
                  className="text-[12px] text-[#525866]"
                >
                  Wer darf Termine vereinbaren?
                </Label>
                <Input
                  id={`agent-${agent.id}-allowed-callers`}
                  value={appointmentConfig.allowedCallersDescription}
                  disabled={saving}
                  onChange={(event) =>
                    scheduleAppointmentConfigSave({
                      allowedCallersDescription: event.target.value,
                    })
                  }
                  className="h-9 border-[#E1E4EA] bg-white text-[13px]"
                />
              </div>

              <div className="space-y-2 rounded border border-[#E1E4EA] bg-white p-3">
                <p className="text-[12px] font-medium text-[#0E121B]">
                  Geschäftszeiten
                </p>
                <p className="text-[11px] text-[#99A0AE]">
                  Termine werden nur in diesen Zeiten eingetragen. Beim Erstellen
                  des Assistenten aus einer Website automatisch übernommen, falls
                  erkannt.
                </p>
                <div className="space-y-1.5">
                  <Label
                    htmlFor={`agent-${agent.id}-hours-weekdays`}
                    className="text-[12px] text-[#525866]"
                  >
                    Mo–Fr
                  </Label>
                  <Input
                    id={`agent-${agent.id}-hours-weekdays`}
                    value={businessHours.summary.weekdays}
                    disabled={saving}
                    placeholder="Mo–Fr 08:00–12:00, 13:00–17:00"
                    onChange={(event) =>
                      scheduleBusinessHoursSave({ weekdays: event.target.value })
                    }
                    className="h-9 border-[#E1E4EA] bg-white text-[13px]"
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`agent-${agent.id}-hours-saturday`}
                      className="text-[12px] text-[#525866]"
                    >
                      Samstag
                    </Label>
                    <Input
                      id={`agent-${agent.id}-hours-saturday`}
                      value={businessHours.summary.saturday}
                      disabled={saving}
                      placeholder="Geschlossen"
                      onChange={(event) =>
                        scheduleBusinessHoursSave({ saturday: event.target.value })
                      }
                      className="h-9 border-[#E1E4EA] bg-white text-[13px]"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor={`agent-${agent.id}-hours-sunday`}
                      className="text-[12px] text-[#525866]"
                    >
                      Sonntag
                    </Label>
                    <Input
                      id={`agent-${agent.id}-hours-sunday`}
                      value={businessHours.summary.sunday}
                      disabled={saving}
                      placeholder="Geschlossen"
                      onChange={(event) =>
                        scheduleBusinessHoursSave({ sunday: event.target.value })
                      }
                      className="h-9 border-[#E1E4EA] bg-white text-[13px]"
                    />
                  </div>
                </div>
              </div>

              <PermissionToggleRow
                label="Termine vereinbaren"
                description="Neue Termine in den Kalender eintragen."
                checked={appointmentConfig.allowBooking}
                disabled={saving}
                onCheckedChange={(checked) =>
                  scheduleAppointmentConfigSave({ allowBooking: checked })
                }
                ariaLabel="Termine vereinbaren"
              />

              <PermissionToggleRow
                label="Termine stornieren"
                description="Bestehende Termine am bekannten Tag löschen."
                checked={appointmentConfig.allowCancellation}
                disabled={saving}
                onCheckedChange={(checked) =>
                  scheduleAppointmentConfigSave({ allowCancellation: checked })
                }
                ariaLabel="Termine stornieren"
              />

              <PermissionToggleRow
                label="Name des Anrufers erforderlich"
                description="Der Assistent fragt vor Buchung oder Storno nach dem Namen."
                checked={appointmentConfig.requireCallerName}
                disabled={saving}
                onCheckedChange={(checked) =>
                  scheduleAppointmentConfigSave({ requireCallerName: checked })
                }
                ariaLabel="Name des Anrufers erforderlich"
              />

              {appointmentConfig.allowCancellation ? (
                <PermissionToggleRow
                  label="Termintag für Storno erforderlich"
                  description="Zum Stornieren muss der Anrufer den Tag des Termins kennen."
                  checked={appointmentConfig.requireAppointmentDateForCancel}
                  disabled={saving}
                  onCheckedChange={(checked) =>
                    scheduleAppointmentConfigSave({
                      requireAppointmentDateForCancel: checked,
                    })
                  }
                  ariaLabel="Termintag für Storno erforderlich"
                />
              ) : null}

              <div className="space-y-2">
                <p className="text-[12px] font-medium text-[#0E121B]">
                  Erlaubte Terminarten
                </p>
                {appointmentConfig.appointmentTypes.map((type) => (
                  <div
                    key={type.id}
                    className="flex items-center justify-between gap-3 rounded border border-[#E1E4EA] bg-white px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-[13px] text-[#0E121B]">{type.label}</p>
                      <p className="text-[11px] text-[#99A0AE]">
                        {type.durationMinutes} Minuten
                      </p>
                    </div>
                    <Switch
                      checked={type.enabled}
                      disabled={saving}
                      onCheckedChange={(checked) =>
                        scheduleAppointmentConfigSave({
                          appointmentTypes: appointmentConfig.appointmentTypes.map(
                            (entry) =>
                              entry.id === type.id
                                ? { ...entry, enabled: checked }
                                : entry
                          ),
                        })
                      }
                      aria-label={`${type.label} erlauben`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <PermissionToggleRow
            label="Zugriff auf private Termine"
            description="Der Assistent darf private Kalendereinträge berücksichtigen."
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
            href="/integrationen"
            className="inline-flex text-[12px] text-[#335cff] underline"
          >
            Kalender unter Integrationen verwalten
          </Link>
        </div>
      ) : null}
    </div>
  );
}
