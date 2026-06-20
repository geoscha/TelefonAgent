"use client";

import { cn } from "@/lib/utils";
import { groupVoicesByGender } from "@/lib/elevenlabs/voice-groups";
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
  const { female, male } = groupVoicesByGender(voices);

  return (
    <div className={cn("space-y-4", className)}>
      {female.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.08em] text-[#99A0AE]">
            Weiblich
          </p>
          <div className="flex flex-wrap gap-2">
            {female.map((voice) => (
              <ChoicePill
                key={voice.id}
                active={value === voice.id}
                onClick={() => onChange(voice.id)}
                label={voice.displayName ?? voice.name}
              />
            ))}
          </div>
        </div>
      ) : null}

      {male.length > 0 ? (
        <div>
          <p className="mb-2 text-[11px] font-normal uppercase tracking-[0.08em] text-[#99A0AE]">
            Männlich
          </p>
          <div className="flex flex-wrap gap-2">
            {male.map((voice) => (
              <ChoicePill
                key={voice.id}
                active={value === voice.id}
                onClick={() => onChange(voice.id)}
                label={voice.displayName ?? voice.name}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
