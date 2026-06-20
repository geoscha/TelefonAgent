import type { AgentLanguageLabel } from "@/lib/elevenlabs/agent-config";
import {
  filterAgentVoices,
  pickDefaultAgentVoice,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";

export type AgentVoiceGender = "male" | "female";

export function pickDefaultAgentVoiceForLanguage(
  rawVoices: RawElevenLabsVoice[],
  language: AgentLanguageLabel
) {
  const catalog = filterAgentVoices(rawVoices);
  const wantSwiss = language === "Schweizerdeutsch";
  const filtered = catalog.filter((voice) =>
    wantSwiss ? voice.swissGerman : !voice.swissGerman
  );
  return pickDefaultAgentVoice(filtered.length > 0 ? filtered : catalog);
}

export function pickAgentVoiceId(
  rawVoices: RawElevenLabsVoice[],
  gender: AgentVoiceGender,
  language: AgentLanguageLabel
): string | undefined {
  const catalog = filterAgentVoices(rawVoices);
  if (catalog.length === 0) return undefined;

  const meta = new Map(catalog.map((v) => [v.id, v]));
  const eligible = rawVoices.filter((v) => v.voiceId && meta.has(v.voiceId));
  const wantSwiss = language === "Schweizerdeutsch";

  const score = (v: RawElevenLabsVoice): number => {
    const opt = meta.get(v.voiceId!);
    if (!opt) return -100;

    let s = 0;
    const g = (v.labels?.gender ?? "").toLowerCase();
    if (gender === "male") {
      if (g === "male") s += 40;
      else if (g === "female") s -= 30;
    } else {
      if (g === "female") s += 40;
      else if (g === "male") s -= 30;
    }

    if (wantSwiss) {
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
