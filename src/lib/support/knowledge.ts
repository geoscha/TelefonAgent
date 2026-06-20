/**
 * Internal LINKER product knowledge for the in-app support assistant.
 *
 * This is the ONLY source of truth the support bot may use to answer product
 * questions. The bot must never invent features or do web research.
 */

export interface SupportNavPage {
  /** App route the bot may propose navigating to (must start with "/"). */
  path: string;
  /** Short human label shown on the confirmation button. */
  label: string;
  /** When this destination is relevant (helps the model choose). */
  description: string;
}

/**
 * Allowlist of destinations the support bot may propose. The bot can only
 * navigate the user to one of these paths (always after explicit confirmation).
 */
export const SUPPORT_NAV_PAGES: SupportNavPage[] = [
  {
    path: "/anrufe",
    label: "Anrufe",
    description:
      "Übersicht aller eingegangenen Anrufe mit Transkript, Zusammenfassung und Aufnahme.",
  },
  {
    path: "/nachrichten",
    label: "Nachrichten",
    description:
      "Schriftliche Konversationen (E-Mail, WhatsApp, Chat) des Assistenten.",
  },
  {
    path: "/telefonagent",
    label: "KI-Assistenten",
    description:
      "Assistenten erstellen und konfigurieren: Stimme, Begrüssung, Charakter, Fähigkeiten (Termine), Weiterleitungsnummer und Integrationen.",
  },
  {
    path: "/phones",
    label: "Telefonnummern",
    description:
      "Linker-Nummern beziehen, Ladennumer per Weiterleitung koppeln (alle Anrufe), Nummern aktivieren oder kündigen.",
  },
  {
    path: "/kalender",
    label: "Kalender",
    description: "Termine und Kalenderansicht des verbundenen Kalenders.",
  },
  {
    path: "/integrationen",
    label: "Integrationen",
    description:
      "Kalender (Google, Microsoft, Apple) und Postfächer (Gmail, Outlook, iCloud) verbinden.",
  },
  {
    path: "/billing",
    label: "Abrechnung",
    description: "Guthaben, Tarif, Zahlungen und Verbrauch.",
  },
  {
    path: "/einstellungen",
    label: "Einstellungen",
    description: "Profil, Passwort und Konto verwalten.",
  },
];

export function findSupportNavPage(path: string): SupportNavPage | undefined {
  const normalized = path.trim().replace(/\/+$/, "") || "/";
  return SUPPORT_NAV_PAGES.find(
    (page) => page.path === normalized || page.path === path.trim()
  );
}

/** Concise, factual product knowledge (German). Internal use only. */
export const LINKER_PRODUCT_KNOWLEDGE = `# Was ist Linker
Linker ist ein KI-Telefonassistent (KI-Callcenter) für kleine und mittlere Unternehmen. Ein Assistent nimmt Anrufe entgegen, beantwortet Fragen, vereinbart Termine und leitet bei Bedarf an einen Menschen weiter. Es gibt auch schriftliche Kanäle (E-Mail, WhatsApp, Chat).

# Hauptbereiche der App
- **Anrufe**: Alle eingegangenen Anrufe mit Transkript, Zusammenfassung, Kategorie und Aufnahme.
- **Nachrichten**: Schriftliche Konversationen über verbundene Kanäle.
- **KI-Assistenten**: Assistenten anlegen und konfigurieren (Stimme, Begrüssung, Branche/Charakter, Anweisungen, Fähigkeiten, Weiterleitungsnummer).
- **Telefonnummern**: Linker-Nummer beziehen und die eigene Geschäftsnummer per Anrufweiterleitung damit koppeln.
- **Kalender**: Termine ansehen.
- **Integrationen**: Kalender und Postfächer verbinden.
- **Abrechnung**: Guthaben, Tarif und Verbrauch.

# Telefonnummern & Weiterleitung
- Der Kunde behält seine Ladennumer. Diese wird per GSM-Weiterleitungscode auf die Linker-Nummer gekoppelt.
- **Alle Anrufe (**21*…#):** Jeder Anruf auf die Ladennumer geht sofort an den KI-Assistenten auf der Linker-Nummer — die Ladennumer klingelt nicht. Nummer im Code ohne Plus (z. B. **21*41715392626#).
- Einrichtung auf dem Handy der Ladennumer: zuerst ##002# (alles löschen), bei Yallo Combox in der App deaktivieren, dann **21*…#, prüfen mit *#21# (muss Linker-Nummer zeigen).
- Deaktivieren: ##21#.

# Weiterleitung an eine Person (Eskalation)
- Pro Assistent kann eine **Eskalationsnummer (Zweitnummer)** hinterlegt werden — z. B. Festnetz im Laden.
- Verlangt der Anrufer eine Person, leitet der Assistent live an diese Nummer weiter (mit Wartemusik).

# Termine
- Wenn die Fähigkeit „Termine vereinbaren" aktiv ist und ein Kalender verbunden wurde, prüft der Assistent live die Verfügbarkeit und trägt Termine ein.
- Termintitel folgen dem Muster „Nachname - Zweck". Sonderwünsche landen in den Notizen.
- Kalender werden unter Integrationen verbunden (Google, Microsoft, Apple).
# Assistenten konfigurieren
- Stimme: eine weibliche (Marta) und eine männliche (Otto) Stimme.
- Branche/Charakter, Begrüssung und freie Anweisungen sind einstellbar.
- Fähigkeiten (z. B. Termine vereinbaren/stornieren) lassen sich pro Assistent ein- oder ausschalten; dafür muss ein Kalender verbunden sein.

# Abrechnung
- Nutzung wird über Guthaben/Tarif abgerechnet. Details stehen im Bereich Abrechnung.

# Grenzen
- Der Support-Assistent beantwortet ausschliesslich Fragen zu Linker und zur Konfiguration des angemeldeten Nutzers. Keine allgemeine Internet- oder Wissensrecherche.`;
