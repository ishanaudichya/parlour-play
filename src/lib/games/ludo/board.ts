/* Board geometry, shared by the engine, the fuzz suite and the UI. The board
   is the classic 15×15 cross: four 6×6 yards in the corners, four 3×6 arms,
   and the 3×3 home in the middle. Coordinates are grid cells, column x
   0..14 left→right and row y 0..14 top→bottom.

   The loop runs from red's start square along the left arm's bottom row
   toward the middle, down the bottom arm, along the right arm, up the top
   arm and back down the left edge — 52 squares, 13 per arm (the two outer
   rows of six plus the single outer-middle square). Where one arm meets the
   next the path steps across the corner of the home, as it does on the
   printed board. */

import { HOME_STRETCH, LAST_TRACK, TRACK_LEN, type LudoColor } from "./types";

export type Cell = readonly [number, number];

/** Turn order around the board, and the seat → colour order. */
export const COLOR_ORDER: readonly LudoColor[] = ["red", "blue", "yellow", "green"];

/** Colours dealt for a table of `n` — two players sit opposite each other. */
export function colorsFor(n: number): LudoColor[] {
  if (n <= 2) return ["red", "yellow"];
  if (n === 3) return ["red", "blue", "yellow"];
  return [...COLOR_ORDER];
}

/** The 52 shared squares, in travel order from red's start. */
export const TRACK: readonly Cell[] = [
  // left arm, bottom row, toward the middle
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  // bottom arm, left column, downward
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  // bottom edge
  [7, 14],
  // bottom arm, right column, upward
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  // right arm, bottom row, outward
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  // right edge
  [14, 7],
  // right arm, top row, toward the middle
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  // top arm, right column, upward
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  // top edge
  [7, 0],
  // top arm, left column, downward
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  // left arm, top row, outward
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  // left edge
  [0, 7],
  [0, 8],
];

/** Where each colour enters the loop. 13 apart, in turn order. */
export const START_INDEX: Record<LudoColor, number> = { red: 0, blue: 13, yellow: 26, green: 39 };

/** The eight squares where nothing can be captured: every start, and the star eight squares on. */
export const SAFE_INDEXES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/** The star squares specifically (safe squares that are not starts). */
export const STAR_INDEXES: ReadonlySet<number> = new Set([8, 21, 34, 47]);

/** The five home-column squares, from the entry toward the middle. */
export const HOME_COLUMN: Record<LudoColor, readonly Cell[]> = {
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  blue: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
  green: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
};

/** Top-left cell of each 6×6 yard. */
export const YARD_ORIGIN: Record<LudoColor, Cell> = {
  red: [0, 9],
  blue: [9, 9],
  yellow: [9, 0],
  green: [0, 0],
};

/** The four resting spots inside a yard, in cell units (may be half-cells). */
export function yardSlots(color: LudoColor): Cell[] {
  const [x0, y0] = YARD_ORIGIN[color];
  return [
    [x0 + 2, y0 + 2],
    [x0 + 4, y0 + 2],
    [x0 + 2, y0 + 4],
    [x0 + 4, y0 + 4],
  ];
}

/** Where a finished token rests: the centroid of its colour's home triangle. */
export const HOME_SPOT: Record<LudoColor, Cell> = {
  red: [6.55, 7.5],
  blue: [7.5, 8.45],
  yellow: [8.45, 7.5],
  green: [7.5, 6.55],
};

/** Absolute loop index of a colour's token at relative position `pos` (0..50). */
export function trackIndex(color: LudoColor, pos: number): number {
  return (START_INDEX[color] + pos) % TRACK_LEN;
}

/** Is relative position `pos` on the shared loop (as opposed to yard / home column / home)? */
export const onTrack = (pos: number) => pos >= 0 && pos <= LAST_TRACK;

export const inHomeColumn = (pos: number) => pos > LAST_TRACK && pos <= LAST_TRACK + HOME_STRETCH;

/**
 * The cell a token of `color` at relative position `pos` occupies. Yard and
 * home positions need the token index (which slot) — callers that only want
 * board squares can pass 0.
 */
export function cellFor(color: LudoColor, pos: number, token = 0): Cell {
  if (pos < 0) return yardSlots(color)[token] ?? yardSlots(color)[0];
  if (onTrack(pos)) return TRACK[trackIndex(color, pos)];
  if (inHomeColumn(pos)) return HOME_COLUMN[color][pos - LAST_TRACK - 1];
  return HOME_SPOT[color];
}

/**
 * Where to DRAW a token, as a point in cell units (multiply by the cell size).
 * Board squares are drawn at their centre; yard slots and home spots are
 * already points.
 */
export function pointFor(color: LudoColor, pos: number, token = 0): Cell {
  if (pos < 0 || pos > LAST_TRACK + HOME_STRETCH) return cellFor(color, pos, token);
  const [x, y] = cellFor(color, pos, token);
  return [x + 0.5, y + 0.5];
}
