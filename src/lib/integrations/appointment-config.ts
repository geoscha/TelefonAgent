import { CUSTOMER_CONFIRMATION_PROMPT } from "@/lib/integrations/customer-confirmation";

const POST_CALL_PHONE_BOOKING_BLOCK = `### Buchung nach dem Anruf (automatisch, verbindlich)
- Während des Anrufs: **check_availability** aufrufen, Name/Datum/Uhrzeit erfassen, Slot mündlich bestätigen.
- **book_appointment während des Anrufs NICHT aufrufen** — der Termin wird nach dem Auflegen automatisch aus dem Transkript eingetragen.
- Wenn du sagst «notiert», «vereinbart» oder «bestätigt», ist das **verbindlich** — das System trägt den Termin danach in den Kalender ein.
- Formuliere immer mit **konkretem Datum und Uhrzeit**: «Perfekt, [Nachname] am [Datum] um [Uhrzeit] — wir haben das vereinbart.»
- Dann **sofort** end_call.
- Sage nicht «im Kalender eingetragen» während des Anrufs — die Eintragung erfolgt nach dem Gespräch.`;

export type AppointmentIndustryPresetId =
  | "allgemein"
  | "restaurant"
  | "garage"
  | "beauty";

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
  /** Storno nur möglich, wenn der Anrufer den Tag des Termins kennt. */
  requireAppointmentDateForCancel: boolean;
  /** Freie Terminplanung — Dauer wird vom Agenten geschätzt, keine festen Terminarten. */
  flexibleScheduling?: boolean;
  appointmentTypes: AppointmentTypeConfig[];
}

export interface AppointmentIndustryPreset {
  id: AppointmentIndustryPresetId;
  label: string;
  description: string;
  config: AppointmentConfig;
}

const LEGACY_PRESET_IDS = new Set(["hausarzt", "immobilien"]);

export function migrateIndustryPresetId(
  value: unknown
): AppointmentIndustryPresetId {
  if (
    value === "allgemein" ||
    value === "restaurant" ||
    value === "garage" ||
    value === "beauty"
  ) {
    return value;
  }
  if (typeof value === "string" && LEGACY_PRESET_IDS.has(value)) {
    return "allgemein";
  }
  return "allgemein";
}

export const APPOINTMENT_INDUSTRY_PRESETS: Record<
  AppointmentIndustryPresetId,
  AppointmentIndustryPreset
> = {
  allgemein: {
    id: "allgemein",
    label: "Allgemein (Dienstleistung)",
    description:
      "Einfache Terminvereinbarung per Name — für kleine Unternehmen ohne besondere Vorschriften.",
    config: {
      industryPreset: "allgemein",
      allowedCallersDescription: "Kundinnen und Kunden",
      allowBooking: true,
      allowCancellation: true,
      requireCallerName: true,
      requireAppointmentDateForCancel: true,
      appointmentTypes: [
        {
          id: "termin",
          label: "Termin",
          durationMinutes: 30,
          enabled: true,
        },
      ],
    },
  },
  restaurant: {
    id: "restaurant",
    label: "Restaurant",
    description:
      "Tischreservierungen auf Namen — Gäste nennen Datum, Uhrzeit und Personenzahl.",
    config: {
      industryPreset: "restaurant",
      allowedCallersDescription: "Gäste und Reservierungsanfragen",
      allowBooking: true,
      allowCancellation: true,
      requireCallerName: true,
      requireAppointmentDateForCancel: true,
      appointmentTypes: [
        {
          id: "tischreservation",
          label: "Tischreservation",
          durationMinutes: 90,
          enabled: true,
        },
      ],
    },
  },
  garage: {
    id: "garage",
    label: "Garage / Werkstatt",
    description:
      "Werkstatttermine auf Namen — Kunden nennen Fahrzeug und gewünschte Zeit.",
    config: {
      industryPreset: "garage",
      allowedCallersDescription: "Kundinnen und Kunden der Werkstatt",
      allowBooking: true,
      allowCancellation: true,
      requireCallerName: true,
      requireAppointmentDateForCancel: true,
      appointmentTypes: [
        {
          id: "werkstatttermin",
          label: "Werkstatttermin",
          durationMinutes: 60,
          enabled: true,
        },
      ],
    },
  },
  beauty: {
    id: "beauty",
    label: "Beauty / Coiffeur",
    description:
      "Haareschneiden und Behandlungen — Nachname, Datum und Uhrzeit genügen.",
    config: {
      industryPreset: "beauty",
      allowedCallersDescription: "Kundinnen und Kunden des Salons",
      allowBooking: true,
      allowCancellation: true,
      requireCallerName: true,
      requireAppointmentDateForCancel: true,
      appointmentTypes: [
        {
          id: "haareschneiden",
          label: "Haareschneiden",
          durationMinutes: 30,
          enabled: true,
        },
        {
          id: "behandlung",
          label: "Behandlung",
          durationMinutes: 60,
          enabled: true,
        },
      ],
    },
  },
};

