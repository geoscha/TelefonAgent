import "server-only";

import type { SmsConnection } from "@/lib/integrations/sms/store";

const ASPSMS_BASE = "https://http.aspsms.com/http/script.asp";

function normalizeE164(input: string): string {
  let value = input.trim().replace(/\s+/g, "");
  if (!value) return "";
  if (!value.startsWith("+")) {
    if (value.startsWith("00")) value = value.slice(2);
    else if (value.startsWith("0")) value = `41${value.slice(1)}`;
    else if (!value.startsWith("41")) value = `41${value}`;
  } else {
    value = value.slice(1);
  }
  return value.replace(/\D/g, "");
}

async function aspsmsRequest(params: Record<string, string>): Promise<string> {
  const url = new URL(ASPSMS_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`ASPSMS-Anfrage fehlgeschlagen (${response.status}).`);
  }
  return (await response.text()).trim();
}

export async function aspsmsConnect(
  userkey: string,
  password: string,
  originator: string
): Promise<Partial<SmsConnection>> {
  const key = userkey.trim();
  const pass = password.trim();
  const sender = originator.trim().slice(0, 11);

  if (!key || !pass) {
    throw new Error("Bitte Userkey und Passwort angeben.");
  }
  if (!sender) {
    throw new Error("Bitte einen Originator (Absender) angeben.");
  }

  const credits = await aspsmsRequest({
    Userkey: key,
    Password: pass,
    Action: "CheckCredits",
  });

  if (!/^\d+$/.test(credits)) {
    throw new Error(
      credits.includes("Error")
        ? "ASPSMS-Zugangsdaten ungültig."
        : "ASPSMS-Guthaben konnte nicht geprüft werden."
    );
  }

  return {
    connected: true,
    username: key,
    password: pass,
    senderId: sender,
    accountLabel: `${sender} · ${credits} Credits`,
    connectedAt: new Date().toISOString(),
  };
}

export async function aspsmsSendSms(
  connection: SmsConnection,
  to: string,
  body: string
): Promise<{ id: string }> {
  if (!connection.username || !connection.password || !connection.senderId) {
    throw new Error("ASPSMS-Verbindung ist unvollständig.");
  }

  const result = await aspsmsRequest({
    Userkey: connection.username,
    Password: connection.password,
    Action: "SendTextSMS",
    Originators: connection.senderId,
    Recipients: normalizeE164(to),
    MessageBody: body,
  });

  if (!result || result.toLowerCase().includes("error")) {
    throw new Error(`ASPSMS SMS fehlgeschlagen: ${result}`);
  }

  return { id: result };
}
