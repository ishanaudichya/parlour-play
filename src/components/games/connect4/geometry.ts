/* Board geometry for the Four in a Row cabinet. Everything is expressed in
   SVG user units so the whole board is one scalable <svg> — no percentage
   maths, no fixed pixels, and every coordinate is an integer (nothing here is
   derived from trig, so there is no 1-ULP hydration risk). */

import { COLS, ROWS, type Disc } from "@/lib/games/connect4/types";

/** One grid square. */
export const CELL = 100;
/** Thickness of the moulded plastic frame around the grid. */
export const FRAME = 26;
/** Punched hole radius. */
export const HOLE_R = 40;
/** Disc radius — a hair wider than the hole, so the plastic clips its rim. */
export const DISC_R = 41;
/** Open air above the board where the ghost disc waits and the drop begins. */
export const LIP = 96;
/** Stubby moulded legs under the board. */
export const LEG_H = 30;

export const BOARD_W = COLS * CELL + FRAME * 2;
export const BOARD_H = ROWS * CELL + FRAME * 2;
/** A little horizontal slack so glows aren't clipped. */
export const BLEED = 8;

export const VIEWBOX = `${-BLEED} ${-LIP} ${BOARD_W + BLEED * 2} ${LIP + BOARD_H + LEG_H}`;

/** Centre of column `col`. */
export const cx = (col: number) => FRAME + col * CELL + CELL / 2;
/** Centre of row `row` — row 0 is the BOTTOM of the board. */
export const cy = (row: number) => FRAME + (ROWS - 1 - row) * CELL + CELL / 2;

/** Resting height of the ghost / about-to-fall disc, in the lip. */
export const HOVER_Y = -LIP / 2;

/** Round a derived coordinate — keeps server and client byte-identical. */
export const n2 = (x: number) => Number(x.toFixed(2));

/**
 * Fall time in seconds, scaled a little by the distance dropped:
 * 0.28s into the top row, 0.38s all the way to the floor.
 */
export function fallSeconds(row: number): number {
  const rowsFallen = ROWS - Math.max(0, Math.min(ROWS - 1, row));
  return n2(0.26 + rowsFallen * 0.02);
}

/** Gravity in, one small settle bounce out. */
export const FALL_EASE: [number, number, number, number] = [0.4, 0, 0.85, 0.55];
export const BOUNCE_UP: [number, number, number, number] = [0.3, 0, 0.6, 1];
export const BOUNCE_DOWN: [number, number, number, number] = [0.4, 0, 0.65, 1];
/** Bounce height in user units (~6 CSS px on a 500px board). */
export const BOUNCE = 9;
/** The house UI easing everywhere the disc physics doesn't apply. */
export const SWIFT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* ---------------- palette ---------------- */

export const INK = "#0f0d16";
export const INK_SOFT = "#171420";
export const AMBER = "#f5b23e";
export const CREAM = "#f4ead8";
export const MUTED = "#a2957f";
export const PLASTIC_HI = "#1b3fa0";
export const PLASTIC_LO = "#12266b";

export interface DiscPaint {
  base: string;
  light: string;
  deep: string;
  ring: string;
  glow: string;
  label: string;
}

export const DISC_PAINT: Record<Disc, DiscPaint> = {
  red: {
    base: "#e2483f",
    light: "#ff8b7e",
    deep: "#7d1b18",
    ring: "#f8897c",
    glow: "rgba(255,122,109,0.65)",
    label: "Red",
  },
  yellow: {
    base: "#f5b23e",
    light: "#ffdc8d",
    deep: "#8f5a0c",
    ring: "#ffd784",
    glow: "rgba(255,205,116,0.65)",
    label: "Gold",
  },
};

/** Every cell on the board, bottom-left first — handy for map()ing markup. */
export const ALL_CELLS: { col: number; row: number }[] = Array.from(
  { length: COLS * ROWS },
  (_, i) => ({ col: i % COLS, row: Math.floor(i / COLS) })
);
