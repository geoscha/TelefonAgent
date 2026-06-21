import "server-only";

import { getMailConnections, upsertMailConnection } from "@/lib/integrations/mail/store";
import type { MailConnection } from "@/lib/integrations/mail/store";

async function refreshGmailToken(
  connection: MailConnection
): Promise<MailConnection> {
  if (!connection.refreshToken) return connection;
  if (connection.expiresAt && connection.expiresAt > Date.now() + 60_000) {
    return connection;
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error("Gmail-Token konnte nicht erneuert werden.");
  }

  const tok = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };

  const next: MailConnection = {
    ...connection,
    accessToken: tok.access_token,
    expiresAt: Date.now() + (tok.expires_in ?? 3600) * 1000,
  };
  await upsertMailConnection("gmail", next);
  return next;
}

function buildRawEmail(input: {
  to: string;
  subject: string;
  body: string;
  from: string;
}): string {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    input.body,
  ];
  return lines.join("\r\n");
}

export async function sendGmailReply(input: {
  to: string;
  subject: string;
  body: string;
  threadId?: string;
}): Promise<void> {
  const connections = await getMailConnections();
  const gmail = connections.gmail;
  if (!gmail?.connected || !gmail.accessToken) {
    throw new Error("Gmail ist nicht verbunden.");
  }

  const refreshed = await refreshGmailToken(gmail);
  const from = refreshed.accountLabel ?? "me";
  const raw = buildRawEmail({
    to: input.to,
    subject: input.subject,
    body: input.body,
    from,
  });
  const encoded = Buffer.from(raw)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const payload: Record<string, unknown> = { raw: encoded };
  if (input.threadId) payload.threadId = input.threadId;

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${refreshed.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Gmail senden fehlgeschlagen: ${await res.text()}`);
  }
}
