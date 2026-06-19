export function voicePreviewLabel(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "Stimme";
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

export function buildVoicePreviewPhrase(voiceName: string): string {
  return `Hallo, ich bin ${voicePreviewLabel(voiceName)}.`;
}
