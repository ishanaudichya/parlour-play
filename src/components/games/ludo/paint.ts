/* Ludo design tokens — an heirloom board: a lacquered walnut frame with a
   brass bevel, an ivory enamel playing surface ruled in brown ink, four
   quadrants in heritage pigments, and glossy domed tokens. Everything is
   expressed so the board is one scalable <svg>: 60-unit cells, integer
   geometry. */

import type { LudoColor } from "@/lib/games/ludo/types";

/** One grid cell, in SVG user units. */
export const C = 60;
/** Cells per side. */
export const N = 15;
/** The lacquer frame around the playing surface. */
export const FRAME = 46;
export const BOARD = N * C;
export const SIZE = BOARD + FRAME * 2;
/** Token radius. */
export const TOKEN_R = 19;

/** Grid-unit point → SVG coordinate. */
export const px = (u: number) => FRAME + u * C;

/** Round a derived coordinate — keeps server and client byte-identical. */
export const n2 = (x: number) => Number(x.toFixed(2));

export const SWIFT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ---------------- palette ---------------- */

export const IVORY = "#f3e9d2";
export const IVORY_DEEP = "#e4d6b6";
export const INK = "#4a3220";
export const INK_SOFT = "rgba(74,50,32,0.38)";
export const LACQUER = "#2b1510";
export const LACQUER_DEEP = "#150a07";
export const BRASS = "#c9a45c";
export const BRASS_LIGHT = "#eed9a4";
export const CREAM = "#f4ead8";
export const MUTED = "#a4937a";
export const BENCH = "#1a100b";

export interface ColorPaint {
  base: string;
  light: string;
  deep: string;
  /** a wash for home columns and slot fills */
  tint: string;
  label: string;
}

export const PAINT: Record<LudoColor, ColorPaint> = {
  red: { base: "#c8402e", light: "#ec7d6a", deep: "#7a1f14", tint: "#e9b9ae", label: "Vermilion" },
  blue: { base: "#2f5da8", light: "#7aa0e2", deep: "#182f5a", tint: "#b9c9e8", label: "Indigo" },
  yellow: { base: "#dfa62a", light: "#f7cf6f", deep: "#8a6210", tint: "#f0dca8", label: "Marigold" },
  green: { base: "#2e7d5b", light: "#6ab993", deep: "#163f2d", tint: "#b7d9c6", label: "Emerald" },
};

/** Which way a token leaves its start square — for the little arrow. */
export const START_HEADING: Record<LudoColor, "E" | "N" | "W" | "S"> = {
  red: "E",
  blue: "N",
  yellow: "W",
  green: "S",
};

/* ---------------- animation timing ---------------- */

/** The die tumbles for this long before it shows its face. */
export const ROLL_MS = 620;
/** One hop, square to square. */
export const HOP_MS = 135;
/** Leaving the yard for the start square. */
export const OUT_MS = 380;
/** A captured token flying home. */
export const FLY_MS = 520;
/** Pause between the mover landing and the victims flying. */
export const CAPTURE_GAP_MS = 90;

/** How long a move's replay takes, from the moment the hop starts. */
export function moveDuration(from: number, to: number, captured: number): number {
  const travel = from < 0 ? OUT_MS : (to - from) * HOP_MS;
  return travel + (captured ? CAPTURE_GAP_MS + FLY_MS : 0);
}

/* ---------------- the room ----------------
   The table is the board writ large: four deep panels in the four pigments,
   green over red on the left, marigold over indigo on the right, meeting in a
   cross behind the board. Darker than the board's own colours, so the board
   is always the brightest thing in the room. */

export const ROOM: Record<LudoColor, string> = {
  red: "#7e2619",
  blue: "#213e76",
  yellow: "#9a6c1c",
  green: "#1e5340",
};

/** Cards and panels sitting on the coloured panels. */
export const CARD_BG = "rgba(24,11,9,0.5)";
export const CARD_BG_ACTIVE = "rgba(24,11,9,0.72)";
export const CARD_BORDER = "rgba(243,233,210,0.14)";
export const TEXT_SOFT = "rgba(243,233,210,0.72)";
