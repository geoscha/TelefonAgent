import type { DemoVoicePresetId } from "@/lib/demo/voices";

export type DemoUseCaseId =
  | "reception"
  | "appointment"
  | "lead"
  | "service"
  | "collections"
  | "survey";

export interface DemoUseCase {
  id: DemoUseCaseId;
  label: string;
  voice: DemoVoicePresetId;
  scenario: string;
}

export const DEMO_USE_CASES: DemoUseCase[] = [
  {
    id: "reception",
    label: "Empfang",
    voice: "female-de",
    scenario:
      "Sie spielen den Empfang einer Liegenschaftsverwaltung: Anrufe freundlich entgegennehmen, Anliegen klären und gezielt weiterleiten.",
  },
  {
    id: "appointment",
    label: "Terminvereinbarung",
    voice: "female-de",
    scenario:
      "Sie buchen Besichtigungs- oder Service-Termine: Datum, Uhrzeit und Kontaktdaten erfassen und bestätigen.",
  },
  {
    id: "lead",
    label: "Lead-Qualifizierung",
    voice: "female-de",
    scenario:
      "Sie qualifizieren Interessenten für Mietobjekte: Bedarf, Budget, Einzugsdatum und Kontaktdaten strukturiert erfassen.",
  },
  {
    id: "service",
    label: "Kundenservice",
    voice: "male-ch",
    scenario:
      "Sie beantworten Mieteranfragen zu Miete, Nebenkosten und Hausordnung — klar, geduldig und lösungsorientiert.",
  },
  {
    id: "collections",
    label: "Mahnwesen",
    voice: "female-de",
    scenario:
      "Sie führen höfliche Zahlungserinnerungen für offene Posten — sachlich, respektvoll und ohne Druck.",
  },
  {
    id: "survey",
    label: "Umfrage",
    voice: "male-ch",
    scenario:
      "Sie führen eine kurze Zufriedenheitsumfrage zu Service und Reaktionszeit — freundlich und prägnant.",
  },
];

export function getDemoUseCase(id: string): DemoUseCase {
  return DEMO_USE_CASES.find((c) => c.id === id) ?? DEMO_USE_CASES[0];
}

export function buildDemoOutboundGreeting(name: string, useCase: DemoUseCase): string {
  const salutation = name.trim() ? `Guten Tag ${name.trim()}` : "Guten Tag";
  return `${salutation}, hier ist Cura — Ihr KI-Telefonagent. Sie haben eine Live-Demo im Bereich «${useCase.label}» angefordert. Haben Sie kurz Zeit? Ich zeige Ihnen, wie natürlich unsere Gespräche klingen.`;
}
