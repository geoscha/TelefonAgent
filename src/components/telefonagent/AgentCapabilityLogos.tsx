"use client";

import { IntegrationLogoTile } from "@/components/integrations/IntegrationLogoTile";
import {
  CALENDAR_LOGOS,
  INTEGRATION_LOGOS,
  type IntegrationLogoAsset,
} from "@/lib/integrations/integration-logos";
import { MAIL_PROVIDER_META, type MailProviderId } from "@/lib/integrations/mail/provider-meta";
import { PROVIDER_META, type CalendarProviderId } from "@/lib/calendar/provider-meta";
import type { StoredAgent } from "@/lib/onboarding-types";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";

interface IntegrationsStatus {
  calendars?: Array<{
    provider: CalendarProviderId;
    connected: boolean;
  }>;
  mail?: Array<{
    provider: MailProviderId;
    connected: boolean;
  }>;
  whatsapp?: Array<{
    id: string;
    phoneNumberId?: string;
    whatsappNumber?: string;
    connected: boolean;
  }>;
}

function mailLogo(provider: {
  provider: MailProviderId;
  connected: boolean;
}): IntegrationLogoAsset | null {
  if (!provider.connected) return null;
  if (provider.provider === "gmail") {
    return { ...INTEGRATION_LOGOS.gmail, label: MAIL_PROVIDER_META.gmail.name };
  }
  if (provider.provider === "outlook") {
    return {
      ...INTEGRATION_LOGOS.outlook,
      label: MAIL_PROVIDER_META.outlook.name,
    };
  }
  if (provider.provider === "apple_mail") {
    return {
      ...INTEGRATION_LOGOS.appleMail,
      label: MAIL_PROVIDER_META.apple_mail.name,
    };
  }
  return null;
}

export function AgentCapabilityLogos({
  agent,
  agentPhoneNumberId,
  className,
}: {
  agent: StoredAgent;
  agentPhoneNumberId?: string;
  className?: string;
}) {
  const [status, setStatus] = useState<IntegrationsStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/integrations/status")
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.ok) {
          setStatus(data as IntegrationsStatus);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const logos = useMemo(() => {
    if (!status) return [];

    const items: IntegrationLogoAsset[] = [];

    if (agent.appointmentBookingEnabled) {
      for (const calendar of status.calendars ?? []) {
        if (!calendar.connected) continue;
        const asset = CALENDAR_LOGOS[calendar.provider];
        if (asset) {
          items.push({
            ...asset,
            label: PROVIDER_META[calendar.provider]?.name ?? "Kalender",
          });
        }
      }
    }

    for (const entry of status.mail ?? []) {
      const asset = mailLogo(entry);
      if (asset) items.push(asset);
    }

    for (const entry of status.whatsapp ?? []) {
      if (!entry.connected) continue;
      if (
        agentPhoneNumberId &&
        entry.phoneNumberId &&
        entry.phoneNumberId !== agentPhoneNumberId
      ) {
        continue;
      }
      items.push({ ...INTEGRATION_LOGOS.whatsapp, label: "WhatsApp" });
    }

    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.src)) return false;
      seen.add(item.src);
      return true;
    });
  }, [agent.appointmentBookingEnabled, agentPhoneNumberId, status]);

  if (logos.length === 0) return null;

  return (
    <div className={cn("flex shrink-0 items-center gap-2", className)}>
      {logos.map((logo) => (
        <IntegrationLogoTile
          key={logo.src}
          src={logo.src}
          width={logo.width}
          height={logo.height}
          className="h-9 w-9"
          title={logo.label}
        />
      ))}
    </div>
  );
}
