"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface FinanceChartProps {
  labels: string[];
  series: ChartSeries[];
  loading?: boolean;
  formatValue?: (n: number, seriesKey?: string) => string;
  height?: number;
  emptyLabel?: string;
  extraTooltip?: (index: number) => { label: string; value: string }[];
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function computeDomain(values: number[]): { min: number; max: number } {
  if (values.length === 0) return { min: 0, max: 1 };
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    const pad = Math.abs(min) * 0.1 || 1;
    return { min: min - pad, max: max + pad };
  }
  const span = max - min;
  const pad = span * 0.08;
  return { min: min - pad, max: max + pad };
}

export function FinanceChart({
  labels,
  series,
  loading,
  formatValue = (n) => String(Math.round(n)),
  height = 240,
  emptyLabel = "Noch keine Daten",
  extraTooltip,
}: FinanceChartProps) {
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { minVal, maxVal } = useMemo(() => {
    const all = series.flatMap((s) => s.values);
    if (all.length === 0) return { minVal: 0, maxVal: 1 };
    const { min, max } = computeDomain(all);
    return { minVal: min, maxVal: max };
  }, [series]);

  const padL = 10;
  const padR = 10;
  const padT = 18;
  const padB = 28;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = height - padT - padB;
  const n = labels.length;
  const range = maxVal - minVal || 1;

  const xAt = (i: number) =>
    n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
  const yAt = (v: number) =>
    padT + innerH * (1 - (v - minVal) / range);

  const zeroY =
    minVal < 0 && maxVal > 0 ? yAt(0) : null;

  const hasData = series.some((s) => s.values.some((v) => v !== 0));
  const showAllLabels = labels.length <= 7;

  function handleMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (n <= 1) {
      setHover(0);
      return;
    }
    const idx = Math.round(((x - padL) / innerW) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, idx)));
  }

  return (
    <div ref={wrapRef} className="relative">
      {loading ? (
        <Skeleton className="h-[240px] w-full" />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-4">
            {series.map((s) => (
              <div key={s.key} className="flex items-center gap-2 text-caption">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: s.color }}
                />
                <span className="text-text-muted">{s.label}</span>
              </div>
            ))}
          </div>

          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="block w-full overflow-hidden"
            onPointerMove={handleMove}
            onPointerLeave={() => setHover(null)}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line
                key={f}
                x1={padL}
                x2={width - padR}
                y1={padT + innerH * f}
                y2={padT + innerH * f}
                stroke="var(--stroke)"
                strokeDasharray="2 4"
                strokeWidth={1}
                opacity={0.6}
              />
            ))}

            {zeroY != null && (
              <line
                x1={padL}
                x2={width - padR}
                y1={zeroY}
                y2={zeroY}
                stroke="var(--text-muted)"
                strokeWidth={1}
                opacity={0.45}
              />
            )}

            {series.map((s) => {
              const pts = s.values.map((v, i) => ({
                x: xAt(i),
                y: yAt(v),
              }));
              const line = smoothPath(pts);
              return (
                line && (
                  <path
                    key={s.key}
                    d={line}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )
              );
            })}

            {hover != null && n > 0 && (
              <line
                x1={xAt(hover)}
                x2={xAt(hover)}
                y1={padT}
                y2={padT + innerH}
                stroke="var(--text-muted)"
                strokeWidth={1}
                opacity={0.35}
              />
            )}

            {labels.map((label, i) =>
              showAllLabels || i % 2 === 0 || i === labels.length - 1 ? (
                <text
                  key={i}
                  x={xAt(i)}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-text-muted"
                  style={{ fontSize: 11 }}
                >
                  {label}
                </text>
              ) : null
            )}
          </svg>

          {!hasData && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-body text-text-muted">
              {emptyLabel}
            </div>
          )}

          {hover != null && labels[hover] && hasData && (
            <div
              className="pointer-events-none absolute z-10 -translate-x-1/2 rounded-btn border border-stroke bg-surface px-3 py-2 shadow-md"
              style={{
                left: `${(xAt(hover) / width) * 100}%`,
                top: padT,
              }}
            >
              <p className="whitespace-nowrap text-caption font-semibold text-navy">
                {labels[hover]}
              </p>
              {series.map((s) => (
                <p
                  key={s.key}
                  className="whitespace-nowrap text-caption text-text-muted"
                >
                  {s.label}: {formatValue(s.values[hover] ?? 0, s.key)}
                </p>
              ))}
              {extraTooltip?.(hover).map((line) => (
                <p
                  key={line.label}
                  className="whitespace-nowrap text-caption text-text-muted"
                >
                  {line.label}: {line.value}
                </p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
