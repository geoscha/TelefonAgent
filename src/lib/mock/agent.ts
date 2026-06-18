import type { AgentConfig } from "@/lib/types";

export const mockAgentConfig: AgentConfig = {
  name: "Cura Telefonagent",
  voiceId: "eleven-sarah-ch",
  language: "Deutsch",
  greeting:
    "Grüezi, Sie erreichen die Cura Telefonassistenz. Wie kann ich Ihnen helfen?",
  businessHours: {
    weekdays: "Mo–Fr 07:00–20:00",
    saturday: "Sa 09:00–17:00",
    sunday: "Geschlossen",
  },
  escalationRules: [
    "Notfälle (Feuer, Wasser, Gas) sofort an Verwalter weiterleiten",
    "Bei Unzufriedenheit nach 2 Minuten an Mensch übergeben",
    "Ausserhalb der Geschäftszeiten: Voicemail + SMS-Benachrichtigung",
  ],
  knowledgeBase: [
    "Mietverträge und Kündigungsfristen",
    "Hausordnung und Ruhezeiten",
    "Entsorgungsregeln und Recycling",
    "Kontaktdaten Hauswart und Techniker",
    "Besichtigungstermine und Verfügbarkeit",
  ],
};

export const mockVoices = [
  { id: "eleven-sarah-ch", name: "Sarah (Schweizerdeutsch, weiblich)" },
  { id: "eleven-marcus-de", name: "Marcus (Deutsch, männlich)" },
  { id: "eleven-claire-fr", name: "Claire (Französisch, weiblich)" },
  { id: "eleven-luca-it", name: "Luca (Italienisch, männlich)" },
  { id: "eleven-james-en", name: "James (Englisch, männlich)" },
];
