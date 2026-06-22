import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import {
  filterAgentVoices,
  pickDefaultAgentVoice,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import { preferredVoiceScoreBonus } from "@/lib/elevenlabs/swiss-voices";

export type AgentVoiceGender = "male" | "female";

export function pickDefaultAgentVoiceForLanguage(
  rawVoices: RawElevenLabsVoice[],
  language: AgentLanguageLabel
) {
  const catalog = filterAgentVoices(rawVoices, language);
  return pickDefaultAgentVoice(catalog);
}

export function pickAgentVoiceId(
  rawVoices: RawElevenLabsVoice[],
  gender: AgentVoiceGender,
  language: AgentLanguageLabel
): string | undefined {
  const catalog = filterAgentVoices(rawVoices, language);
  if (catalog.length === 0) return undefined;

  const match = catalog.find((v) => v.gender === gender);
  if (match) return match.id;

  const meta = new Map(catalog.map((v) => [v.id, v]));
  const eligible = rawVoices.filter((v) => v.voiceId && meta.has(v.voiceId));

  const score = (v: RawElevenLabsVoice): number => {
    const opt = meta.get(v.voiceId!);
    if (!opt) return -100;

    let s = preferredVoiceScoreBonus(
      v.voiceId!,
      v.name ?? "",
      language,
      gender
    );

    const g = (v.labels?.gender ?? "").toLowerCase();
    if (gender === "male") {
      if (g === "male") s += 40;
      else if (g === "female") s -= 30;
    } else {
      if (g === "female") s += 40;
      else if (g === "male") s -= 30;
    }

    if (language === "Schweizerdeutsch") {
      if (opt.swissGerman) s += 50;
      else s -= 15;
    } else if (!opt.swissGerman) {
      s += 50;
    }

    return s;
  };

  const sorted = [...eligible].sort((a, b) => score(b) - score(a));
  const best = sorted[0];
  if (!best?.voiceId || score(best) < 0) return catalog[0]?.id;
  return best.voiceId;
}
