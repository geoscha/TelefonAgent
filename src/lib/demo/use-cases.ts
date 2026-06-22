import type { DemoVoicePresetId } from "@/lib/demo/voices";

export type DemoUseCaseId =
  | "linker"
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
  /** Linker sales demo — answers product questions instead of role-play. */
  linkerAgent?: boolean;
}

export const DEMO_USE_CASES: DemoUseCase[] = [
  {
    id: "linker",
    label: "Linker Agent",
    voice: "female-de",
    linkerAgent: true,
    scenario:
      "Sie sind der Linker-Demo-Telefonagent. Fragen Sie zuerst, ob die Person Fragen zu Linker hat, und beantworten Sie diese zu Preisen, Funktionen und Setup.",
  },
  {
    id: "reception",
    label: "Empfang",
    voice: "female-de",
    scenario:
      "Sie spielen den Empfang einer Liegenschaftsverwaltung: Anrufe freundlich entgegennehmen, Anliegen klären und gezielt weiterleiten.",
  },
  {
    id: "appointment",
    label: "Besichtigungen",
    voice: "female-de",
    scenario:
      "Sie buchen Besichtigungs- oder Service-Termine: Datum, Uhrzeit und Kontaktdaten erfassen und bestätigen.",
  },
  {
    id: "lead",
    label: "Mietinteressenten",
    voice: "female-de",
    scenario:
      "Sie qualifizieren Interessenten für Mietobjekte: Bedarf, Budget, Einzugsdatum und Kontaktdaten strukturiert erfassen.",
  },
  {
    id: "service",
    label: "Mieteranfragen",
    voice: "female-de",
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
    label: "Schadensmeldung",
    voice: "female-de",
    scenario:
      "Sie führen eine kurze Zufriedenheitsumfrage zu Service und Reaktionszeit — freundlich und prägnant.",
  },
];

export function getDemoUseCase(id: string): DemoUseCase {
  return DEMO_USE_CASES.find((c) => c.id === id) ?? DEMO_USE_CASES[0];
}

export function buildDemoOutboundGreeting(
  name: string,
  useCase: DemoUseCase
): string {
  const salutation = name.trim() ? `Guten Tag ${name.trim()}` : "Guten Tag";

  if (useCase.linkerAgent) {
    return `${salutation}, hier ist Linker. Schön, dass Sie unsere Live-Demo ausprobieren. Haben Sie Fragen zu Linker — zum Beispiel zu Preisen, Funktionen oder dem Setup? Ich beantworte sie gern.`;
  }

  return `${salutation}, hier ist Linker. Schön, dass Sie unsere Live-Demo ausprobieren — Sie haben «${useCase.label}» gewählt. Haben Sie kurz Zeit? Ich zeige Ihnen, wie angenehm unsere Gespräche klingen.`;
}
