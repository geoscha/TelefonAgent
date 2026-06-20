"use client";

import { cn } from "@/lib/utils";
import type { AssistantVoiceGender } from "@/lib/elevenlabs/assistant-names";

export interface VoiceChoiceOption {
  id: string;
  name: string;
  displayName?: string;
  language: string;
  gender?: AssistantVoiceGender;
}

function ChoicePill({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-3 py-1.5 text-[13px] font-normal transition-colors",
        active
          ? "bg-[#050f1f] text-white"
          : "border border-[#E1E4EA] text-[#525866] hover:bg-[#F5F7FA] hover:text-[#0E121B]"
      )}
    >
      {label}
    </button>
  );
}

export function VoiceChoiceGroup({
  voices,
  value,
  onChange,
  className,
}: {
  voices: VoiceChoiceOption[];
  value: string;
  onChange: (voiceId: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {voices.map((voice) => (
        <ChoicePill
          key={voice.id}
          active={value === voice.id}
          onClick={() => onChange(voice.id)}
          label={voice.displayName ?? voice.name}
        />
      ))}
    </div>
  );
}
