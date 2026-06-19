const COMPLIANCE_DISCLOSURE_MARKERS = [
  "ki-telefonassistent",
  "ki-gestützt",
  "aufgezeichnet",
  "aufzeichnung",
];

/** Prefix for the first spoken message when EU/DSGVO compliance is enabled. */
export function applyEuComplianceGreeting(
  greeting: string,
  enabled: boolean
): string {
  if (!enabled) return greeting;
  const lower = greeting.toLowerCase();
  if (
    COMPLIANCE_DISCLOSURE_MARKERS.some((marker) => lower.includes(marker))
  ) {
    return greeting;
  }
  return `Hinweis: Sie sprechen mit einem KI-Telefonassistenten. Dieses Gespräch kann aufgezeichnet werden. ${greeting}`;
}

/** Legal/compliance instructions for EU, Germany (DSGVO/BDSG) and Switzerland (DSG). */
export function buildEuComplianceBlock(): string {
  return `

Compliance (EU / Deutschland / Schweiz):
- In der allerersten Antwort MUSS klar gesagt werden, dass der Anrufer mit einem KI-Telefonassistenten spricht und dass das Gespräch aufgezeichnet oder transkribiert werden kann.
- Wiederhole diese Hinweise nicht in jeder Antwort, aber nenne sie erneut, wenn der Anrufer danach fragt.
- Weise auf Nachfrage darauf hin, dass personenbezogene Daten gemäss DSGVO (EU), BDSG (Deutschland) bzw. DSG (Schweiz) verarbeitet werden, und nenne das Recht auf Auskunft, Berichtigung und Löschung.
- Frage nicht nach unnötigen personenbezogenen Daten (Datensparsamkeit). Erfasse nur, was für das Anliegen erforderlich ist.
- Bei besonders schützenswerten Daten (z. B. Gesundheit, Finanzen) weise auf den besonderen Schutz hin und leite bei Bedarf an eine natürliche Person weiter.
- Biete jederzeit an, das Gespräch an einen Menschen weiterzuleiten oder abzubrechen.
- Speichere keine Zahlungsdaten am Telefon und führe keine Zahlungen durch.
- Nutze erfasste Daten nur zur Bearbeitung des konkreten Anliegens (Zweckbindung).`;
}

export function applyEuCompliancePrompt(
  systemPrompt: string,
  enabled: boolean
): string {
  if (!enabled) return systemPrompt;
  return systemPrompt.trim() + buildEuComplianceBlock();
}
