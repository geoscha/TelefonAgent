/** Legal/compliance instructions for EU, Germany (DSGVO/BDSG) and Switzerland (DSG). */
export function buildEuComplianceBlock(): string {
  return `

Compliance (EU / Deutschland / Schweiz):
- Informiere Anruferinnen und Anrufer zu Beginn des Gesprächs, dass sie mit einem KI-gestützten Telefonassistenten sprechen und dass das Gespräch zur Qualitätssicherung aufgezeichnet oder transkribiert werden kann.
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
