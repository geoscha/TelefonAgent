import "server-only";

import { formatChf } from "@/lib/billing/billing-history-format";
import { formatTokenCount } from "@/lib/billing/quota-display";
import { sendEmail } from "@/lib/email/send";

export interface TokenPurchaseReceiptInput {
  to: string;
  customerName?: string;
  tokens: number;
  priceChf: number;
  packLabel?: string;
  purchasedAt: string;
  referenceId: string;
  receiptUrl?: string | null;
}

function formatPurchaseDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildTokenPurchaseReceiptHtml(input: TokenPurchaseReceiptInput): string {
  const name = input.customerName?.trim();
  const greeting = name ? `Guten Tag ${escapeHtml(name)}` : "Guten Tag";
  const tokenLabel = escapeHtml(formatTokenCount(input.tokens));
  const priceLabel = escapeHtml(formatChf(input.priceChf));
  const dateLabel = escapeHtml(formatPurchaseDate(input.purchasedAt));
  const packLine = input.packLabel
    ? `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #E1E4EA;color:#525866;font-size:13px;">Paket</td>
        <td style="padding:10px 0;border-bottom:1px solid #E1E4EA;color:#0E121B;font-size:13px;text-align:right;">${escapeHtml(input.packLabel)}</td>
      </tr>`
    : "";
  const receiptBlock = input.receiptUrl
    ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.5;color:#525866;">
        <a href="${escapeHtml(input.receiptUrl)}" style="color:#050f1f;text-decoration:underline;">Stripe-Beleg öffnen</a>
      </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="de">
  <body style="margin:0;padding:0;background:#F5F7FA;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F7FA;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#ffffff;border:1px solid #E1E4EA;border-radius:4px;overflow:hidden;">
            <tr>
              <td style="background:#050f1f;padding:28px 32px;">
                <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:36px;line-height:1;font-weight:500;letter-spacing:-0.03em;color:#ffffff;">Cura</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <p style="margin:0 0 8px;font-size:15px;line-height:1.5;color:#0E121B;">${greeting},</p>
                <p style="margin:0 0 24px;font-size:13px;line-height:1.6;color:#525866;">
                  vielen Dank für Ihren Kauf. Ihr Token-Guthaben wurde soeben gutgeschrieben.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #E1E4EA;">
                  ${packLine}
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #E1E4EA;color:#525866;font-size:13px;">Tokens</td>
                    <td style="padding:10px 0;border-bottom:1px solid #E1E4EA;color:#0E121B;font-size:13px;text-align:right;">${tokenLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;border-bottom:1px solid #E1E4EA;color:#525866;font-size:13px;">Betrag</td>
                    <td style="padding:10px 0;border-bottom:1px solid #E1E4EA;color:#0E121B;font-size:15px;text-align:right;font-weight:400;">CHF ${priceLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 0;color:#525866;font-size:13px;">Datum</td>
                    <td style="padding:10px 0;color:#0E121B;font-size:13px;text-align:right;">${dateLabel}</td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:11px;line-height:1.5;color:#99A0AE;">
                  Referenz: ${escapeHtml(input.referenceId)}
                </p>
                ${receiptBlock}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildTokenPurchaseReceiptText(input: TokenPurchaseReceiptInput): string {
  const name = input.customerName?.trim();
  const greeting = name ? `Guten Tag ${name}` : "Guten Tag";
  const lines = [
    greeting + ",",
    "",
    "vielen Dank für Ihren Kauf. Ihr Token-Guthaben wurde soeben gutgeschrieben.",
    "",
    input.packLabel ? `Paket: ${input.packLabel}` : undefined,
    `Tokens: ${formatTokenCount(input.tokens)}`,
    `Betrag: CHF ${formatChf(input.priceChf)}`,
    `Datum: ${formatPurchaseDate(input.purchasedAt)}`,
    `Referenz: ${input.referenceId}`,
    input.receiptUrl ? `Beleg: ${input.receiptUrl}` : undefined,
  ].filter(Boolean);

  return lines.join("\n");
}

export async function sendTokenPurchaseReceiptEmail(
  input: TokenPurchaseReceiptInput
): Promise<{ ok: boolean; skipped?: boolean }> {
  const result = await sendEmail({
    to: input.to,
    subject: `Vielen Dank — ${formatTokenCount(input.tokens)} Tokens`,
    html: buildTokenPurchaseReceiptHtml(input),
    text: buildTokenPurchaseReceiptText(input),
  });

  return { ok: result.ok, skipped: result.skipped };
}
