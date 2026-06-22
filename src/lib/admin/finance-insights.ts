export interface CostSlice {
  key: string;
  label: string;
  amountChf: number;
  sharePct: number;
}

export interface FinanceAlert {
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  action?: string;
}

export interface ExecutiveBriefing {
  headline: string;
  summary: string;
  marginPct: number;
  profitChf: number;
  revenueChf: number;
  costChf: number;
  profitDeltaChf: number | null;
  costSlices: CostSlice[];
  alerts: FinanceAlert[];
}

interface BriefingInput {
  mrrChf: number;
  monthlyProfitChf: number;
  monthlyCostChf: number;
  twilioCostChf: number;
  elevenLabsCostChf: number;
  openAiCostChf: number;
  infrastructureCostChf: number;
  unusedNumbers: number;
  totalNumbers: number;
  unusedNumberCostChf: number;
  costPerUserChf: number;
  userValueChf: number;
  retentionPct: number;
  totalCustomersEver: number;
  activeUsers30d: number;
  profitDeltaChf: number | null;
  revenueDeltaChf: number | null;
  stripeConfigured: boolean;
}

export function buildExecutiveBriefing(input: BriefingInput): ExecutiveBriefing {
  const revenueChf = input.mrrChf;
  const costChf = input.monthlyCostChf;
  const profitChf = input.monthlyProfitChf;
  const marginPct =
    revenueChf > 0 ? (profitChf / revenueChf) * 100 : profitChf < 0 ? -100 : 0;

  const costSlices = buildCostSlices(
    costChf,
    input.twilioCostChf,
    input.elevenLabsCostChf,
    input.openAiCostChf,
    input.infrastructureCostChf
  );

  const alerts = buildAlerts(input, costSlices, marginPct, profitChf);
  const { headline, summary } = buildNarrative(
    input,
    marginPct,
    profitChf,
    costSlices,
    alerts
  );

  return {
    headline,
    summary,
    marginPct,
    profitChf,
    revenueChf,
    costChf,
    profitDeltaChf: input.profitDeltaChf,
    costSlices,
    alerts,
  };
}

function buildCostSlices(
  total: number,
  twilio: number,
  elevenLabs: number,
  openAi: number,
  infrastructure: number
): CostSlice[] {
  const base = Math.max(total, 0.01);
  const slices: CostSlice[] = [
    { key: "twilio", label: "Twilio", amountChf: twilio, sharePct: (twilio / base) * 100 },
    {
      key: "elevenlabs",
      label: "ElevenLabs",
      amountChf: elevenLabs,
      sharePct: (elevenLabs / base) * 100,
    },
    { key: "openai", label: "OpenAI", amountChf: openAi, sharePct: (openAi / base) * 100 },
  ];

  if (infrastructure > 0) {
    slices.push({
      key: "infrastructure",
      label: "Cloud & Infrastruktur",
      amountChf: infrastructure,
      sharePct: (infrastructure / base) * 100,
    });
  }

  return slices.sort((a, b) => b.amountChf - a.amountChf);
}

