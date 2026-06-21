"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, Loader2, Plug, Users } from "lucide-react";
import { toast } from "sonner";

import { landingBtnPrimary, landingBtnSecondary } from "@/components/landing/landing-buttons";
import { Switch } from "@/components/ui/switch";
import {
  configFromPreset,
  DEFAULT_APPOINTMENT_CONFIG,
  normalizeAppointmentConfig,
  type AppointmentConfig,
} from "@/lib/integrations/appointment-config";
import type { StoredAgent } from "@/lib/onboarding-types";
import type { CalendarProvider } from "@/lib/store";
import { cn } from "@/lib/utils";

type CapabilityId = "book_appointments" | "cancel_appointments";

type CustomerCapabilityId =
  | "customerAccessName"
  | "customerAccessPhone"
  | "customerAccessAddress";

const CALENDAR_INTEGRATION_HREF = "/integrationen";
const CUSTOMERS_HREF = "/kunden";

const CUSTOMER_CAPABILITIES: Array<{
  id: CustomerCapabilityId;
  label: string;
  description: string;
}> = [
  {
    id: "customerAccessName",
    label: "Auf Kunden-Namen zugreifen",
    description: "Anrufer per Telefonnummer erkennen und mit Namen ansprechen.",
  },
  {
    id: "customerAccessPhone",
    label: "Auf Kunden-Nummern zugreifen",
    description: "Hinterlegte Telefonnummern aus der Kundendatenbank nutzen.",
  },
  {
    id: "customerAccessAddress",
    label: "Auf Kunden-Adressen zugreifen",
    description: "Objekt- und Adressdaten des Anrufers berücksichtigen.",
  },
];

interface CapabilityDef {
  id: CapabilityId;
  label: string;
  description: string;
}

const CAPABILITIES: CapabilityDef[] = [
  {
    id: "book_appointments",
    label: "Termine vereinbaren",
    description: "Neue Termine in den Kalender eintragen.",
  },
  {
    id: "cancel_appointments",
    label: "Termine stornieren",
    description: "Bestehende Termine am bekannten Tag löschen.",
  },
];

