import "server-only";

import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

/** Hashes an admin code for storage (scrypt + random salt). */
export function hashAdminCode(code: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(code, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

/** Constant-time comparison against a stored scrypt hash. */
export function verifyAdminCode(code: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  try {
    const hash = scryptSync(code, salt, 32).toString("hex");
    return timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
  } catch {
    return false;
  }
}

/** Default dev credentials — override via ADMIN_USER / ADMIN_CODE in .env.local. */
export function envAdminCredentials(): { username: string; code: string } {
  // TODO: vor Produktion durch echte Auth ersetzen (z. B. SSO / MFA).
  return {
    username: process.env.ADMIN_USER?.trim() || "a",
    code: process.env.ADMIN_CODE?.trim() || "123456",
  };
}
