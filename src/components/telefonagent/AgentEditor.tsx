"use client";

import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface VoiceOption {
  id: string;
  name: string;
  language: string;
}

interface AgentEditorProps {
  name: string;
  voiceId: string;
  greeting: string;
  systemPrompt: string;
  voices: VoiceOption[];
  voicesLoading: boolean;
  saving: boolean;
  isNew: boolean;
  onNameChange: (value: string) => void;
  onVoiceChange: (voiceId: string) => void;
  onGreetingChange: (value: string) => void;
  onSystemPromptChange: (value: string) => void;
  onSave: () => void;
  onClose?: () => void;
}

const fieldClass =
  "w-full rounded-[16px] border border-stroke bg-surface px-3.5 py-2.5 text-[14px] leading-relaxed text-text placeholder:text-text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/25";

export function AgentEditor({
  name,
  voiceId,
  greeting,
  systemPrompt,
  voices,
  voicesLoading,
  saving,
  isNew,
  onNameChange,
  onVoiceChange,
  onGreetingChange,
  onSystemPromptChange,
  onSave,
  onClose,
}: AgentEditorProps) {
  return (
    <div className="w-full space-y-3 rounded-[22px] border border-stroke bg-surface p-4">
      <Input
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Name"
        className={cn(fieldClass, "h-auto")}
      />

      {voicesLoading ? (
        <div className="h-9 animate-pulse rounded-full bg-bg" />
      ) : voices.length === 0 ? (
        <p className="px-1 text-[13px] text-text-muted">Keine Stimmen</p>
      ) : (
        <div className="flex flex-wrap justify-center gap-1.5">
          {voices.map((voice) => (
            <button
              key={voice.id}
              type="button"
              onClick={() => onVoiceChange(voice.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                voiceId === voice.id
                  ? "bg-navy text-white"
                  : "bg-bg text-text-muted hover:text-text"
              )}
            >
              {voice.name.split(" ")[0]}
            </button>
          ))}
        </div>
      )}

      <textarea
        value={greeting}
        onChange={(e) => onGreetingChange(e.target.value)}
        placeholder="Begrüssung"
        rows={3}
        className={cn(fieldClass, "min-h-0 resize-none")}
      />

      <details className="group">
        <summary className="cursor-pointer list-none px-1 text-[12px] font-medium text-text-muted marker:content-none">
          Anweisungen
        </summary>
        <textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          rows={4}
          className={cn(fieldClass, "min-h-0 resize-y font-mono text-[13px]")}
        />
      </details>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          className="h-10 flex-1 rounded-full text-[14px]"
          onClick={onSave}
          disabled={saving || !voiceId || !name.trim() || !greeting.trim()}
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Speichern
        </Button>
        {!isNew && onClose && (
          <Button
            type="button"
            variant="outline"
            className="h-10 rounded-full px-4 text-[14px]"
            onClick={onClose}
          >
            Fertig
          </Button>
        )}
      </div>
    </div>
  );
}
