import { CUSTOMER_CONFIRMATION_PROMPT } from "@/lib/integrations/customer-confirmation";

const RELATIVE_DATE_INSTRUCTION_BLOCK = `### Relative Datumsangaben
- Anrufer dürfen natürlich formulieren: «Montag», «Montag nächste Woche», «übermorgen», «nächste Woche Dienstag», «am fünfzehnten».
- Rechne das intern in **appointmentDate (YYYY-MM-DD)** für check_availability und book_appointment um.
- Bei **relativen oder unklaren** Datumsangaben einmal **bestätigend nachfragen** mit konkretem Kalenderdatum und Uhrzeit, z. B.: «Meinen Sie Montag, den 23. Juni um 14 Uhr?»
- Erst nach klarem «Ja» oder eindeutiger Bestätigung die Tools aufrufen.
- Bei bereits **exaktem** Datum und Uhrzeit in einem Satz (z. B. «15. Juni um 10 Uhr») kann die Datums-Rückfrage entfallen, wenn eindeutig.`;

const LIVE_PHONE_BOOKING_BLOCK = `### Terminbuchung (während des Anrufs)
- Vor **check_availability** genau **einen kurzen Überbrückungssatz** sagen (z. B. «Einen Moment, ich prüfe das kurz für Sie»), damit während der Prüfung keine Stille entsteht.
- **check_availability** mit appointmentDate (YYYY-MM-DD), appointmentTime (HH:mm) und passender durationMinutes aufrufen.
- Bei available=true: **book_appointment** aufrufen — dass eingetragen wird, **vorher nicht** ankündigen.
- Erst bei **booked:true** laut bestätigen: Dank + **konkretes Datum und Uhrzeit** («Vielen Dank, [Nachname], Ihr Termin am Freitag, den 26. Juni um 10 Uhr ist eingetragen.»).
- **Sofort danach end_call** — kein weiteres Gespräch.
- Bei available=false: die zurückgegebenen **Alternativen** anbieten.
- Bei einem Fehler/Problem bei der Prüfung (calendarError): **einmal** dieselbe Prüfung wiederholen. Klappt es dann immer noch nicht, freundlich einen **Rückruf** anbieten — **niemals kommentarlos still** bleiben.`;

const CUSTOMER_WISHES_NOTES_BLOCK = `### Sonderwünsche & Bemerkungen
- Äussert der Kunde **zusätzliche Wünsche** (z. B. bestimmte Coiffeurin/Coiffeur, Behandlungsart, Allergie, «bitte Fensterplatz», Fahrzeugdetails): **nicht ignorieren**.
- Diese Wünsche bei **book_appointment** im Feld **notes** mitgeben — wörtlich oder knapp zusammengefasst (z. B. «Wunsch: Coiffeurin Maria»).
- Die Bemerkung erscheint im Kalender unter «Notiz: …» — du musst sie dem Kunden beim Buchen **nicht vorlesen**, aber bei der Bestätigung darf ein kurzer Hinweis stehen, wenn relevant («… Ihr Termin am … ist eingetragen, der Wunsch nach Maria ist vermerkt.»).
- Keine extra Rückfrage nur wegen eines Wunsches — wenn der Kunde ihn nennt, einfach in **notes** übernehmen.`;

export type AppointmentIndustryPresetId =
  | "allgemein"
  | "restaurant"
  | "garage"
  | "beauty"
  | "immobilien";

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

const LEGACY_PRESET_IDS = new Set(["hausarzt"]);

