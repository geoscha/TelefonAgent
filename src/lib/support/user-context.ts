import "server-only";

import { getCalendars, getProfile, getSettings } from "@/lib/store";
import { listUserPhoneNumbers } from "@/lib/phone/numbers";
import { normalizeAppointmentConfig } from "@/lib/integrations/appointment-config";

const FORWARDING_TYPE_LABEL: Record<string, string> = {
  alle: "Alle Anrufe",
  bedingt: "Nur Überlauf",
};

const FORWARDING_STATUS_LABEL: Record<string, string> = {
  nicht_eingerichtet: "nicht eingerichtet",
  anleitung: "Anleitung offen / noch nicht bestätigt",
  aktiv: "aktiv",
};

const CALENDAR_LABEL: Record<string, string> = {
  google: "Google Kalender",
  microsoft: "Microsoft / Outlook",
  apple: "Apple / iCloud",
};

/**
 * Builds a concise German snapshot of the signed-in user's Linker
 * configuration so the support assistant can answer questions about
 * *their* setup. Uses session-scoped reads (respects RLS).
 */
export async function buildSupportUserContext(): Promise<string> {
  const [profile, settings, phones, calendars] = await Promise.all([
    getProfile().catch(() => null),
    getSettings().catch(() => null),
    listUserPhoneNumbers().catch(() => []),
    getCalendars().catch(() => ({})),
  ]);

  const lines: string[] = [];

  if (profile) {
    lines.push(
      `- Konto: ${profile.name || "(kein Name)"}${
        profile.email ? ` (${profile.email})` : ""
      }, Tarif: ${profile.plan ?? "free"}.`
    );
  }

  const connectedCalendars = Object.entries(calendars ?? {})
    .filter(([, conn]) => conn?.connected)
    .map(([provider]) => CALENDAR_LABEL[provider] ?? provider);
  lines.push(
    connectedCalendars.length > 0
      ? `- Verbundene Kalender: ${connectedCalendars.join(", ")}.`
      : "- Verbundene Kalender: keine."
  );

  const agents = settings?.agents ?? [];
  if (agents.length === 0) {
    lines.push("- Assistenten: noch keiner angelegt.");
  } else {
    lines.push(`- Assistenten (${agents.length}):`);
    for (const agent of agents) {
      const isActive = settings?.agentId === agent.id;
      const booking = agent.appointmentBookingEnabled
        ? "Termine aktiv"
        : "Termine aus";
      const cfg = normalizeAppointmentConfig(agent.appointmentConfig);
      const branch = cfg?.industryPreset
        ? `, Branche ${cfg.industryPreset}`
        : "";
      lines.push(
        `  • ${agent.name || "(unbenannt)"}${isActive ? " [aktiv]" : ""}: ${booking}, Eskalation an Zweitnummer${branch}.`
      );
    }
  }

  if (phones.length === 0) {
    lines.push("- Telefonnummern: keine.");
  } else {
    lines.push(`- Telefonnummern (${phones.length}):`);
    for (const phone of phones) {
      const type = phone.forwardingType
        ? FORWARDING_TYPE_LABEL[phone.forwardingType] ?? phone.forwardingType
        : "—";
      const status = phone.forwardingStatus
        ? FORWARDING_STATUS_LABEL[phone.forwardingStatus] ??
          phone.forwardingStatus
        : "—";
      const coupling = phone.customerNumber
        ? `gekoppelt mit ${phone.customerNumber}`
        : "keine Geschäftsnummer gekoppelt";
      lines.push(
        `  • ${phone.phoneNumber}${phone.isPrimary ? " [primär]" : ""}: Weiterleitung ${type}, Status ${status}, ${coupling}.`
      );
    }
  }

  if (settings?.onboardingPhase) {
    lines.push(`- Onboarding-Phase: ${settings.onboardingPhase}.`);
  }

  return lines.join("\n");
}
