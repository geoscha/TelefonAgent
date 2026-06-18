import "server-only";

import { createHmac } from "crypto";

import {
  COOKIE_NAME,
  SESSION_HOURS,
  adminSessionCookieOptions,
  clearAdminSessionCookieOptions,
} from "@/lib/admin/session-edge";

export {
  COOKIE_NAME,
  SESSION_HOURS,
  adminSessionCookieOptions,
  clearAdminSessionCookieOptions,
};
export { verifyAdminSessionToken } from "@/lib/admin/session-edge";

interface SessionPayload {
  sub: "admin";
  exp: number;
}

function sessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "dev-admin-session-secret-change-me"
  );
}

/** Creates a signed session token (Node.js API routes only). */
export function createAdminSessionToken(): string {
  const payload: SessionPayload = {
    sub: "admin",
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", sessionSecret())
    .update(payloadStr)
    .digest("base64url");
  return `${payloadStr}.${sig}`;
}
