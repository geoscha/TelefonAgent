import "server-only";

import type { MailConnection } from "@/lib/integrations/mail/store";

const AUTH_URL =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "User.Read",
  "Mail.ReadWrite",
];

export function outlookAuthUrl(state: string, redirectUriValue: string): string {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
    redirect_uri: redirectUriValue,
    response_type: "code",
    scope: SCOPES.join(" "),
    response_mode: "query",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function outlookExchangeCode(
  code: string,
  redirectUriValue: string
): Promise<Partial<MailConnection>> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.MICROSOFT_CLIENT_ID ?? "",
      client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
      redirect_uri: redirectUriValue,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Outlook Token-Austausch fehlgeschlagen: ${await res.text()}`
    );
  }
  const tok = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
  };
  const email = await outlookEmail(tok.access_token);
  return {
    connected: true,
    accountLabel: email,
    accessToken: tok.access_token,
    refreshToken: tok.refresh_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
    connectedAt: new Date().toISOString(),
  };
}

async function outlookEmail(
  accessToken: string
): Promise<string | undefined> {
  try {
    const r = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return undefined;
    const j = (await r.json()) as {
      mail?: string;
      userPrincipalName?: string;
    };
    return j.mail ?? j.userPrincipalName;
  } catch {
    return undefined;
  }
}
