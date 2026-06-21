import "server-only";

import type { SmsConnection } from "@/lib/integrations/sms/store";

const TWILIO_BASE = "https://api.twilio.com/2010-04-01";

function normalizeE164(input: string): string {
  let value = input.trim().replace(/\s+/g, "");
  if (!value) return "";
  if (!value.startsWith("+")) {
    if (value.startsWith("00")) value = `+${value.slice(2)}`;
    else if (value.startsWith("0")) value = `+41${value.slice(1)}`;
    else value = `+${value}`;
  }
  return value;
}

export async function twilioSmsConnect(
  accountSid: string,
  authToken: string,
  fromNumber: string
): Promise<Partial<SmsConnection>> {
  const sid = accountSid.trim();
  const token = authToken.trim();
  const sender = normalizeE164(fromNumber);

  if (!sid.startsWith("AC") || sid.length !== 34) {
    throw new Error("Bitte eine gültige Twilio Account SID angeben.");
  }
  if (!token) {
    throw new Error("Bitte den Auth Token angeben.");
  }
  if (!sender) {
    throw new Error("Bitte die Absender-Nummer im E.164-Format angeben (z. B. +4179…).");
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const response = await fetch(`${TWILIO_BASE}/Accounts/${sid}.json`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: "no-store",
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("Account SID oder Auth Token ungültig.");
  }
  if (!response.ok) {
    throw new Error(`Twilio-Verbindung fehlgeschlagen (${response.status}).`);
  }

  const data = (await response.json()) as { friendly_name?: string };

  return {
    connected: true,
    username: sid,
    password: token,
    senderId: sender,
    accountLabel: `${data.friendly_name ?? "Twilio"} · ${sender}`,
    connectedAt: new Date().toISOString(),
  };
}

export async function twilioSendSms(
  connection: SmsConnection,
  to: string,
  body: string
): Promise<{ sid: string }> {
  if (!connection.username || !connection.password || !connection.senderId) {
    throw new Error("Twilio-Verbindung ist unvollständig.");
  }

  const recipient = normalizeE164(to);
  const auth = Buffer.from(
    `${connection.username}:${connection.password}`
  ).toString("base64");

  const response = await fetch(
    `${TWILIO_BASE}/Accounts/${connection.username}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: connection.senderId,
        To: recipient,
        Body: body,
      }),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Twilio SMS fehlgeschlagen (${response.status}): ${detail}`);
  }

  const data = (await response.json()) as { sid?: string };
  if (!data.sid) throw new Error("Twilio hat keine Message-SID zurückgegeben.");
  return { sid: data.sid };
}
