export type CalendarProviderId = "google" | "microsoft" | "apple";

export interface ProviderMeta {
  id: CalendarProviderId;
  name: string;
  logoInitials: string;
  description: string;
}

export const CALENDAR_PROVIDERS: CalendarProviderId[] = [
  "google",
  "microsoft",
  "apple",
];

/** Client-safe provider labels (no server store imports). */
export const PROVIDER_META: Record<CalendarProviderId, ProviderMeta> = {
  google: {
    id: "google",
    name: "Google Kalender",
    logoInitials: "G",
    description:
      "Persönlichen Google Kalender verbinden — Termine landen direkt in Ihrem Konto.",
  },
  microsoft: {
    id: "microsoft",
    name: "Microsoft Outlook",
    logoInitials: "M",
    description: "Termine in Outlook / Microsoft 365 eintragen.",
  },
  apple: {
    id: "apple",
    name: "Apple Kalender (iCloud)",
    logoInitials: "A",
    description: "Termine direkt in Ihren iCloud-Kalender eintragen.",
  },
};
