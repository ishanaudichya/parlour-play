/* Chain Reaction design tokens — a sheet of black glass over a dark bench,
   hairline grid lines that glow in whoever's colour holds the turn, and
   luminous glass orbs with a hot core. Everything here is expressed so the
   board is one scalable <svg>: 100-unit cells, integer geometry, no trig at
   render time (orb layouts are literal offsets). */

import { ORB_COLORS } from "@/lib/games/chainreaction/types";

/** One grid square, in SVG user units. */
export const CELL = 100;
/** Margin between the outer grid line and the glass edge. */
export const FRAME = 18;
/** Orb radius. */
export const ORB_R = 15;
/** Corner rounding of the glass sheet. */
export const GLASS_RX = 22;

export const cx = (col: number) => FRAME + col * CELL + CELL / 2;
export const cy = (row: number) => FRAME + row * CELL + CELL / 2;

/** Round a derived coordinate — keeps server and client byte-identical. */
export const n2 = (x: number) => Number(x.toFixed(2));

/** The house UI easing. */
export const SWIFT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ---------------- orb layouts ----------------
   Offsets from the cell centre, per orb count. The transient 5+ states that
   appear mid-cascade reuse the 4-layout with an extra orb in the middle. */

export const ORB_LAYOUT: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [
    [-17, 0],
    [17, 0],
  ],
  3: [
    [0, -18],
    [-18, 12],
    [18, 12],
  ],
  4: [
    [-17, -17],
    [17, -17],
    [-17, 17],
    [17, 17],
  ],
};

export function orbOffsets(n: number): readonly (readonly [number, number])[] {
  if (n <= 0) return [];
  if (n <= 4) return ORB_LAYOUT[n];
  const extra = Array.from({ length: n - 4 }, (_, i) => [0, (i - (n - 5) / 2) * 12] as const);
  return [...ORB_LAYOUT[4], ...extra];
}

/* ---------------- palette ---------------- */

export const BENCH = "#0a0b10";
export const BENCH_SOFT = "#11131b";
export const GLASS = "#05060a";
export const CREAM = "#eef0f6";
export const MUTED = "#8a90a3";
export const GRID_IDLE = "#5b6273";

export interface OrbPaint {
  base: string;
  light: string;
  deep: string;
  glow: string;
  label: string;
}

/** Eight luminous hues that stay distinct on black glass, by seat. */
export const ORB_PAINT: OrbPaint[] = [
  { base: "#ff4b5c", light: "#ffb1b8", deep: "#7a1420", glow: "rgba(255,75,92,0.7)", label: "Ruby" },
  { base: "#3ddc84", light: "#b4ffd3", deep: "#0e5c34", glow: "rgba(61,220,132,0.7)", label: "Jade" },
  { base: "#4a8dff", light: "#b9d3ff", deep: "#12357d", glow: "rgba(74,141,255,0.7)", label: "Cobalt" },
  { base: "#ffd23f", light: "#fff0b3", deep: "#7d5f06", glow: "rgba(255,210,63,0.7)", label: "Amber" },
  { base: "#ff5cf3", light: "#ffbcf9", deep: "#7a1670", glow: "rgba(255,92,243,0.7)", label: "Magenta" },
  { base: "#2ee6ff", light: "#b6f7ff", deep: "#0a6470", glow: "rgba(46,230,255,0.7)", label: "Cyan" },
  { base: "#ff8c2b", light: "#ffd1a8", deep: "#7a3a05", glow: "rgba(255,140,43,0.7)", label: "Tangerine" },
  { base: "#c86bff", light: "#e6c6ff", deep: "#4f177a", glow: "rgba(200,107,255,0.7)", label: "Violet" },
];

if (ORB_PAINT.length !== ORB_COLORS) throw new Error("orb palette size drifted from ORB_COLORS");

export const paintFor = (seat: number | null | undefined): OrbPaint =>
  ORB_PAINT[Math.max(0, Math.min(ORB_PAINT.length - 1, seat ?? 0))];

/* ---------------- cascade timing ---------------- */

/** Wave period in ms: brisk for short chains, tightening as a long one runs. */
export function waveMs(index: number, total: number): number {
  if (total <= 3) return 260;
  if (total <= 8) return 200;
  return Math.max(95, 190 - index * 6);
}

/** Pause after the orb lands before the first burst. */
export const PLACE_HOLD_MS = 170;

/**
 * When each recorded wave bursts, in ms from the moment the move arrives,
 * and when the whole replay is done. The sound bank and the board replay
 * both read from this, so pops land with the orbs.
 */
export function cascadeTimeline(waveCount: number): { starts: number[]; durations: number[]; end: number } {
  const starts: number[] = [];
  const durations: number[] = [];
  let t = PLACE_HOLD_MS;
  for (let k = 0; k < waveCount; k++) {
    const d = waveMs(k, waveCount);
    starts.push(t);
    durations.push(d);
    t += d;
  }
  return { starts, durations, end: t };
}
