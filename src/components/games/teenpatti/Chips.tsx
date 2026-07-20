"use client";

/* Layered poker chips: SVG discs with a dashed edge ring. Denomination colors:
   100 ebony/gold · 25 maroon · 5 emerald · 1 ivory. */

import type { CSSProperties } from "react";

interface ChipColors {
  base: string;
  edge: string;
  inner: string;
  text: string;
}

const COLORS: Record<number, ChipColors> = {
  100: { base: "#23242c", edge: "#0d0e12", inner: "#383944", text: "#c9a961" },
  25: { base: "#6e1f2e", edge: "#3f101b", inner: "#8a2c3e", text: "#f2e3c8" },
  5: { base: "#1b5e46", edge: "#0d3a2a", inner: "#27795b", text: "#e6f0e6" },
  1: { base: "#e8e2d2", edge: "#b4aa93", inner: "#f4efe2", text: "#6e5a2e" },
};

export function ChipSvg({
  denom = 5,
  className,
  style,
  showValue = false,
}: {
  denom?: number;
  className?: string;
  style?: CSSProperties;
  showValue?: boolean;
}) {
  const c = COLORS[denom] ?? COLORS[5];
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} aria-hidden>
      <circle cx="20" cy="21.4" r="18.3" fill="rgba(0,0,0,0.35)" />
      <circle cx="20" cy="20" r="18.3" fill={c.base} stroke={c.edge} strokeWidth="1.2" />
      <circle
        cx="20"
        cy="20"
        r="16"
        fill="none"
        stroke="#f6f1e4"
        strokeOpacity="0.85"
        strokeWidth="3.4"
        strokeDasharray="4.19 4.19"
      />
      <circle cx="20" cy="20" r="10.8" fill={c.inner} stroke={c.edge} strokeWidth="0.7" />
      {showValue && (
        <text
          x="20"
          y="20.6"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={denom >= 100 ? 8 : 9.5}
          fontWeight="700"
          fill={c.text}
        >
          {denom}
        </text>
      )}
    </svg>
  );
}

/** Greedy chip break of an amount, capped so stacks stay readable. */
export function chipBreak(amount: number, cap = 7): number[] {
  const out: number[] = [];
  let rem = Math.max(0, Math.floor(amount));
  for (const d of [100, 25, 5, 1]) {
    while (rem >= d && out.length < cap) {
      out.push(d);
      rem -= d;
    }
  }
  return out;
}

/** A physical-looking vertical stack of chips for an amount. */
export function ChipStack({
  amount,
  w = 22,
  className,
}: {
  amount: number;
  w?: number;
  className?: string;
}) {
  const chips = chipBreak(amount);
  if (!chips.length) return null;
  const step = Math.round(w * 0.24);
  return (
    <div
      aria-label={`${amount} chips`}
      className={`relative ${className ?? ""}`}
      style={{ width: w, height: w + (chips.length - 1) * step }}
    >
      {chips.map((d, i) => (
        <ChipSvg
          key={i}
          denom={d}
          className="absolute left-0"
          style={{ bottom: i * step, width: w }}
          showValue={i === chips.length - 1}
        />
      ))}
    </div>
  );
}