function CapabilityToggleRow({
  label,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded border border-[#E1E4EA] bg-[#FAFAFA] px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] text-[#0E121B]">{label}</p>
        <p className="mt-0.5 text-[11px] text-[#99A0AE]">{description}</p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        aria-label={label}
      />
    </div>
  );
}

export function AgentCapabilitiesSection({
  agent,
  onAgentsChange,
}: {
  agent: StoredAgent;
  onAgentsChange?: (agents: StoredAgent[]) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasCalendar, setHasCalendar] = useState(false);
  const [customerSourceReady, setCustomerSourceReady] = useState(false);
  const [integrationPrompt, setIntegrationPrompt] = useState<CapabilityId | null>(
    null
  );
  const [customerPrompt, setCustomerPrompt] =
    useState<CustomerCapabilityId | null>(null);

  const [appointmentBookingEnabled, setAppointmentBookingEnabled] = useState(
    Boolean(agent.appointmentBookingEnabled)
  );
  const [appointmentConfig, setAppointmentConfig] = useState<AppointmentConfig>(
    normalizeAppointmentConfig(agent.appointmentConfig ?? DEFAULT_APPOINTMENT_CONFIG)
  );

  const [customerAccess, setCustomerAccess] = useState<
    Record<CustomerCapabilityId, boolean>
  >({
    customerAccessName: Boolean(agent.customerAccessName),
    customerAccessPhone: Boolean(agent.customerAccessPhone),
    customerAccessAddress: Boolean(agent.customerAccessAddress),
  });

  const bookEnabled =
    appointmentBookingEnabled && appointmentConfig.allowBooking;
  const cancelEnabled = appointmentConfig.allowCancellation;

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/integrations/status");
      const data = await res.json();
      if (!res.ok || !data.ok) return;

      const connected = (
        data.calendars as Array<{ connected: boolean }> | undefined
      )?.some((entry) => entry.connected);
      setHasCalendar(Boolean(connected));
      setCustomerSourceReady(Boolean(data.customerSource?.ready));
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
    setAppointmentBookingEnabled(Boolean(agent.appointmentBookingEnabled));
    setAppointmentConfig(
      normalizeAppointmentConfig(agent.appointmentConfig ?? DEFAULT_APPOINTMENT_CONFIG)
    );
    setCustomerAccess({
      customerAccessName: Boolean(agent.customerAccessName),
      customerAccessPhone: Boolean(agent.customerAccessPhone),
      customerAccessAddress: Boolean(agent.customerAccessAddress),
    });
  }, [
    agent.id,
    agent.appointmentBookingEnabled,
    agent.appointmentConfig,
    agent.customerAccessName,
    agent.customerAccessPhone,
    agent.customerAccessAddress,
  ]);

  async function persist(patch: {
    appointmentBookingEnabled?: boolean;
    appointmentConfig?: Partial<AppointmentConfig>;
    calendarProvider?: CalendarProvider | null;
    customerAccessName?: boolean;
    customerAccessPhone?: boolean;
    customerAccessAddress?: boolean;
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
        toast.error("Fähigkeit konnte nicht gespeichert werden.", {
          description: data.error,
        });
        return false;
      }
      if (data.agents) onAgentsChange?.(data.agents as StoredAgent[]);
      return true;
    } catch {
      toast.error("Netzwerkfehler beim Speichern");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function defaultConfigForBranch(): AppointmentConfig {
    return configFromPreset("immobilien");
  }

  async function handleBookToggle(checked: boolean) {
    if (checked && !hasCalendar) {
      setIntegrationPrompt("book_appointments");
      return;
    }

    setIntegrationPrompt(null);

    const baseConfig = normalizeAppointmentConfig({
      ...defaultConfigForBranch(),
      ...appointmentConfig,
      allowBooking: checked,
    });

    const nextBookingEnabled =
      checked || appointmentConfig.allowCancellation;

    setAppointmentBookingEnabled(nextBookingEnabled);
    setAppointmentConfig(baseConfig);

    const ok = await persist({
      appointmentBookingEnabled: nextBookingEnabled,
      appointmentConfig: baseConfig,
    });

    if (!ok) {
      setAppointmentBookingEnabled(Boolean(agent.appointmentBookingEnabled));
      setAppointmentConfig(
        normalizeAppointmentConfig(agent.appointmentConfig ?? DEFAULT_APPOINTMENT_CONFIG)
      );
    }
  }

  async function handleCancelToggle(checked: boolean) {
    if (checked && !hasCalendar) {
      setIntegrationPrompt("cancel_appointments");
      return;
    }

    setIntegrationPrompt(null);

    const nextConfig = normalizeAppointmentConfig({
      ...appointmentConfig,
      allowCancellation: checked,
    });
    const nextBookingEnabled =
      checked || appointmentConfig.allowBooking;

    setAppointmentConfig(nextConfig);
    setAppointmentBookingEnabled(nextBookingEnabled);

    const ok = await persist({
      appointmentBookingEnabled: nextBookingEnabled,
      appointmentConfig: nextConfig,
    });

    if (!ok) {
      setAppointmentBookingEnabled(Boolean(agent.appointmentBookingEnabled));
      setAppointmentConfig(
        normalizeAppointmentConfig(agent.appointmentConfig ?? DEFAULT_APPOINTMENT_CONFIG)
      );
    }
  }

  async function handleCustomerToggle(
    id: CustomerCapabilityId,
    checked: boolean
  ) {
    if (checked && !customerSourceReady) {
      setCustomerPrompt(id);
      return;
    }

    setCustomerPrompt(null);

    const previous = customerAccess;
    const next = { ...customerAccess, [id]: checked };
    setCustomerAccess(next);

    const ok = await persist({
      customerAccessName: next.customerAccessName,
      customerAccessPhone: next.customerAccessPhone,
      customerAccessAddress: next.customerAccessAddress,
    });

    if (!ok) setCustomerAccess(previous);
  }

  if (loading) {
    return (
      <div className="h-16 animate-pulse rounded border border-[#E1E4EA] bg-[#FAFAFA]" />
    );
  }

  const promptedCapability = integrationPrompt
    ? CAPABILITIES.find((entry) => entry.id === integrationPrompt)
    : null;
  const promptedCustomerCapability = customerPrompt
    ? CUSTOMER_CAPABILITIES.find((entry) => entry.id === customerPrompt)
    : null;

  return (
    <div className="space-y-3">
      {CAPABILITIES.map((capability) => (
        <CapabilityToggleRow
          key={capability.id}
          label={capability.label}
          description={capability.description}
          checked={
            capability.id === "book_appointments" ? bookEnabled : cancelEnabled
          }
          disabled={saving}
          onCheckedChange={(checked) =>
            void (capability.id === "book_appointments"
              ? handleBookToggle(checked)
              : handleCancelToggle(checked))
          }
        />
      ))}

      {promptedCapability ? (
        <div className="rounded border border-[#C7D7FF] bg-[#F0F4FF] p-3">
          <div className="flex items-start gap-2.5">
            <Plug className="mt-0.5 h-4 w-4 shrink-0 text-[#335cff]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[#0E121B]">
                Kalender-Integration erforderlich
              </p>
              <p className="mt-0.5 text-[12px] text-[#525866]">
                Für «{promptedCapability.label}» muss zuerst ein Kalender unter
                Integrationen verbunden werden.
              </p>
              <Link
                href={CALENDAR_INTEGRATION_HREF}
                className={cn(
                  landingBtnPrimary,
                  "mt-2 inline-flex gap-1.5 px-3 py-1.5 text-[12px]"
                )}
              >
                Kalender verbinden
                <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.75]" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}

      <div className="pt-1">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-[#99A0AE]">
          Kundendaten
        </p>
        <div className="space-y-3">
          {CUSTOMER_CAPABILITIES.map((capability) => (
            <CapabilityToggleRow
              key={capability.id}
              label={capability.label}
              description={capability.description}
              checked={customerAccess[capability.id]}
              disabled={saving}
              onCheckedChange={(checked) =>
                void handleCustomerToggle(capability.id, checked)
              }
            />
          ))}
        </div>
      </div>

      {promptedCustomerCapability ? (
        <div className="rounded border border-[#C7D7FF] bg-[#F0F4FF] p-3">
          <div className="flex items-start gap-2.5">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#335cff]" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[#0E121B]">
                Kundenliste erforderlich
              </p>
              <p className="mt-0.5 text-[12px] text-[#525866]">
                Für «{promptedCustomerCapability.label}» muss zuerst eine
                Kundendatenbank gekoppelt werden (Excel, ImmoTop2, Rimo R5 …).
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  href={CUSTOMERS_HREF}
                  className={cn(
                    landingBtnPrimary,
                    "inline-flex gap-1.5 px-3 py-1.5 text-[12px]"
                  )}
                >
                  Kundenliste koppeln
                  <ArrowUpRight className="h-3.5 w-3.5 stroke-[1.75]" />
                </Link>
                <button
                  type="button"
                  onClick={() => setCustomerPrompt(null)}
                  className={cn(
                    landingBtnSecondary,
                    "px-3 py-1.5 text-[12px]"
                  )}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {saving ? (
        <p className="flex items-center gap-1.5 text-[11px] text-[#99A0AE]">
          <Loader2 className="h-3 w-3 animate-spin" />
          Speichert…
        </p>
      ) : null}
    </div>
  );
}