export const DEFAULT_APPOINTMENT_CONFIG: AppointmentConfig = {
  ...APPOINTMENT_INDUSTRY_PRESETS.allgemein.config,
};

/** Flexible Terminplanung für private Assistenten — keine festen Terminarten. */
export function configForPrivateAssistant(): AppointmentConfig {
  return {
    industryPreset: "allgemein",
    allowedCallersDescription: "Anrufer und Kontakte",
    allowBooking: true,
    allowCancellation: true,
    requireCallerName: true,
    requireAppointmentDateForCancel: true,
    flexibleScheduling: true,
    appointmentTypes: [
      {
        id: "termin",
        label: "Termin",
        durationMinutes: 30,
        enabled: true,
      },
    ],
  };
}

export function isFlexibleScheduling(config: AppointmentConfig): boolean {
  return Boolean(config.flexibleScheduling);
}

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
  const presetId = migrateIndustryPresetId(raw.industryPreset);
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
    requireAppointmentDateForCancel:
      raw.requireAppointmentDateForCancel !== undefined
        ? Boolean(raw.requireAppointmentDateForCancel)
        : presetDefaults.requireAppointmentDateForCancel,
    flexibleScheduling:
      raw.flexibleScheduling !== undefined
        ? Boolean(raw.flexibleScheduling)
        : presetDefaults.flexibleScheduling,
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
  title?: string,
  typeId?: string
): AppointmentTypeConfig | undefined {
  const enabled = getEnabledAppointmentTypes(config);
  if (enabled.length === 0) return undefined;

  if (isFlexibleScheduling(config)) {
    const fallback = enabled[0];
    const label = title?.trim() || fallback.label;
    return {
      id: fallback.id,
      label,
      durationMinutes: fallback.durationMinutes,
      enabled: true,
    };
  }

  const normalizedId = typeId?.trim().toLowerCase();
  if (normalizedId) {
    const byId = enabled.find((type) => type.id.toLowerCase() === normalizedId);
    if (byId) return byId;
  }

  const normalizedTitle = title?.trim().toLowerCase() ?? "";
  if (!normalizedTitle) return enabled[0];

  const synonyms: Record<string, string[]> = {
    termin: ["termin", "appointment", "buchung"],
    tischreservation: [
      "tischreservation",
      "tisch",
      "reservation",
      "reservierung",
      "tisch reservieren",
    ],
    werkstatttermin: [
      "werkstatttermin",
      "werkstatt",
      "service",
      "reparatur",
      "inspektion",
    ],
    behandlung: [
      "behandlung",
      "haareschneiden",
      "haare schneiden",
      "haarschnitt",
      "coiffeur",
      "frisör",
      "friseur",
      "salon",
      "kosmetik",
      "massage",
      "schnitt",
    ],
    haareschneiden: [
      "haareschneiden",
      "haare schneiden",
      "haarschnitt",
      "schnitt",
      "coiffeur",
      "frisör",
      "friseur",
    ],
  };

  const byLabel = enabled.find((type) => {
    if (
      normalizedTitle.includes(type.label.toLowerCase()) ||
      normalizedTitle.includes(type.id.toLowerCase())
    ) {
      return true;
    }
    const aliases = synonyms[type.id] ?? [];
    return aliases.some((alias) => normalizedTitle.includes(alias));
  });

  return byLabel ?? enabled[0];
}

