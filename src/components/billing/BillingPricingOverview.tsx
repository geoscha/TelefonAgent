"use client";

import { useState } from "react";

import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";
import {
  CALL_MINUTE_COST_TOKENS,
  formatTokenCount,
  PHONE_NUMBER_MONTHLY_TOKENS,
} from "@/lib/billing/quota-display";
import { ELEVENLABS_TTS_MODEL } from "@/lib/elevenlabs/agent-config";
import { cn } from "@/lib/utils";

const STACK_ITEMS = [
  "ElevenLabs Conversational AI",
  "ChatGPT 4o mini",
  `TTS · ${ELEVENLABS_TTS_MODEL.replace(/_/g, " ")}`,
  "Twilio Telefonie",
] as const;

const BREAKDOWN = [
  {
    label: "Gesprächszeit",
    value: `${formatTokenCount(CALL_MINUTE_COST_TOKENS)} Tokens/Min.`,
  },
  {
    label: "Telefonnummer",
    value: `${formatTokenCount(PHONE_NUMBER_MONTHLY_TOKENS)} Tokens/Mon.`,
  },
] as const;

function tokenLabel(amount: number, unit?: string): string {
  const base = `${formatTokenCount(amount)} Tokens`;
  return unit ? `${base}${unit}` : base;
}

function StackPill({ label }: { label: string }) {
  return (
    <span className="inline-flex rounded-full border border-[#335cff]/25 bg-[#335cff]/10 px-3 py-1 text-[12px] font-normal text-[#0E121B]">
      {label}
    </span>
  );
}

export function BillingPricingOverview() {
  const [monthlyMinutes, setMonthlyMinutes] = useState(100);

  const totalTokens =
    monthlyMinutes * CALL_MINUTE_COST_TOKENS + PHONE_NUMBER_MONTHLY_TOKENS;

  return (
    <section className="space-y-3">
      <p className={userTitleClass}>Preisübersicht (Tokens)</p>

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <div className={cn(userPanelClass, "space-y-5 p-5 sm:p-6 lg:col-span-2")}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <p className={userTitleClass}>Gesprächszeit / Monat</p>
              <p className="text-[28px] font-normal tabular-nums leading-none text-[#0E121B]">
                {monthlyMinutes}
                <span className="ml-1 text-[15px] text-[#525866]">Min.</span>
              </p>
            </div>
            <input
              type="range"
              min={0}
              max={500}
              step={5}
              value={monthlyMinutes}
              onChange={(event) => setMonthlyMinutes(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-[#E1E4EA] accent-[#335cff] [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#335cff]"
              aria-label="Monatliche Gesprächszeit in Minuten"
            />
          </div>

          <div className="space-y-2">
            <p className={userTitleClass}>Technologie</p>
            <div className="flex flex-wrap gap-2">
              {STACK_ITEMS.map((label) => (
                <StackPill key={label} label={label} />
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className={userTitleClass}>Token-Preise</p>
            <ul className="space-y-0">
              {BREAKDOWN.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between gap-3 border-b border-[#E1E4EA] py-2 last:border-0"
                >
                  <span className={userLabelClass}>{item.label}</span>
                  <span className="text-[12px] tabular-nums text-[#0E121B]">
                    {item.value}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded border border-[#0E121B] bg-[#050f1f] p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
            <p className="text-[13px] text-white/70">Tokens / Min.</p>
            <p className="text-right text-[22px] font-normal tabular-nums leading-none">
              {tokenLabel(CALL_MINUTE_COST_TOKENS)}
            </p>
          </div>

          <ul className="space-y-2.5 py-4">
            {BREAKDOWN.map((row) => (
              <li
                key={row.label}
                className="flex items-center justify-between gap-3 text-[12px]"
              >
                <span className="text-white/65">{row.label}</span>
                <span className="tabular-nums text-white">{row.value}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-end justify-between gap-3 border-t border-white/10 pt-4">
            <p className="text-[13px] text-white/70">Tokens / Monat</p>
            <p className="text-right text-[22px] font-normal tabular-nums leading-none">
              {tokenLabel(totalTokens)}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
