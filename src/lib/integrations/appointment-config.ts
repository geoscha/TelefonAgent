export type AppointmentIndustryPresetId = "hausarzt" | "immobilien";

export interface AppointmentTypeConfig {
  id: string;
  label: string;
  durationMinutes: number;
  enabled: boolean;
}

export interface AppointmentConfig {
  industryPreset: AppointmentIndustryPresetId;
  /** Wer Termine vereinbaren darf — wird dem Agenten als Kontext mitgegeben. */
  allowedCallersDescription: string;
  allowBooking: boolean;
  allowCancellation: boolean;
  requireCallerName: boolean;
  requireCallerPhone: boolean;
  /** Storno nur möglich, wenn der Anrufer den Tag des Termins kennt. */
  requireAppointmentDateForCancel: boolean;
  appointmentTypes: AppointmentTypeConfig[];
}

export interface AppointmentIndustryPreset {
  id: AppointmentIndustryPresetId;
  label: string;
  description: string;
  config: AppointmentConfig;
}

export const APPOINTMENT_INDUSTRY_PRESETS: Record<
  AppointmentIndustryPresetId,
  AppointmentIndustryPreset
> = {
  hausarzt: {
    id: "hausarzt",
    label: "Hausarztpraxis",
    description:
      "Patienten vereinbaren Sprechstunden nach Nennung des Namens und können Termine am bekannten Tag stornieren.",
    config: {
      industryPreset: "hausarzt",
      allowedCallersDescription: "Patienten der Hausarztpraxis",
      allowBooking: true,
      allowCancellation: true,
      requireCallerName: true,
      requireCallerPhone: false,
      requireAppointmentDateForCancel: true,
      appointmentTypes: [
        {
          id: "sprechstunde",
          label: "Sprechstunde",
          durationMinutes: 15,
          enabled: true,
        },
      ],
    },
  },
  immobilien: {
    id: "immobilien",
    label: "Immobilienverwaltung",
    description:
      "Mieter und Interessenten vereinbaren Besichtigungen oder Rückrufe.",
    config: {
      industryPreset: "immobilien",
      allowedCallersDescription: "Mieter, Eigentümer und Interessenten",
      allowBooking: true,
      allowCancellation: false,
      requireCallerName: true,
      requireCallerPhone: true,
      requireAppointmentDateForCancel: false,
      appointmentTypes: [
        {
          id: "besichtigung",
          label: "Besichtigung",
          durationMinutes: 30,
          enabled: true,
        },
        {
          id: "rueckruf",
          label: "Rückruf",
          durationMinutes: 15,
          enabled: true,
        },
      ],
    },
  },
};

export const DEFAULT_APPOINTMENT_CONFIG: AppointmentConfig = {
  ...APPOINTMENT_INDUSTRY_PRESETS.hausarzt.config,
};

export function getAppointmentPreset(
  id: AppointmentIndustryPresetId
): AppointmentIndustryPreset {
  return APPOINTMENT_INDUSTRY_PRESETS[id];
}

export function configFromPreset(
  presetId: AppointmentIndustryPresetId
): AppointmentConfig {
  const preset = getAppointmentPreset(presetId);
  return {
    ...preset.config,
    appointmentTypes: preset.config.appointmentTypes.map((type) => ({
      ...type,
    })),
  };
}

function normalizeAppointmentTypes(value: unknown): AppointmentTypeConfig[] {
  if (!Array.isArray(value)) return DEFAULT_APPOINTMENT_CONFIG.appointmentTypes;

  const types = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const raw = entry as Record<string, unknown>;
      const id = typeof raw.id === "string" ? raw.id.trim() : "";
      const label = typeof raw.label === "string" ? raw.label.trim() : "";
      const durationMinutes = Math.min(
        Math.max(Math.floor(Number(raw.durationMinutes) || 30), 5),
        240
      );
      if (!id || !label) return null;
      return {
        id,
        label,
        durationMinutes,
        enabled: raw.enabled !== false,
      };
    })
    .filter((entry): entry is AppointmentTypeConfig => entry !== null);

  return types.length > 0 ? types : DEFAULT_APPOINTMENT_CONFIG.appointmentTypes;
}

export function normalizeAppointmentConfig(value: unknown): AppointmentConfig {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_APPOINTMENT_CONFIG };
  }

  const raw = value as Record<string, unknown>;
  const presetId =
    raw.industryPreset === "immobilien" || raw.industryPreset === "hausarzt"
      ? raw.industryPreset
      : DEFAULT_APPOINTMENT_CONFIG.industryPreset;
  const presetDefaults = configFromPreset(presetId);

  return {
    industryPreset: presetId,
    allowedCallersDescription:
      typeof raw.allowedCallersDescription === "string" &&
      raw.allowedCallersDescription.trim()
        ? raw.allowedCallersDescription.trim()
        : presetDefaults.allowedCallersDescription,
    allowBooking: raw.allowBooking !== false,
    allowCancellation: Boolean(raw.allowCancellation),
    requireCallerName:
      raw.requireCallerName !== undefined
        ? Boolean(raw.requireCallerName)
        : presetDefaults.requireCallerName,
    requireCallerPhone: Boolean(raw.requireCallerPhone),
    requireAppointmentDateForCancel:
      raw.requireAppointmentDateForCancel !== undefined
        ? Boolean(raw.requireAppointmentDateForCancel)
        : presetDefaults.requireAppointmentDateForCancel,
    appointmentTypes: normalizeAppointmentTypes(raw.appointmentTypes),
  };
}

