import type { Call } from "@/lib/types";

export const mockCalls: Call[] = [
  {
    id: "call-001",
    title: "Wasserschaden im Bad",
    callerName: "Marina Keller",
    callerPhone: "+41 79 123 45 67",
    property: "Bahnhofstrasse 12, Zürich",
    startedAt: "2026-06-14T08:42:00+02:00",
    durationSeconds: 187,
    summary:
      "Mieterin meldet Wasserschaden im Badezimmer. Feuchtigkeit an der Decke seit gestern Abend. Dringender Handwerker-Einsatz gewünscht.",
    category: "Schadenmeldung",
    urgency: "hoch",
    status: "offen",
    transcript: [
      { speaker: "Agent", text: "Grüezi, Sie erreichen die Cura Telefonassistenz der Liegenschaft Bahnhofstrasse 12. Wie kann ich Ihnen helfen?", timestamp: "00:00" },
      { speaker: "Anrufer", text: "Guten Tag, hier ist Marina Keller aus der Wohnung 3B. Ich habe einen Wasserschaden im Bad.", timestamp: "00:08" },
      { speaker: "Agent", text: "Das tut mir leid. Können Sie mir beschreiben, wo genau das Wasser austritt?", timestamp: "00:18" },
      { speaker: "Anrufer", text: "An der Decke über der Badewanne. Es tropft seit gestern Abend.", timestamp: "00:26" },
    ],
    structuredSummary: {
      tenant: "Marina Keller, Whg. 3B",
      property: "Bahnhofstrasse 12, Zürich",
      concernType: "Wasserschaden Badezimmer",
      urgency: "hoch",
      notes: "Feuchtigkeit an Decke, seit gestern Abend",
    },
    suggestedActions: [
      { id: "sa-001", label: "Kalendereintrag erstellen", type: "Kalendereintrag", status: "offen" },
      { id: "sa-002", label: "Aufgabe anlegen", type: "Aufgabe", status: "offen" },
      { id: "sa-003", label: "An Verwalter eskalieren", type: "Eskalation", status: "offen" },
    ],
  },
  {
    id: "call-002",
    title: "Mietzins-Frage",
    callerName: "Thomas Brunner",
    callerPhone: "+41 78 234 56 78",
    property: "Seestrasse 45, Zürich",
    startedAt: "2026-06-14T09:15:00+02:00",
    durationSeconds: 94,
    summary:
      "Anfrage zur Mietzinsanpassung per 1. Juli. Mieter möchte schriftliche Bestätigung der neuen Miete per E-Mail.",
    category: "Mietzins",
    urgency: "niedrig",
    status: "erledigt",
    transcript: [
      { speaker: "Agent", text: "Grüezi, Cura Telefonassistenz Seestrasse 45. Womit kann ich dienen?", timestamp: "00:00" },
      { speaker: "Anrufer", text: "Ich habe eine Frage zur Mietzinsanpassung ab Juli.", timestamp: "00:06" },
    ],
    structuredSummary: {
      tenant: "Thomas Brunner, Whg. 2A",
      property: "Seestrasse 45, Zürich",
      concernType: "Mietzinsanpassung",
      urgency: "niedrig",
    },
    suggestedActions: [
      { id: "sa-004", label: "Rückruf planen", type: "Rückruf", status: "erledigt" },
    ],
  },
  {
    id: "call-003",
    title: "Besichtigungstermin",
    callerPhone: "+41 76 345 67 89",
    property: "Limmatquai 88, Zürich",
    startedAt: "2026-06-14T10:03:00+02:00",
    durationSeconds: 142,
    summary:
      "Interessent möchte Besichtigungstermin für 3.5-Zi-Wohnung am Samstag. Bevorzugt Vormittag.",
    category: "Besichtigung",
    urgency: "mittel",
    status: "offen",
    transcript: [
      { speaker: "Agent", text: "Grüezi, Cura Telefonassistenz Limmatquai 88.", timestamp: "00:00" },
      { speaker: "Anrufer", text: "Ich interessiere mich für die 3.5-Zi-Wohnung. Gibt es einen Besichtigungstermin?", timestamp: "00:05" },
    ],
    structuredSummary: {
      property: "Limmatquai 88, Zürich",
      concernType: "Besichtigungstermin",
      urgency: "mittel",
      notes: "Samstag Vormittag bevorzugt",
    },
    suggestedActions: [
      { id: "sa-005", label: "Kalendereintrag erstellen", type: "Kalendereintrag", status: "offen" },
    ],
  },
  {
    id: "call-004",
    title: "Entsorgungs-Frage",
    callerName: "Sophie Meier",
    callerPhone: "+41 79 456 78 90",
    property: "Rämistrasse 5, Zürich",
    startedAt: "2026-06-14T11:30:00+02:00",
    durationSeconds: 68,
    summary:
      "Allgemeine Frage zu Müllentsorgung und Recycling-Regeln im Gebäude.",
    category: "Allgemein",
    urgency: "niedrig",
    status: "erledigt",
    transcript: [
      { speaker: "Agent", text: "Grüezi, Cura Telefonassistenz Rämistrasse 5.", timestamp: "00:00" },
      { speaker: "Anrufer", text: "Wo kann ich Elektroschrott entsorgen?", timestamp: "00:04" },
    ],
    structuredSummary: {
      tenant: "Sophie Meier, Whg. 1C",
      property: "Rämistrasse 5, Zürich",
      concernType: "Entsorgung",
      urgency: "niedrig",
    },
    suggestedActions: [],
  },
  {
    id: "call-005",
    title: "Heizungsausfall",
    callerName: "Luca Fontana",
    callerPhone: "+41 79 567 89 01",
    property: "Hardturmstrasse 161, Zürich",
    startedAt: "2026-06-14T12:45:00+02:00",
    durationSeconds: 215,
    summary:
      "NOTFALL: Heizungsausfall in der gesamten Wohnung. Temperatur unter 15°C. Mieter mit Kleinkind.",
    category: "Notfall",
    urgency: "hoch",
    status: "eskaliert",
    transcript: [
      { speaker: "Agent", text: "Grüezi, Cura Notfall-Hotline Hardturmstrasse 161.", timestamp: "00:00" },
      { speaker: "Anrufer", text: "Die Heizung ist komplett ausgefallen! Wir haben ein Baby zu Hause.", timestamp: "00:05" },
    ],
    structuredSummary: {
      tenant: "Luca Fontana, Whg. 4D",
      property: "Hardturmstrasse 161, Zürich",
      concernType: "Heizungsausfall",
      urgency: "hoch",
      notes: "Kleinkind im Haushalt, sofortige Eskalation",
    },
    suggestedActions: [
      { id: "sa-006", label: "An Verwalter eskalieren", type: "Eskalation", status: "eskaliert" },
    ],
  },
  {
    id: "call-006",
    title: "Defekter Aufzug",
    callerName: "Anna Weber",
    callerPhone: "+41 78 678 90 12",
    property: "Universitätsstrasse 15, Zürich",
    startedAt: "2026-06-14T13:20:00+02:00",
    durationSeconds: 156,
    summary:
      "Mieterin meldet defekten Aufzug. Wird seit 2 Stunden nicht repariert. Rollstuhlfahrerin im Gebäude betroffen.",
    category: "Schadenmeldung",
    urgency: "hoch",
    status: "offen",
    transcript: [
      { speaker: "Agent", text: "Grüezi, Cura Telefonassistenz Universitätsstrasse 15.", timestamp: "00:00" },
      { speaker: "Anrufer", text: "Der Aufzug funktioniert seit Stunden nicht.", timestamp: "00:05" },
    ],
    structuredSummary: {
      tenant: "Anna Weber, Whg. 2B",
      property: "Universitätsstrasse 15, Zürich",
      concernType: "Aufzug defekt",
      urgency: "hoch",
    },
    suggestedActions: [
      { id: "sa-007", label: "Aufgabe anlegen", type: "Aufgabe", status: "offen" },
      { id: "sa-008", label: "An Verwalter eskalieren", type: "Eskalation", status: "offen" },
    ],
  },
];

export function getCallById(id: string): Call | undefined {
  return mockCalls.find((c) => c.id === id);
}
