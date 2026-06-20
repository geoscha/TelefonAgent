import { normalizePhoneNumber } from "@/lib/phone/normalize";

export type ForwardingType = "alle" | "bedingt";

export interface ForwardingCodeEntry {
  label: string;
  code: string;
}

/** International digits for GSM codes (no +, e.g. 41715392626). */
export function normalizePhoneCode(phoneNumber: string): string {
  return normalizePhoneNumber(phoneNumber.trim()).replace(/\D/g, "");
}

/** Wipe all call forwarding (unconditional + conditional + carrier mailbox rules). */
export function forwardingResetAllCodes(): ForwardingCodeEntry[] {
  return [{ label: "Alle Weiterleitungen löschen", code: "##002#" }];
}

/** Clear legacy conditional forwarding (fallback if ##002# is unavailable). */
export function forwardingLegacyClearCodes(): ForwardingCodeEntry[] {
  return [
    { label: "Überlauf — keine Antwort löschen", code: "##61#" },
    { label: "Überlauf — besetzt löschen", code: "##67#" },
    { label: "Überlauf — nicht erreichbar löschen", code: "##62#" },
  ];
}

/** All calls forward immediately to Linker — the only supported coupling mode. */
export function forwardingActivateCodes(linkerNumber: string): ForwardingCodeEntry[] {
  const code = normalizePhoneCode(linkerNumber);
  if (!code) return [];
  return [{ label: "Alle Anrufe", code: `**21*${code}#` }];
}

/** Primary activation code. */
export function forwardingActivateCode(linkerNumber: string): string {
  return forwardingActivateCodes(linkerNumber)[0]?.code ?? "";
}

export function forwardingStatusCheckCodes(): ForwardingCodeEntry[] {
  return [
    {
      label: "Weiterleitung prüfen (muss die Linker-Nummer anzeigen)",
      code: "*#21#",
    },
  ];
}

/** Deactivate all-call forwarding. */
export function forwardingDeactivateCodes(): ForwardingCodeEntry[] {
  return [{ label: "Alle Anrufe", code: "##21#" }];
}

export function forwardingDeactivateCode(): string {
  return "##21#";
}

export function forwardingDeactivateHint(): string {
  return "Wählen Sie ##21# und die Anruftaste.";
}

export const ALL_CALLS_RESET_NOTE =
  "Zuerst alle bestehenden Weiterleitungen löschen — inkl. Yallo-Combox-Regeln. Bei Yallo zusätzlich die Mailbox in der Yallo-App deaktivieren.";

export const ALL_CALLS_SETUP_NOTE =
  "Dann «Alle Anrufe» aktivieren (Nummer ohne Plus). Anrufe auf Ihre Ladennumer gehen sofort an Otto auf der Linker-Nummer — die Ladennumer klingelt nicht.";

export const ALL_CALLS_VERIFY_NOTE =
  "Prüfen: *#21# wählen. Es muss die Linker-Nummer (417…) angezeigt werden. Wenn «deaktiviert» oder eine andere Nummer erscheint, Schritt 1 und 2 wiederholen.";
