import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/** Default region for bare/local numbers in Swiss property management. */
export const DEFAULT_PHONE_REGION: CountryCode = "CH";

/**
 * Strict E.164 (+41…) via libphonenumber-js. Returns null when the value is
 * empty or not a VALID phone number.
 *
 * CRITICAL: the exact same function is used when mirroring customer contacts
 * AND when looking up an incoming caller — otherwise numbers will not match.
 * This is intentionally separate from {@link normalizePhoneNumber}, whose
 * lenient behaviour the telephony/provisioning code relies on.
 */
export function toE164(
  value: string | null | undefined,
  region: CountryCode = DEFAULT_PHONE_REGION
): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const parsed = parsePhoneNumberFromString(raw, region);
  if (parsed && parsed.isValid()) return parsed.number; // E.164, e.g. +41441234567
  return null;
}

/**
 * Lenient normalisation to a "+digits" form. Used across telephony/provisioning
 * flows that accept best-effort numbers — do not tighten without auditing all
 * call sites. For contact matching prefer {@link toE164}.
 */
export function normalizePhoneNumber(value: string): string {
  const digits = value.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return "+" + digits.slice(2);
  if (digits.startsWith("0")) return "+41" + digits.slice(1);
  return "+" + digits;
}
