/** Client-safe billing history formatting (no server-only imports). */

import { getTokenPack } from "@/lib/billing/quota-display";

export const TOKENS_PER_CHF = 1000;

export interface BillingTransactionRow {
  id: string;
  createdAt: string;
  amount: number;
  balanceAfter: number;
  source: string;
  referenceId: string | null;
  metadata: Record<string, unknown>;
}

export interface BillingPurchaseEntry {
  id: string;
  createdAt: string;
  label: string;
  purchasedChf: number;
}

const TOPUP_SOURCES = new Set(["stripe_topup", "admin_topup"]);

export function tokensToChf(tokens: number): number {
  return Math.round((tokens / TOKENS_PER_CHF) * 100) / 100;
}

export function formatChf(amount: number): string {
  return amount.toLocaleString("de-CH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function isTokenPurchaseSource(source: string): boolean {
  return TOPUP_SOURCES.has(source);
}

export function topupChfFromTransaction(tx: BillingTransactionRow): number {
  if (tx.amount <= 0 || !isTokenPurchaseSource(tx.source)) return 0;

  if (tx.source === "stripe_topup") {
    const cents = Number(tx.metadata.amountTotal);
    if (Number.isFinite(cents) && cents > 0) return cents / 100;
  }

  if (tx.source === "admin_topup") {
    const packId = typeof tx.metadata.packId === "string" ? tx.metadata.packId : undefined;
    const pack = packId ? getTokenPack(packId) : undefined;
    if (pack) return pack.priceChf;
  }

  return tokensToChf(tx.amount);
}

function formatPurchaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Individual token purchases, newest first. */
export function listTokenPurchases(
  transactions: BillingTransactionRow[]
): BillingPurchaseEntry[] {
  return transactions
    .map((tx) => {
      if (tx.amount <= 0 || !isTokenPurchaseSource(tx.source)) return null;

      const purchasedChf = topupChfFromTransaction(tx);
      if (purchasedChf <= 0) return null;

      return {
        id: tx.id,
        createdAt: tx.createdAt,
        label: formatPurchaseDate(tx.createdAt),
        purchasedChf: Math.round(purchasedChf * 100) / 100,
      };
    })
    .filter((entry): entry is BillingPurchaseEntry => entry !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function csvEscape(value: string | number): string {
  const text = String(value);
  if (/[;"\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function csvRow(cells: (string | number)[]): string {
  return cells.map(csvEscape).join(";");
}

export function billingPurchasesToCsv(purchases: BillingPurchaseEntry[]): string {
  const lines = [
    csvRow(["Datum", "Betrag (CHF)"]),
    ...purchases.map((p) => csvRow([p.label, formatChf(p.purchasedChf)])),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}

function xmlEscape(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function billingPurchasesToExcelXml(purchases: BillingPurchaseEntry[]): string {
  const rows = [
    ["Datum", "Betrag (CHF)"],
    ...purchases.map((p) => [p.label, formatChf(p.purchasedChf)]),
  ];

  const tableRows = rows
    .map(
      (cells) =>
        `<Row>${cells.map((c) => `<Cell><Data ss:Type="String">${xmlEscape(c)}</Data></Cell>`).join("")}</Row>`
    )
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Abrechnung">
  <Table>${tableRows}</Table>
 </Worksheet>
</Workbook>`;
}

export function downloadTextFile(
  content: string,
  filename: string,
  mimeType: string
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