export function migrateIndustryPresetId(
  value: unknown
): AppointmentIndustryPresetId {
  if (
    value === "allgemein" ||
    value === "restaurant" ||
    value === "garage" ||
    value === "beauty" ||
    value === "immobilien"
  ) {
    return value;
  }
  if (typeof value === "string" && LEGACY_PRESET_IDS.has(value)) {
    return "allgemein";
  }
  return "immobilien";
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
  immobilien: {
    id: "immobilien",
    label: "Immobilienverwaltung",
    description:
      "Termine für Schlüsselübergaben, Reparaturen, Besichtigungen und Wohnungsabnahmen.",
    config: {
      industryPreset: "immobilien",
      allowedCallersDescription:
        "Mietende, Eigentümer, Handwerker und Interessenten",
      allowBooking: true,
      allowCancellation: true,
      requireCallerName: true,
      requireAppointmentDateForCancel: true,
      appointmentTypes: [
        {
          id: "schluesseluebergabe",
          label: "Schlüsselübergabe",
          durationMinutes: 30,
          enabled: true,
        },
        {
          id: "reparatur",
          label: "Reparatur- / Handwerkertermin",
          durationMinutes: 60,
          enabled: true,
        },
        {
          id: "besichtigung",
          label: "Wohnungsbesichtigung",
          durationMinutes: 30,
          enabled: true,
        },
        {
          id: "abnahme",
          label: "Wohnungsabnahme / -übergabe",
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
    schluesseluebergabe: [
      "schlüsselübergabe",
      "schluesseluebergabe",
      "schlüssel",
      "schluessel",
      "schlüsselrückgabe",
      "übergabe",
      "uebergabe",
      "einzug",
    ],
    reparatur: [
      "reparatur",
      "handwerker",
      "handwerkertermin",
      "schaden",
      "defekt",
      "reparieren",
      "instandsetzung",
      "techniker",
      "monteur",
      "wartung",
      "service",
    ],
    besichtigung: [
      "besichtigung",
      "wohnungsbesichtigung",
      "besichtigen",
      "anschauen",
      "interessent",
      "viewing",
    ],
    abnahme: [
      "abnahme",
      "wohnungsabnahme",
      "wohnungsübergabe",
      "wohnungsuebergabe",
      "auszug",
      "rückgabe",
      "ruekgabe",
      "übergabeprotokoll",
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

const FLEXIBLE_LIVE_BOOKING_BLOCK = `${LIVE_PHONE_BOOKING_BLOCK}
${RELATIVE_DATE_INSTRUCTION_BLOCK}`;

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
- Wünsche wie «bei Coiffeurin Anna», «nur Stutzen», «Färben» → in **notes** bei book_appointment.
- Hat der Kunde Nachname, Datum und Uhrzeit genannt und check_availability liefert available=true: **book_appointment** aufrufen (mit **notes** falls Wünsche genannt), mit Datum/Uhrzeit bestätigen und bedanken, dann **sofort** end_call.
- Stelle nur die wirklich nötigen Rückfragen (fehlender Nachname, fehlendes Datum/Uhrzeit, oder Bestätigung eines relativen Datums) — eine nach der anderen, aber bleibe **nicht kommentarlos still**.
- Keine Wiederholung der Dauer, keine «Passt 60 Minuten?»-Frage.`;
  }

  if (presetId === "immobilien") {
    return `### Schnellablauf Immobilienverwaltung (strikt)
- **Nachname + Terminart + Datum + Uhrzeit** genügen. Telefonnummer wird bei Anrufen automatisch übernommen.
- Terminart aus dem Anliegen ableiten: «Schlüssel/Einzug» → schluesseluebergabe (30 Min), «Reparatur/Handwerker/Schaden» → reparatur (60 Min), «Besichtigung/anschauen» → besichtigung (30 Min), «Abnahme/Auszug/Übergabe» → abnahme (60 Min).
- durationMinutes aus der Terminart übernehmen — **nicht** vom Anrufer erfragen.
- **Liegenschaft/Adresse, Wohnung und das konkrete Anliegen** (z. B. «Wasserhahn tropft», «Storenmotor defekt») in **notes** bei book_appointment vermerken.
- Bei available=true: **book_appointment** aufrufen, mit Datum/Uhrzeit bestätigen, bedanken, dann **sofort** end_call.
- Nur die wirklich nötigen Rückfragen stellen (fehlender Nachname, Terminart, Datum/Uhrzeit, betroffene Liegenschaft) — eine nach der anderen, aber bleibe **nicht kommentarlos still**.`;
  }

  if (presetId === "restaurant" || presetId === "garage" || presetId === "allgemein") {
    return `### Schnellablauf
- Nachname + Datum + Uhrzeit genügen. Telefonnummer wird bei Anrufen automatisch übernommen.
- Dauer aus der Terminart ableiten — nicht vom Kunden erfragen, wenn Terminart klar ist.
- Zusätzliche Wünsche (z. B. Terrasse, Fahrzeugmodell, besondere Anliegen) in **notes** bei book_appointment vermerken.
- Bei available=true: **book_appointment** aufrufen, bestätigen, bedanken, **sofort** end_call.`;
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
        CUSTOMER_WISHES_NOTES_BLOCK,
        "### Ablauf",
        "1. Anliegen verstehen und **Dauer schätzen**.",
        "2. Name, Datum und Uhrzeit erfassen.",
        "3. check_availability mit appointmentDate, appointmentTime und durationMinutes.",
        "4. available=false → Alternativen nennen.",
        "5. available=true → book_appointment aufrufen.",
        "6. booked:true → Dank + Datum/Uhrzeit bestätigen, dann **sofort** end_call.",
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
        RELATIVE_DATE_INSTRUCTION_BLOCK,
        CUSTOMER_CONFIRMATION_PROMPT,
        LIVE_PHONE_BOOKING_BLOCK,
        CUSTOMER_WISHES_NOTES_BLOCK,
        "### Ablauf",
        "1. **Nachname** und **Datum/Uhrzeit** erfassen — auch relative Angaben wie «Montag nächste Woche».",
        "2. Bei relativem Datum: einmal mit **konkretem Kalenderdatum** bestätigend nachfragen.",
        "3. Kurzer Überbrückungssatz, dann «check_availability» mit appointmentDate (YYYY-MM-DD) und appointmentTime (HH:mm).",
        "4. Ergebnis mitteilen.",
        "5. available=false → die zurückgegebenen Alternativen anbieten.",
        "6. available=true → **book_appointment** aufrufen.",
        "7. booked:true → bedanken, Termin mit **Datum und Uhrzeit** bestätigen, **sofort** end_call.",
        "",
        "### Regeln",
        "- Keine unnötigen Rückfragen. Ziel: Termin buchen, bestätigen, auflegen.",
        "- attendeeName = **Nachname** des Kunden (Vorname nicht nötig).",
        "- Telefonnummer **nicht** erfragen — bei Anrufen wird sie automatisch aus der Anrufer-ID übernommen.",
        "- Sonderwünsche des Kunden in **notes** bei book_appointment mitgeben.",
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

  const rescheduleBlock =
    config.allowBooking && config.allowCancellation
      ? `## Termine verschieben
- Frage nach dem **Namen**, dem **bisherigen Termintag** und dem **neuen Wunschtermin**.
- Bestehenden Termin mit «find_appointments» finden.
- Neuen Slot mit «check_availability» prüfen; ist er frei, mit «book_appointment» neu eintragen.
- Anschliessend den alten Termin mit «cancel_appointment» absagen.
- Den neuen Termin mit Datum und Uhrzeit bestätigen.`
      : "";

  const cancellationSection = [cancellationBlock, rescheduleBlock]
    .filter(Boolean)
    .map((block) => `\n${block}`)
    .join("");

  return `

# Terminvereinbarung (${flexible ? "Privater Assistent" : preset.label})
Du hilfst ${config.allowedCallersDescription} bei Terminanfragen.

${bookingBlock}${cancellationSection}
- Wenn Terminvereinbarung nicht möglich ist, biete einen Rückruf durch das Team an.`;
}
