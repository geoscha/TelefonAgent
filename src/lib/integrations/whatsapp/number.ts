import { normalizePhoneNumber } from "@/lib/phone/normalize";

const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

export function parseWhatsAppNumber(input: string): string {
  return normalizePhoneNumber(input.trim());
}

export function isValidWhatsAppNumber(input: string): boolean {
  const normalized = parseWhatsAppNumber(input);
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS;
}

export function formatWhatsAppNumberDisplay(input: string): string {
  const normalized = parseWhatsAppNumber(input);
  const digits = normalized.replace(/\D/g, "");

  if (digits.startsWith("41") && digits.length >= 11) {
    const local = digits.slice(2);
    const grouped = local.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    return `+41 ${grouped}`;
  }

  return normalized.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
}