export function getEnabledAppointmentTypes(
  config: AppointmentConfig
): AppointmentTypeConfig[] {
  return config.appointmentTypes.filter((type) => type.enabled);
}

export function resolveAppointmentType(
  config: AppointmentConfig,
  title?: string
): AppointmentTypeConfig | undefined {
  const enabled = getEnabledAppointmentTypes(config);
  if (enabled.length === 0) return undefined;

  const normalizedTitle = title?.trim().toLowerCase() ?? "";
  if (!normalizedTitle) return enabled[0];

  return (
    enabled.find(
      (type) =>
        normalizedTitle.includes(type.label.toLowerCase()) ||
        normalizedTitle.includes(type.id.toLowerCase())
    ) ?? enabled[0]
  );
}

export function buildAppointmentPrompt(configInput?: AppointmentConfig): string {
  const config = normalizeAppointmentConfig(configInput);
  const preset = getAppointmentPreset(config.industryPreset);
  const enabledTypes = getEnabledAppointmentTypes(config);
  const typeList =
    enabledTypes.length > 0
      ? enabledTypes
          .map(
            (type) =>
              `${type.label} (${type.durationMinutes} Min.)`
          )
          .join(", ")
      : "keine Terminarten aktiviert";

  const prerequisites = [
    config.requireCallerName ? "vollständigen Namen der anrufenden Person" : null,
    config.requireCallerPhone ? "Telefonnummer der anrufenden Person" : null,
  ].filter(Boolean);

  const prerequisiteBlock =
    prerequisites.length > 0
      ? `- Bevor du buchst oder stornierst, erfrage: ${prerequisites.join(" und ")}.`
      : "- Erfasse die Kontaktdaten der anrufenden Person.";

  const bookingBlock = config.allowBooking
    ? `## Termine vereinbaren
- Erlaubte Anrufer: ${config.allowedCallersDescription}
- Erlaubte Terminarten: ${typeList}
- Prüfe zuerst mit «check_availability», ob Terminvereinbarung möglich ist.
- Frage gezielt nach dem gewünschten Datum, der Uhrzeit und der passenden Terminart.
${prerequisiteBlock}
- Wiederhole Datum, Uhrzeit, Terminart und Name zur Bestätigung, bevor du buchst.
- Trage den Termin mit «book_appointment» ein:
  - title: kurzer Titel mit Terminart und Name (wird im Kalender als «[Cura Agent] …» gespeichert)
  - startIso: ISO 8601 mit Zeitzone Europe/Zurich
  - durationMinutes: passend zur Terminart
  - attendeeName${config.requireCallerPhone ? " und attendeePhone" : ""}: Kontaktdaten der anrufenden Person
- Bestätige den eingetragenen Termin freundlich mit Datum, Uhrzeit und Terminart — aber NUR wenn «book_appointment» mit booked: true zurückkam.
- Sage niemals «ich habe notiert» oder «Termin eingetragen», ohne dass book_appointment erfolgreich war.`
    : "## Termine vereinbaren\n- Terminvereinbarung ist deaktiviert. Biete einen Rückruf an.";

  const cancellationBlock = config.allowCancellation
    ? `## Termine stornieren
- Anrufer dürfen Termine stornieren, wenn sie ${config.requireAppointmentDateForCancel ? "den Tag des Termins und " : ""}ihren Namen nennen.
- Frage bei Bedarf nach, bis du alle nötigen Angaben hast.
- Nutze «find_appointments» mit appointmentDate (YYYY-MM-DD) und attendeeName, um den Termin zu finden.
- Wenn mehrere Treffer: frage nach der Uhrzeit und suche erneut.
- Storniere mit «cancel_appointment» (eventId aus find_appointments). Der Termin bleibt im Kalender sichtbar und wird als «[Abgesagt · Cura Agent]» markiert.
- Bestätige die Stornierung freundlich.`
    : "";

  return `

# Terminvereinbarung (${preset.label})
Du unterstützt ${config.allowedCallersDescription} bei Terminanfragen für ${preset.label.toLowerCase()}.

${bookingBlock}
${cancellationBlock ? `\n${cancellationBlock}` : ""}
- Wenn Terminvereinbarung nicht möglich ist, biete einen Rückruf durch das Team an.`;
}
