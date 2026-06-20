"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AssistantVoiceGender } from "@/lib/elevenlabs/assistant-names";
import { groupVoicesByGender } from "@/lib/elevenlabs/voice-groups";
import { cn } from "@/lib/utils";

export interface VoiceSelectOption {
  id: string;
  name: string;
  language: string;
  gender?: AssistantVoiceGender;
}

interface VoiceSelectProps {
  voices: VoiceSelectOption[];
  value: string;
  onChange: (voiceId: string) => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const triggerClass =
  "landing-body landing-radius-sm h-10 w-full border border-[#E1E4EA] bg-white px-3 py-2 text-[14px] text-[#0E121B] shadow-none focus:border-[#335cff] focus:outline-none focus:ring-2 focus:ring-[#335cff]/20 data-[placeholder]:text-[#99A0AE] [&>svg]:text-[#99A0AE]";

const contentClass =
  "z-50 max-h-72 overflow-hidden rounded border border-[#E1E4EA] bg-white p-1 text-[#0E121B] shadow-[0_8px_24px_rgba(14,18,27,0.08)]";

const itemClass =
  "cursor-pointer rounded py-2 pl-8 pr-3 text-[13px] focus:bg-[#F5F7FA] data-[highlighted]:bg-[#F5F7FA]";

const labelClass = "px-2 py-1.5 text-[11px] font-normal uppercase tracking-[0.08em] text-[#99A0AE]";

function VoiceSelectItems({ voices }: { voices: VoiceSelectOption[] }) {
  return (
    <>
      {voices.map((voice) => (
        <SelectItem
          key={voice.id}
          value={voice.id}
          className={itemClass}
          textValue={`${voice.name} ${voice.language}`}
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-normal text-[#0E121B]">
              {voice.name}
            </span>
            <span className="text-[11px] text-[#99A0AE]">{voice.language}</span>
          </span>
        </SelectItem>
      ))}
    </>
  );
}

export function VoiceSelect({
  voices,
  value,
  onChange,
  loading = false,
  disabled = false,
  placeholder = "Stimme wählen…",
  className,
}: VoiceSelectProps) {
  if (loading) {
    return (
      <div
        className={cn(
          "h-10 animate-pulse rounded border border-[#E1E4EA] bg-[#FAFAFA]",
          className
        )}
      />
    );
  }

  if (voices.length === 0) {
    return (
      <p className="text-[13px] text-[#99A0AE]">Keine Stimmen verfügbar</p>
    );
  }

  const { female, male } = groupVoicesByGender(voices);
  const hasGroups = female.length > 0 && male.length > 0;

  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
      disabled={disabled}
    >
      <SelectTrigger className={cn(triggerClass, className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className={contentClass} position="popper">
        {hasGroups ? (
          <>
            <SelectGroup>
              <SelectLabel className={labelClass}>Weiblich</SelectLabel>
              <VoiceSelectItems voices={female} />
            </SelectGroup>
            <SelectGroup>
              <SelectLabel className={labelClass}>Männlich</SelectLabel>
              <VoiceSelectItems voices={male} />
            </SelectGroup>
          </>
        ) : (
          <VoiceSelectItems voices={voices} />
        )}
      </SelectContent>
    </Select>
  );
}
