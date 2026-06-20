import type { AssistantVoiceGender } from "@/lib/elevenlabs/assistant-names";

export function groupVoicesByGender<T extends { gender?: AssistantVoiceGender }>(
  voices: T[]
): { female: T[]; male: T[] } {
  const female: T[] = [];
  const male: T[] = [];

  for (const voice of voices) {
    if (voice.gender === "male") {
      male.push(voice);
    } else {
      female.push(voice);
    }
  }

  return { female, male };
}