export function resolveAppointmentDurationMinutes(
  config: AppointmentConfig,
  appointmentType: AppointmentTypeConfig,
  durationMinutes?: number
): number {
  const fallback = appointmentType.durationMinutes;
  const raw = durationMinutes ?? fallback;
  return Math.min(Math.max(Math.floor(raw) || fallback, 5), 240);
}

const FLEXIBLE_SCHEDULING_BLOCK = `### Flexible Terminplanung
- Termine sind **nicht** an feste Terminarten gebunden — jeder Termin wird individuell geplant.
- **Dauer intelligent schätzen** anhand des Anliegens (nicht vom Anrufer erfragen):
  - Kurzer Anruf / Arzt / Behörde: 15–30 Min.
  - Besprechung / Beratung: 45–60 Min.
  - Mittagessen / längeres Treffen: 60–90 Min.
  - Ganztägiges / mehrtägiges: nur wenn explizit genannt.
- **durationMinutes** bei check_availability und book_appointment **immer** mitgeben (5–240).
- Optional **title** mit kurzer Beschreibung (z. B. «Zahnarzt», «Mittagessen», «Besprechung»).
- Datum und Uhrzeit frei wählen — nur Kalender-Konflikte beachten.`;

const FLEXIBLE_LIVE_BOOKING_BLOCK = `### Terminbuchung
- check_availability mit appointmentDate, appointmentTime und durationMinutes (geschätzte Dauer).
- Bei available=true: book_appointment mit attendeeName, appointmentDate, appointmentTime, durationMinutes und optional title.
- Einen Termin erst als «eingetragen» bezeichnen, wenn book_appointment booked:true antwortete.`;

function buildIndustryFastPathBlock(
  presetId: AppointmentIndustryPresetId,
  flexible: boolean
): string {
  if (flexible) {
    return FLEXIBLE_SCHEDULING_BLOCK;
  }

  if (presetId === "beauty") {
    return `### Salon-Schnellablauf (strikt)
- **Nachname + Datum + Uhrzeit** genügen. Vorname, Telefonnummer und Dauer **niemals** erfragen.
- «Haareschneiden» → appointmentTypeId=haareschneiden (30 Min, automatisch). Andere Behandlung → behandlung (60 Min).
- durationMinutes **nicht** vom Kunden erfragen — aus der Terminart übernehmen.
- Hat der Kunde Nachname, Datum und Uhrzeit genannt und check_availability liefert available=true: mündlich bestätigen («notiert»), dann **sofort** end_call — **kein** book_appointment während des Anrufs.
- Maximal **eine** Rückfrage im ganzen Gespräch — nur wenn Nachname oder Datum/Uhrzeit wirklich fehlen.
- Keine Wiederholung der Dauer, keine «Passt 60 Minuten?»-Frage.`;
  }

  if (presetId === "restaurant" || presetId === "garage" || presetId === "allgemein") {
    return `### Schnellablauf
- Nachname + Datum + Uhrzeit genügen. Telefonnummer wird bei Anrufen automatisch übernommen.
- Dauer aus der Terminart ableiten — nicht vom Kunden erfragen, wenn Terminart klar ist.
- Bei available=true: mündlich bestätigen, end_call. Eintragung erfolgt nach dem Gespräch automatisch.`;
  }

  return "";
}

