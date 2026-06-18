"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  userLabelClass,
  userPanelClass,
  userTitleClass,
} from "@/components/user/user-styles";

type Range = "tag" | "woche" | "monat";

interface Point {
  startedAt: string;
  durationSeconds: number;
}

interface Bucket {
  count: number;
  axis: string;
  full: string;
}

const RANGES: { id: Range; label: string }[] = [
  { id: "tag", label: "Tag" },
  { id: "woche", label: "Woche" },
  { id: "monat", label: "Monat" },
];

const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");

function buildBuckets(calls: Point[], range: Range): Bucket[] {
  const now = new Date();

  if (range === "tag") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const buckets: Bucket[] = Array.from({ length: 24 }, (_, h) => ({
      count: 0,
      axis: h % 6 === 0 ? `${pad(h)}:00` : "",
      full: `${pad(h)}:00 – ${pad(h)}:59 Uhr`,
    }));
    for (const c of calls) {
      const d = new Date(c.startedAt);
      if (d >= start && d <= now) buckets[d.getHours()].count += 1;
    }
    return buckets;
  }

  const days = range === "woche" ? 7 : 30;
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const buckets: Bucket[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    const full = d.toLocaleDateString("de-CH", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    let axis = "";
    if (range === "woche") {
      axis = WEEKDAYS[d.getDay()];
    } else if ((days - 1 - i) % 5 === 0 || i === 0) {
      axis = `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
    }
    buckets.push({ count: 0, axis, full });
  }
  for (const c of calls) {
    const d = new Date(c.startedAt);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((base.getTime() - d.getTime()) / 86_400_000);
    const idx = days - 1 - diff;
    if (idx >= 0 && idx < days) buckets[idx].count += 1;
  }
  return buckets;
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

export function CallVolumeChart() {
  const [range, setRange] = useState<Range>("woche");
  const [calls, setCalls] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/stats");
        const data = await res.json();
        if (!cancelled && res.ok && data.ok) {
          setCalls(data.calls as Point[]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    const interval = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

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

  const buckets = useMemo(() => buildBuckets(calls, range), [calls, range]);

  const H = 220;
  const padL = 10;
  const padR = 10;
  const padT = 18;
  const padB = 26;
  const innerW = Math.max(1, width - padL - padR);
  const innerH = H - padT - padB;
  const n = buckets.length;
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));

  const xAt = (i: number) =>
    n <= 1 ? padL + innerW / 2 : padL + (i / (n - 1)) * innerW;
  const yAt = (count: number) => padT + innerH * (1 - count / maxCount);

  const pts = buckets.map((b, i) => ({ x: xAt(i), y: yAt(b.count) }));
  const line = smoothPath(pts);
  const area =
    pts.length > 0
      ? `${line} L ${pts[pts.length - 1].x.toFixed(2)} ${padT + innerH} L ${pts[0].x.toFixed(2)} ${padT + innerH} Z`
      : "";

  const total = buckets.reduce((s, b) => s + b.count, 0);
  const peak = buckets.reduce(
    (best, b) => (b.count > best.count ? b : best),
    buckets[0] ?? { count: 0, axis: "", full: "" }
  );

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

  const hoverBucket = hover != null ? buckets[hover] : null;

  return (
    <div className={`${userPanelClass} p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className={userTitleClass}>
            {total} {total === 1 ? "Anruf" : "Anrufe"}
            <span className={`${userLabelClass} ml-2`}>
              {range === "tag"
                ? "heute"
                : range === "woche"
                  ? "in den letzten 7 Tagen"
                  : "in den letzten 30 Tagen"}
            </span>
          </p>
          {peak.count > 0 && (
            <p className={`${userLabelClass} mt-1`}>
              Spitze: {peak.count} {peak.count === 1 ? "Anruf" : "Anrufe"} ·{" "}
              {peak.full}
            </p>
          )}
        </div>

        <div className="inline-flex rounded border border-[#E1E4EA] bg-[#F5F7FA] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={`landing-radius-sm px-3 py-1 text-[13px] font-normal transition-colors ${
                range === r.id
                  ? "bg-white text-[#0E121B] shadow-sm"
                  : "text-[#525866] hover:text-[#0E121B]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className="relative mt-6">
        {loading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : (
          <>
            <svg
              width={width}
              height={H}
              viewBox={`0 0 ${width} ${H}`}
              className="block w-full overflow-visible"
              onPointerMove={handleMove}
              onPointerLeave={() => setHover(null)}
            >
              <defs>
                <linearGradient id="callFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#335cff" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#335cff" stopOpacity="0" />
                </linearGradient>
              </defs>

              {[0.25, 0.5, 0.75, 1].map((f) => (
                <line
                  key={f}
                  x1={padL}
                  x2={width - padR}
                  y1={padT + innerH * f}
                  y2={padT + innerH * f}
                  stroke="#E1E4EA"
                  strokeDasharray="2 4"
                  strokeWidth={1}
                  opacity={0.6}
                />
              ))}

              {area && <path d={area} fill="url(#callFill)" />}
              {line && (
                <path
                  d={line}
                  fill="none"
                  stroke="#335cff"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {hover != null && pts[hover] && (
                <>
                  <line
                    x1={pts[hover].x}
                    x2={pts[hover].x}
                    y1={padT}
                    y2={padT + innerH}
                    stroke="#335cff"
                    strokeWidth={1}
                    opacity={0.25}
                  />
                  <circle
                    cx={pts[hover].x}
                    cy={pts[hover].y}
                    r={4}
                    fill="#ffffff"
                    stroke="#335cff"
                    strokeWidth={2}
                  />
                </>
              )}

              {buckets.map((b, i) =>
                b.axis ? (
                  <text
                    key={i}
                    x={xAt(i)}
                    y={H - 6}
                    textAnchor="middle"
                    className="fill-[#525866]"
                    style={{ fontSize: 11 }}
                  >
                    {b.axis}
                  </text>
                ) : null
              )}
            </svg>

            {total === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[#525866]">
                <p className="text-[14px]">Noch keine Anrufe in diesem Zeitraum</p>
              </div>
            )}

            {hoverBucket && hover != null && pts[hover] && total > 0 && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-[#E1E4EA] bg-white px-3 py-2 shadow-sm"
                style={{
                  left: `${(pts[hover].x / width) * 100}%`,
                  top: pts[hover].y - 10,
                }}
              >
                <p className="whitespace-nowrap text-[13px] text-[#0E121B]">
                  {hoverBucket.count}{" "}
                  {hoverBucket.count === 1 ? "Anruf" : "Anrufe"}
                </p>
                <p className="whitespace-nowrap text-[13px] text-[#525866]">
                  {hoverBucket.full}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
