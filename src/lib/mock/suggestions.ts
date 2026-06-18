import type { Suggestion } from "@/lib/types";

export const mockSuggestions: Suggestion[] = [
  {
    id: "sug-001",
    callId: "call-001",
    type: "Kalendereintrag",
    title: "Handwerker-Termin Wasserschaden",
    description:
      "Termin für Sanitär-Handwerker zur Begutachtung des Wasserschadens in Whg. 3B.",
    prefilledData: {
      datum: "15.06.2026",
      uhrzeit: "09:00",
      ort: "Bahnhofstrasse 12, Zürich — Whg. 3B",
      teilnehmer: "Marina Keller, Sanitär AG Meier",
    },
    status: "pending",
    createdAt: "2026-06-14T08:45:00+02:00",
  },
  {
    id: "sug-002",
    callId: "call-003",
    type: "Kalendereintrag",
    title: "Besichtigung 3.5-Zi-Wohnung",
    description: "Besichtigungstermin für interessierten Mieter.",
    prefilledData: {
      datum: "15.06.2026",
      uhrzeit: "10:30",
      ort: "Limmatquai 88, Zürich",
    },
    status: "pending",
    createdAt: "2026-06-14T10:06:00+02:00",
  },
  {
    id: "sug-003",
    callId: "call-006",
    type: "Aufgabe",
    title: "Aufzug-Reparatur beauftragen",
    description: "Aufzugtechniker kontaktieren und Reparaturtermin vereinbaren.",
    prefilledData: {
      prioritaet: "Hoch",
      zustaendig: "Technischer Dienst",
    },
    status: "pending",
    createdAt: "2026-06-14T13:22:00+02:00",
  },
  {
    id: "sug-004",
    callId: "call-005",
    type: "Eskalation",
    title: "Heizungsnotfall — Verwalter informieren",
    description: "Sofortige Eskalation an Hauswart und Heizungstechniker.",
    prefilledData: {
      grund: "Heizungsausfall, Kleinkind im Haushalt",
    },
    status: "accepted",
    createdAt: "2026-06-14T12:48:00+02:00",
  },
];
