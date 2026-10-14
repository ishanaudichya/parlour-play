/* Dots and Boxes — the pen-and-paper classic. Players take turns drawing a
   line between two neighbouring dots; whoever draws the fourth side of a box
   claims it and draws again. When every line is drawn, most boxes wins (a
   level score is a draw).

   The page is set up first: the host picks how many boxes wide and how many
   tall, everyone watching the preview, then starts. Perfect information —
   player and spectator views are identical apart from `youId`. */

/** Per-line deadline; expiry draws a sensible line for you. */
export const LINE_MS = 30_000;
/** How long the host has to set the page up before it starts as it is. */
export const SETUP_MS = 90_000;
export const LOG_CAP = 60;
/** Boxes across / down: the page can be anywhere from 2×2 to 12×12. */
export const MIN_SIDE = 2;
export const MAX_SIDE = 12;
export const DEFAULT_W = 5;
export const DEFAULT_H = 5;

export type DotsPhase = "setup" | "play" | "over";
/** h = a horizontal line, v = a vertical one */
export type Orient = "h" | "v";

export type DotsMove =
  /** host, during setup: the size of the page, in boxes */
  | { type: "size"; w: number; h: number }
  /** host, during setup: open the page */
  | { type: "start" }
  | { type: "line"; o: Orient; r: number; c: number };

export interface DotsPlayer {
  id: string;
  name: string;
  /** stable index within the game; turn order and ink colour */
  seat: number;
  score: number;
  /** walked out of the party mid-game */
  left: boolean;
}

export interface LastLine {
  /** move number, 1-based — identifies this line for the pen animation */
  seq: number;
  seat: number;
  o: Orient;
  r: number;
  c: number;
  /** boxes this line closed */
  boxes: number[];
}

export type DotsLogKind = "setup" | "start" | "box" | "timeout" | "left" | "win" | "draw";

export interface DotsLogEntry {
  i: number;
  ts: number;
  kind: DotsLogKind;
  actor?: string;
  seat?: number;
  n?: number;
  w?: number;
  h?: number;
}

/**
 * Lines and boxes are flat arrays holding the seat that drew/claimed them
 * (−1 for none):
 *   horizontal line (r, c): r ∈ 0..h, c ∈ 0..w−1 → hLines[r·w + c]
 *   vertical line   (r, c): r ∈ 0..h−1, c ∈ 0..w → vLines[r·(w+1) + c]
 *   box             (r, c): r ∈ 0..h−1, c ∈ 0..w−1 → boxes[r·w + c]
 */
export interface DotsState {
  phase: DotsPhase;
  players: DotsPlayer[];
  /** boxes across and down */
  w: number;
  h: number;
  hLines: number[];
  vLines: number[];
  boxes: number[];
  /** setup: who chooses the page (the host); play: whose line it is */
  turn: string;
  deadline: number | null;
  moves: number;
  last: LastLine | null;
  winner: string | null;
  winBy: "boxes" | "forfeit" | null;
  startedAt: number;
  log: DotsLogEntry[];
  logSeq: number;
  updatedAt: number;
}

export interface DotsView extends Omit<DotsState, "logSeq" | "updatedAt"> {
  youId: string;
  now: number;
}
