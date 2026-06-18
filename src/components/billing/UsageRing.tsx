"use client";

import { formatQuotaDuration } from "@/lib/billing/quota-display";

interface UsageRingProps {
  usedSeconds: number;
  limitSeconds: number;
  percentUsed: number;
  periodLabel?: string;
  size?: number;
}

export function UsageRing({
  usedSeconds,
  limitSeconds,
  percentUsed,
  periodLabel,
  size = 128,
}: UsageRingProps) {
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(1, percentUsed / 100));
  const cx = size / 2;
  const cy = size / 2;
  const exhausted = usedSeconds >= limitSeconds;

  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--stroke)"
            strokeWidth={stroke}
          />
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={exhausted ? "#ef4444" : "var(--accent)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-[stroke-dashoffset] duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-h3 font-semibold text-navy">
            {Math.round(percentUsed)}%
          </span>
        </div>
      </div>
      <div>
        <p className="font-medium text-navy">Telefon-Kontingent</p>
        <p className="mt-1 text-body text-text-muted">
          {formatQuotaDuration(usedSeconds)} / {formatQuotaDuration(limitSeconds)}
        </p>
        {periodLabel && (
          <p className="mt-0.5 text-caption text-text-muted">{periodLabel}</p>
        )}
      </div>
    </div>
  );
}