export function buildAppointmentPrompt(
  configInput?: AppointmentConfig,
  businessHoursBlock?: string
): string {
  const config = normalizeAppointmentConfig(configInput);
  const preset = getAppointmentPreset(config.industryPreset);
  const flexible = isFlexibleScheduling(config);
  const enabledTypes = getEnabledAppointmentTypes(config);
  const typeList = flexible
    ? "freie Termine — Dauer wird vom Agenten geschätzt"
    : enabledTypes.length > 0
      ? enabledTypes
          .map((type) => `${type.label} (${type.durationMinutes} Min.)`)
          .join(", ")
      : "keine Terminarten aktiviert";

  const fastPath = buildIndustryFastPathBlock(config.industryPreset, flexible);
  const fastPathSection = fastPath ? `${fastPath}\n` : "";

  const businessHoursSection =
    !flexible && businessHoursBlock
      ? `\n## Geschäftszeiten\n${businessHoursBlock}\n`
      : flexible && businessHoursBlock
        ? `\n## Bevorzugte Zeiten (optional)\n${businessHoursBlock}\n`
        : "";

  let bookingBlock: string;
  if (config.allowBooking) {
    if (flexible) {
      bookingBlock = [
        "## Termine vereinbaren",
        `- Erlaubte Anrufer: ${config.allowedCallersDescription}`,
        `- Modus: ${typeList}`,
        businessHoursSection.trimEnd(),
        fastPathSection.trimEnd(),
        FLEXIBLE_LIVE_BOOKING_BLOCK,
        "### Ablauf",
        "1. Anliegen verstehen und **Dauer schätzen**.",
        "2. Name, Datum und Uhrzeit erfassen.",
        "3. check_availability mit appointmentDate, appointmentTime und durationMinutes.",
        "4. available=false → Alternativen nennen.",
        "5. available=true → book_appointment aufrufen, dann kurz bestätigen.",
      ]
        .filter(Boolean)
        .join("\n");
    } else {
      bookingBlock = [
        "## Termine vereinbaren",
        `- Erlaubte Anrufer: ${config.allowedCallersDescription}`,
        `- Erlaubte Terminarten: ${typeList}`,
        businessHoursSection.trimEnd(),
        fastPathSection.trimEnd(),
        CUSTOMER_CONFIRMATION_PROMPT,
        POST_CALL_PHONE_BOOKING_BLOCK,
        "### Ablauf",
        "1. **Nachname** und **Datum/Uhrzeit** erfassen — wenn der Kunde alles in einem Satz nennt, sofort nutzen.",
        "2. Sofort «check_availability» mit appointmentDate (YYYY-MM-DD) und appointmentTime (HH:mm).",
        "3. Ergebnis mitteilen — nie vorher «ich prüfe» sagen.",
        "4. available=false → Alternativen nennen, neue Zeit, erneut prüfen.",
        "5. available=true → Termin mündlich bestätigen und notieren, dann **sofort** end_call.",
        "6. Nach dem Auflegen trägt das System den Termin automatisch in den Kalender ein.",
        "7. Nach Zielerreichung (Termin notiert oder Stornierung): höflich bedanken und end_call.",
        "",
        "### Regeln",
        "- Keine unnötigen Rückfragen. Ziel: Termin in unter 1 Minute buchen und auflegen.",
        "- attendeeName = **Nachname** des Kunden (Vorname nicht nötig).",
        "- Telefonnummer **nicht** erfragen — bei Anrufen wird sie automatisch aus der Anrufer-ID übernommen.",
      ]
        .filter(Boolean)
        .join("\n");
    }
  } else {
    bookingBlock =
      "## Termine vereinbaren\n- Terminvereinbarung ist deaktiviert. Biete einen Rückruf an.";
  }

  const cancellationBlock = config.allowCancellation
    ? `## Termine stornieren
- Frage nach dem **Namen** und dem **Tag des Termins**.
- Nutze «find_appointments» mit appointmentDate (YYYY-MM-DD) und attendeeName.
- Bei mehreren Treffern: Uhrzeit erfragen.
- Storniere mit «cancel_appointment». Bestätige freundlich und beende mit «end_call».`
    : "";

  const cancellationSection = cancellationBlock
    ? `\n${cancellationBlock}`
    : "";

  return `

# Terminvereinbarung (${flexible ? "Privater Assistent" : preset.label})
Du hilfst ${config.allowedCallersDescription} bei Terminanfragen.

${bookingBlock}${cancellationSection}
- Wenn Terminvereinbarung nicht möglich ist, biete einen Rückruf durch das Team an.`;
}
