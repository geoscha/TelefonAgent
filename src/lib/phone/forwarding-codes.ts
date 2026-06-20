export type ForwardingType = "alle" | "bedingt";

export function normalizePhoneCode(phoneNumber: string): string {
  return phoneNumber.replace(/[\s()./-]/g, "");
}

export function forwardingActivateCode(
  linkerNumber: string,
  type: ForwardingType
): string {
  const code = normalizePhoneCode(linkerNumber);
  return type === "alle" ? `**21*${code}#` : `**61*${code}#`;
}

export function forwardingDeactivateCode(type: ForwardingType): string {
  return type === "alle" ? "##21#" : "##61#";
}

export function forwardingDeactivateHint(type: ForwardingType): string {
  if (type === "alle") {
    return "Alle Anrufe: Wählen Sie ##21# und die Anruftaste.";
  }
  return "Nur Überlauf: Wählen Sie ##61# und die Anruftaste.";
}
