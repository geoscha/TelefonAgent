export type FinanceVendorCategory =
  | "telephony"
  | "ai"
  | "infrastructure"
  | "payments";

export type FinanceVendorDataSource = "api" | "estimate" | "manual" | "unconfigured";

export interface FinanceVendorEntry {
  id: string;
  name: string;
  provider: string;
  category: FinanceVendorCategory;
  categoryLabel: string;
  monthlyCostChf: number;
  balanceLabel?: string;
  balanceValue?: string;
  dataSource: FinanceVendorDataSource;
  configured: boolean;
  error?: string;
  sharePct: number;
  billingHint: string;
  settingsHint?: string;
}

export interface InfrastructureCostConfig {
  vercelMonthlyChf: number;
  supabaseMonthlyChf: number;
  azureMonthlyChf: number;
  gcpMonthlyChf: number;
  cloudflareMonthlyChf: number;
  otherMonthlyChf: number;
}

const CATEGORY_LABELS: Record<FinanceVendorCategory, string> = {
  telephony: "Telefonie & SMS",
  ai: "KI & Sprache",
  infrastructure: "Cloud & Infrastruktur",
  payments: "Zahlungen",
};

export function groupVendorsByCategory(
  vendors: FinanceVendorEntry[]
): Array<{
  category: FinanceVendorCategory;
  label: string;
  totalChf: number;
  vendors: FinanceVendorEntry[];
}> {
  const order: FinanceVendorCategory[] = [
    "telephony",
    "ai",
    "infrastructure",
    "payments",
  ];

  return order
    .map((category) => {
      const items = vendors.filter((vendor) => vendor.category === category);
      return {
        category,
        label: CATEGORY_LABELS[category],
        totalChf: items
          .filter((item) => item.id !== "stripe")
          .reduce((sum, item) => sum + item.monthlyCostChf, 0),
        vendors: items,
      };
    })
    .filter((group) => group.vendors.length > 0);
}
