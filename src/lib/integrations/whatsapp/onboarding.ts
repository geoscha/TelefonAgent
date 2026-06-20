import "server-only";

import { createHash, randomInt } from "node:crypto";

import { isWhatsAppCloudConfigured } from "@/lib/integrations/whatsapp/config";
import {
  formatWhatsAppNumberDisplay,
  isValidWhatsAppNumber,
  parseWhatsAppNumber,
} from "@/lib/integrations/whatsapp/number";
import { createClient, requireUserId } from "@/lib/supabase/server";

const VERIFICATION_TTL_MS = 15 * 60 * 1000;

function hashVerificationCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function normalizePairingInput(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

function generatePairingCode(): string {
  const suffix = String(randomInt(1000, 9999));
  return `CURA-${suffix}`;
}

export function whatsappVerificationStubEnabled(): boolean {
  return process.env.WHATSAPP_VERIFY_STUB !== "false";
}

async function findMatchingCuraPhoneId(
  userId: string,
  whatsappNumber: string
): Promise<string | undefined> {
  const supabase = createClient();
  const { data } = await supabase
    .from("user_phone_numbers")
    .select("id, phone_number")
    .eq("user_id", userId);

  const match = (data ?? []).find(
    (row) => parseWhatsAppNumber(row.phone_number as string) === whatsappNumber
  );

  return match?.id as string | undefined;
}

export async function startWhatsAppPairing(input: {
  whatsappNumber: string;
}): Promise<{
  connectionId: string;
  normalizedNumber: string;
  displayNumber: string;
  pairingCode: string;
  matchedCuraPhone: boolean;
  steps: string[];
}> {
  const userId = await requireUserId();

  if (!isValidWhatsAppNumber(input.whatsappNumber)) {
    throw new Error("Bitte eine gültige WhatsApp-Nummer eingeben.");
  }

  const normalizedNumber = parseWhatsAppNumber(input.whatsappNumber);
  const displayNumber = formatWhatsAppNumberDisplay(normalizedNumber);
  const supabase = createClient();

  const { data: ownConnection } = await supabase
    .from("whatsapp_connections")
    .select("id, connected")
    .eq("user_id", userId)
    .eq("whatsapp_number", normalizedNumber)
    .maybeSingle();

  if (ownConnection?.connected) {
    throw new Error("Diese WhatsApp-Nummer ist bereits verbunden.");
  }

  const { data: foreignConnection } = await supabase
    .from("whatsapp_connections")
    .select("id")
    .neq("user_id", userId)
    .eq("whatsapp_number", normalizedNumber)
    .eq("connected", true)
    .maybeSingle();

  if (foreignConnection) {
    throw new Error(
      "Diese WhatsApp-Nummer ist bereits mit einem anderen Cura-Konto verbunden."
    );
  }

  const { data: otherConnected } = await supabase
    .from("whatsapp_connections")
    .select("id, whatsapp_number")
    .eq("user_id", userId)
    .eq("connected", true)
    .neq("whatsapp_number", normalizedNumber)
    .maybeSingle();

  if (otherConnected) {
    throw new Error(
      "Sie haben bereits ein WhatsApp-Profil verbunden. Trennen Sie es zuerst in Ihrem Profil, bevor Sie eine andere Nummer verknüpfen."
    );
  }

  const pairingCode = generatePairingCode();
  const matchedCuraPhoneId = await findMatchingCuraPhoneId(
    userId,
    normalizedNumber
  );

  const { data, error } = await supabase
    .from("whatsapp_connections")
    .upsert(
      {
        user_id: userId,
        whatsapp_number: normalizedNumber,
        phone_number_id: matchedCuraPhoneId ?? null,
        account_type: "personal",
        account_registered: true,
        connected: false,
        onboarding_status: "pending_pairing",
        pairing_code: pairingCode,
        verification_code_hash: null,
        verification_expires_at: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,whatsapp_number" }
    )
    .select("id")
    .single();

  if (error || !data) {
    throw new Error("WhatsApp-Verbindung konnte nicht gestartet werden.");
  }

  return {
    connectionId: data.id as string,
    normalizedNumber,
    displayNumber,
    pairingCode,
    matchedCuraPhone: Boolean(matchedCuraPhoneId),
    steps: buildPairingSteps(displayNumber, pairingCode),
  };
}

export function buildPairingSteps(
  displayNumber: string,
  pairingCode: string
): string[] {
  return [
    `Öffnen Sie WhatsApp auf dem Telefon mit der Nummer ${displayNumber}.`,
    "Tippen Sie auf ⋮ (Android) oder Einstellungen (iPhone) → Verknüpfte Geräte.",
    "Wählen Sie «Gerät hinzufügen» → «Stattdessen mit Telefonnummer verknüpfen».",
    `Geben Sie den Cura-Code ein: ${pairingCode}`,
    "Bestätigen Sie die Verknüpfung auf Ihrem Telefon.",
  ];
}

export async function confirmWhatsAppPairing(input: {
  connectionId: string;
  pairingCode: string;
}): Promise<{ verificationRequired: boolean; devVerificationCode?: string }> {
  const userId = await requireUserId();
  const supabase = createClient();
  const entered = normalizePairingInput(input.pairingCode);
  const stub = whatsappVerificationStubEnabled();

  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .select("id, pairing_code, onboarding_status, connected")
    .eq("user_id", userId)
    .eq("id", input.connectionId)
    .maybeSingle();

  if (error || !connection) {
    throw new Error("Verbindung nicht gefunden.");
  }

  if (connection.connected) {
    return { verificationRequired: false };
  }

  const expected = normalizePairingInput((connection.pairing_code as string) ?? "");
  if (!expected || entered !== expected) {
    throw new Error("Der Cura-Code ist ungültig. Bitte erneut eingeben.");
  }

  if (stub && !isWhatsAppCloudConfigured()) {
    await supabase
      .from("whatsapp_connections")
      .update({
        connected: true,
        onboarding_status: "connected",
        connected_at: new Date().toISOString(),
        pairing_code: null,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .eq("id", input.connectionId);

    return { verificationRequired: false };
  }

  const code = String(randomInt(100000, 999999));
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MS).toISOString();

  await supabase
    .from("whatsapp_connections")
    .update({
      onboarding_status: "pending_verification",
      verification_code_hash: hashVerificationCode(code),
      verification_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", input.connectionId);

  if (process.env.NODE_ENV !== "production") {
    console.info(`[whatsapp/pairing] Bestätigungscode: ${code}`);
  }

  return {
    verificationRequired: true,
    devVerificationCode:
      process.env.NODE_ENV !== "production" ? code : undefined,
  };
}

export async function verifyWhatsAppConnection(input: {
  connectionId: string;
  code: string;
}): Promise<void> {
  const userId = await requireUserId();
  const supabase = createClient();
  const trimmedCode = input.code.trim();

  if (!/^\d{6}$/.test(trimmedCode)) {
    throw new Error("Bitte den 6-stelligen Code eingeben.");
  }

  const { data: connection, error } = await supabase
    .from("whatsapp_connections")
    .select(
      "id, verification_code_hash, verification_expires_at, onboarding_status, connected"
    )
    .eq("user_id", userId)
    .eq("id", input.connectionId)
    .maybeSingle();

  if (error || !connection) {
    throw new Error("Verbindung nicht gefunden.");
  }

  if (connection.connected && connection.onboarding_status === "connected") {
    return;
  }

  const expiresAt = connection.verification_expires_at
    ? new Date(connection.verification_expires_at).getTime()
    : 0;

  if (!connection.verification_code_hash || Date.now() > expiresAt) {
    throw new Error("Der Code ist abgelaufen. Bitte erneut verbinden.");
  }

  if (hashVerificationCode(trimmedCode) !== connection.verification_code_hash) {
    throw new Error("Der Code ist ungültig.");
  }

  const { error: updateError } = await supabase
    .from("whatsapp_connections")
    .update({
      connected: true,
      onboarding_status: "connected",
      connected_at: new Date().toISOString(),
      pairing_code: null,
      verification_code_hash: null,
      verification_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", input.connectionId);

  if (updateError) {
    throw new Error("Verifizierung fehlgeschlagen.");
  }
}
