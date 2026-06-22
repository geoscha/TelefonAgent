import "server-only";

import {
  filterAgentVoices,
  type AgentLanguageLabel,
  type RawElevenLabsVoice,
} from "@/lib/elevenlabs/agent-config";
import { getElevenLabsClient } from "@/lib/elevenlabs/client";
import { preferredVoiceScoreBonus } from "@/lib/elevenlabs/swiss-voices";

import {
  getDemoVoicePreset,
  type DemoVoicePresetId,
} from "@/lib/demo/voices";

const voiceIdCache = new Map<DemoVoicePresetId, string>();

async function fetchWorkspaceVoices(): Promise<RawElevenLabsVoice[]> {
  const client = getElevenLabsClient();
  const res = (await client.voices.getAll()) as {
    voices?: RawElevenLabsVoice[];
  };
  return res.voices ?? [];
}

/** Pick a German-capable voice with the right gender + accent metadata. */
export function pickDemoVoiceFromCatalog(
  rawVoices: RawElevenLabsVoice[],
  presetId: DemoVoicePresetId
): string | undefined {
  const preset = getDemoVoicePreset(presetId);
  const language = preset.language as AgentLanguageLabel;
  const catalog = filterAgentVoices(rawVoices, language);
  if (catalog.length === 0) return undefined;

  const wantMale = presetId === "male-ch";
  const gender = wantMale ? "male" : "female";
  const direct = catalog.find((v) => v.gender === gender);
  if (direct) return direct.id;

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

    const voiceGender = (v.labels?.gender ?? "").toLowerCase();
    if (wantMale) {
      if (voiceGender === "male") s += 40;
      else if (voiceGender === "female") s -= 30;
    } else {
      if (voiceGender === "female") s += 40;
      else if (voiceGender === "male") s -= 30;
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
  if (!best?.voiceId || score(best) < 0) return undefined;
  return best.voiceId;
}

export async function resolveDemoVoiceId(
  presetId: string,
  apiKey: string
): Promise<string> {
  void apiKey;
  const preset = getDemoVoicePreset(presetId);
  const presetKey = preset.id as DemoVoicePresetId;
  const envName = preset.envKey as keyof NodeJS.ProcessEnv;
  const configured = process.env[envName]?.trim();
  if (configured) return configured;

  const cached = voiceIdCache.get(presetKey);
  if (cached) return cached;

  try {
    const rawVoices = await fetchWorkspaceVoices();
    const picked = pickDemoVoiceFromCatalog(rawVoices, presetKey);
    if (picked) {
      voiceIdCache.set(presetKey, picked);
      return picked;
    }

    const anyGerman = filterAgentVoices(rawVoices)[0]?.id;
    if (anyGerman) {
      voiceIdCache.set(presetKey, anyGerman);
      return anyGerman;
    }
  } catch {
    // Fall back to env default below.
  }

  const fallback = process.env.DEFAULT_AGENT_VOICE_ID?.trim();
  if (fallback) {
    voiceIdCache.set(presetKey, fallback);
    return fallback;
  }

  throw new Error("Keine deutschfähige Stimme im Workspace gefunden.");
}
