/** Normalise to E.164-ish for matching (+digits only). */
export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+41" + digits.slice(1);
  return "+" + digits;
}