function buildAlerts(
  input: BriefingInput,
  slices: CostSlice[],
  marginPct: number,
  profitChf: number
): FinanceAlert[] {
  const alerts: FinanceAlert[] = [];

  if (!input.stripeConfigured) {
    alerts.push({
      severity: "high",
      title: "Umsatz unsichtbar",
      detail: "Stripe ist nicht verbunden — MRR und Gewinn sind unvollständig.",
      action: "Stripe unter Einstellungen verbinden",
    });
  }

  if (profitChf < 0) {
    alerts.push({
      severity: "high",
      title: "Monatlicher Verlust",
      detail: `Kosten übersteigen Umsatz um CHF ${Math.abs(profitChf).toLocaleString("de-CH", { maximumFractionDigits: 0 })}.`,
      action: "Kostenblock prüfen oder Preise/Plan anpassen",
    });
  } else if (marginPct < 20 && input.mrrChf > 0) {
    alerts.push({
      severity: "medium",
      title: "Dünne Marge",
      detail: `Nur ${marginPct.toFixed(0)}% vom Umsatz bleiben nach variablen Kosten.`,
      action: "Grössten Kostenblock senken oder ARPU erhöhen",
    });
  }

  const top = slices[0];
  if (top && top.sharePct >= 45 && top.amountChf > 0) {
    alerts.push({
      severity: top.sharePct >= 60 ? "high" : "medium",
      title: `${top.label} dominiert die Kosten`,
      detail: `${top.sharePct.toFixed(0)}% aller monatlichen Ausgaben (${top.amountChf.toFixed(0)} CHF).`,
      action:
        top.key === "twilio"
          ? "Ungenutzte Nummern freigeben"
          : top.key === "elevenlabs"
            ? "Gesprächsdauer und Minutenpreis prüfen"
            : top.key === "infrastructure"
              ? "Cloud-Kosten in Vercel-Env pflegen"
              : "Enrichment-Nutzung optimieren",
    });
  }

  if (input.unusedNumbers > 0 && input.unusedNumberCostChf > 0) {
    alerts.push({
      severity: input.unusedNumbers >= 3 ? "high" : "medium",
      title: "Leerstand bei Nummern",
      detail: `${input.unusedNumbers} ungenutzte Nummern kosten ca. CHF ${input.unusedNumberCostChf.toFixed(0)}/Mt.`,
      action: "Nummern-Pool unter Admin → Nummern bereinigen",
    });
  }

  if (
    input.totalCustomersEver > 0 &&
    input.costPerUserChf > input.userValueChf &&
    input.userValueChf > 0
  ) {
    alerts.push({
      severity: "high",
      title: "Unit Economics negativ",
      detail: `CHF ${input.costPerUserChf.toFixed(2)} Kosten/Kunde vs. CHF ${input.userValueChf.toFixed(2)} Umsatz/Kunde.`,
      action: "Churn senken oder Paketpreis erhöhen",
    });
  }

  if (input.retentionPct < 40 && input.totalCustomersEver >= 5) {
    alerts.push({
      severity: "medium",
      title: "Schwache Aktivierung",
      detail: `Nur ${input.retentionPct.toFixed(0)}% der Kunden waren in 30 Tagen aktiv.`,
      action: "Onboarding und Nutzen früher sichtbar machen",
    });
  }

  if (
    input.profitDeltaChf != null &&
    input.profitDeltaChf < 0 &&
    Math.abs(input.profitDeltaChf) > input.monthlyCostChf * 0.1
  ) {
    alerts.push({
      severity: "medium",
      title: "Ergebnis verschlechtert",
      detail: `Gewinn gegenüber Vormonat um CHF ${Math.abs(input.profitDeltaChf).toFixed(0)} tiefer.`,
    });
  }

  return alerts.slice(0, 5);
}

function buildNarrative(
  input: BriefingInput,
  marginPct: number,
  profitChf: number,
  slices: CostSlice[],
  alerts: FinanceAlert[]
): { headline: string; summary: string } {
  const top = slices[0];
  const delta =
    input.profitDeltaChf != null
      ? input.profitDeltaChf >= 0
        ? `+CHF ${input.profitDeltaChf.toFixed(0)} vs. Vormonat`
        : `−CHF ${Math.abs(input.profitDeltaChf).toFixed(0)} vs. Vormonat`
      : null;

  if (!input.stripeConfigured && input.monthlyCostChf > 0) {
    return {
      headline: "Kosten laufen — Umsatz fehlt im Bild",
      summary: `Variable Kosten von CHF ${input.monthlyCostChf.toFixed(0)}/Mt., vor allem ${top?.label ?? "Infrastruktur"}. Ohne Stripe siehst du nicht, ob das Geschäft tragfähig ist.`,
    };
  }

  if (profitChf < 0) {
    return {
      headline: "Aktuell Verlustgeschäft",
      summary: `Du verbrennst CHF ${Math.abs(profitChf).toFixed(0)} pro Monat bei CHF ${input.mrrChf.toFixed(0)} Umsatz. Grösster Hebel: ${top?.label ?? "Kosten"} (${top?.sharePct.toFixed(0) ?? "—"}% der Kosten).${delta ? ` ${delta}.` : ""}`,
    };
  }

  if (marginPct >= 50) {
    return {
      headline: "Gesundes Ergebnis",
      summary: `CHF ${profitChf.toFixed(0)} Gewinn bei ${marginPct.toFixed(0)}% Marge. ${input.activeUsers30d} aktive Kunden in 30 Tagen.${delta ? ` ${delta}.` : ""} ${alerts.length > 0 ? "Trotzdem ein paar Hebel offen — siehe Handlungsfelder." : ""}`,
    };
  }

  return {
    headline: profitChf > 0 ? "Profitabel, aber eng" : "Break-even Zone",
    summary: `CHF ${profitChf.toFixed(0)} Ergebnis bei ${marginPct.toFixed(0)}% Marge. ${top ? `${top.label} frisst ${top.sharePct.toFixed(0)}% der Kosten` : "Kosten prüfen"}.${delta ? ` ${delta}.` : ""}`,
  };
}
