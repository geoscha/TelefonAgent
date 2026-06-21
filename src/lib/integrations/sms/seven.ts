import "server-only";

import type { SmsConnection } from "@/lib/integrations/sms/store";

const SEVEN_BASE = "https://gateway.seven.io/api";

export async function sevenSmsConnect(
  apiKey: string,
  senderName?: string
): Promise<Partial<SmsConnection>> {
  const key = apiKey.trim();
  const sender = senderName?.trim();

  if (!key) {
    throw new Error("Bitte den Seven.io API-Schlüssel angeben.");
  }

  const response = await fetch(`${SEVEN_BASE}/balance`, {
    headers: {
      "X-Api-Key": key,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("API-Schlüssel ungültig.");
  }
  if (!response.ok) {
    throw new Error(`Seven.io-Verbindung fehlgeschlagen (${response.status}).`);
  }

  const data = (await response.json()) as { amount?: number; currency?: string };
  const balance =
    data.amount !== undefined
      ? `${data.amount} ${data.currency ?? "EUR"}`
      : "Seven.io";

  return {
    connected: true,
    password: key,
    senderId: sender || undefined,
    accountLabel: sender ? `${sender} · ${balance}` : balance,
    connectedAt: new Date().toISOString(),
  };
}

export async function sevenSendSms(
  connection: SmsConnection,
  to: string,
  body: string
): Promise<{ id: string }> {
  if (!connection.password) {
    throw new Error("Seven.io-Verbindung ist unvollständig.");
  }

  const payload: Record<string, string> = {
    to: to.trim(),
    text: body,
  };
  if (connection.senderId) {
    payload.from = connection.senderId;
  }

  const response = await fetch(`${SEVEN_BASE}/sms`, {
    method: "POST",
    headers: {
      "X-Api-Key": connection.password,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Seven.io SMS fehlgeschlagen (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    messages?: Array<{ id?: string }>;
    id?: string;
  };
  const id = data.messages?.[0]?.id ?? data.id;
  if (!id) throw new Error("Seven.io hat keine Nachrichten-ID zurückgegeben.");
  return { id };
}
