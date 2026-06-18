const COOKIE_NAME = "admin_session";
const SESSION_HOURS = 8;

function sessionSecret(): string {
  // TODO: vor Produktion ADMIN_SESSION_SECRET setzen (min. 32 Zeichen).
  return (
    process.env.ADMIN_SESSION_SECRET?.trim() ||
    "dev-admin-session-secret-change-me"
  );
}

export { COOKIE_NAME, SESSION_HOURS };

interface SessionPayload {
  sub: "admin";
  exp: number;
}

function decodePayload(raw: string): SessionPayload | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as SessionPayload;
    if (parsed.sub !== "admin" || typeof parsed.exp !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Verifies token; safe for Edge middleware and Node. */
export async function verifyAdminSessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const [payloadStr, sig] = token.split(".");
  if (!payloadStr || !sig) return false;

  const valid = await verifyHmac(payloadStr, sig, sessionSecret());
  if (!valid) return false;

  const payload = decodePayload(payloadStr);
  if (!payload) return false;
  return payload.exp > Date.now();
}

async function verifyHmac(
  payloadStr: string,
  sig: string,
  secret: string
): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const sigBytes = base64UrlToBytes(sig);
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    enc.encode(payloadStr)
  );
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function adminSessionCookieOptions(maxAge = SESSION_HOURS * 3600) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function clearAdminSessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
}
