import "server-only";

import type { MailConnection } from "@/lib/integrations/mail/store";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export function gmailAuthUrl(state: string, redirectUriValue: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUriValue,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "select_account consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function gmailExchangeCode(
  code: string,
  redirectUriValue: string
): Promise<Partial<MailConnection>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUriValue,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Gmail Token-Austausch fehlgeschlagen: ${await res.text()}`);
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const email = await gmailEmail(tok.access_token);
  return {
    connected: true,
    accountLabel: email,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    connectedAt: new Date().toISOString(),
  };
}

async function gmailEmail(accessToken: string): Promise<string | undefined> {
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as { email?: string };
    return j.email;
  } catch {
    return undefined;
  }
}
