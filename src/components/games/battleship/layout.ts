/* Battleship layout maths. The screen measures the stage (the viewport left
   under the toolbar and status strip) and asks these functions how big the
   grids may be, so the waters are always as large as the room allows —
   side by side when the stage is wide, stacked when it is tall. */

/** Section label row above a grid, including its gap. */
export const LABEL_H = 22;
/** Fleet strip under a grid, including its gap. */
export const STRIP_H = 46;
/** Horizontal gap between two side-by-side boards. */
export const GAP_X = 28;
/** Vertical gap between stacked boards. */
export const GAP_Y = 14;
/** The damage-control list beside the small stacked board. */
export const PANEL_W = 128;
export const PANEL_GAP = 12;
/** Compact ship dock under a stacked placement grid. */
export const DOCK_COMPACT_H = 138;
/** Height the full ship dock (label included) needs beside the placement grid. */
export const DOCK_FULL_H = 430;
/** Never let a grid grow past this on a wall-sized screen. */
export const MAX_GRID = 960;

/** Coordinate rails (A–J across the top, 1–10 down the side) grow with the grid. */
export const railW = (s: number) => Math.round(Math.min(28, Math.max(16, s * 0.034)));
export const railH = (s: number) => Math.round(Math.min(22, Math.max(14, s * 0.026)));
export const railFont = (s: number) => Math.round(Math.min(14, Math.max(9, s * 0.019)));

/** Largest 10×10 grid (px, rails excluded) whose framed box fits w × h. */
export function fit(w: number, h: number): number {
  const s0 = Math.max(0, Math.min(w, h));
  // rails only grow with s, so one step from the upper bound is always safe
  const s = Math.min(w - railW(s0), h - railH(s0));
  return Math.max(0, Math.min(MAX_GRID, Math.floor(s)));
}

export type PlaceLayout = { mode: "side"; s: number; dockW: number } | { mode: "stack"; s: number; dockH: number };

export function placementLayout(W: number, H: number): PlaceLayout {
  const dockW = Math.round(Math.min(340, Math.max(280, W * 0.24)));
  const side = fit(W - dockW - GAP_X, H - LABEL_H);
  const stack = fit(W, H - LABEL_H - GAP_Y - DOCK_COMPACT_H);
  if (H >= DOCK_FULL_H && side >= stack * 0.8) return { mode: "side", s: side, dockW };
  // spare height goes to the dock's buttons (bigger thumbs), up to a point
  const spare = H - (LABEL_H + railH(stack) + stack + GAP_Y + DOCK_COMPACT_H);
  return { mode: "stack", s: stack, dockH: DOCK_COMPACT_H + Math.max(0, Math.min(36, spare)) };
}

export type BattleLayout =
  | { mode: "side"; a: number; b: number }
  /** a = top board (targeting), b = the board below; `panel` = its fleet list sits beside it */
  | { mode: "stack"; a: number; b: number; panel: boolean };

/**
 * Two boards. Players get the targeting grid on top (it's where you tap)
 * with their own fleet below it, smaller, its damage list alongside;
 * spectators get two equal shot maps.
 */
export function battleLayout(W: number, H: number, spectator: boolean): BattleLayout {
  const side = fit((W - GAP_X) / 2, H - LABEL_H - STRIP_H);
  if (spectator) {
    const each = fit(W, (H - 2 * (LABEL_H + STRIP_H) - GAP_Y) / 2);
    return side >= each * 0.8 ? { mode: "side", a: side, b: side } : { mode: "stack", a: each, b: each, panel: false };
  }
  const R = H - 2 * LABEL_H - STRIP_H - GAP_Y; // both framed grids share this height
  const bW = W - PANEL_W - PANEL_GAP;
  let a = fit(W, R * 0.6);
  const b = Math.min(a, fit(bW, R - a - railH(a)));
  a = fit(W, R - b - railH(b));
  if (side >= a * 0.8) return { mode: "side", a: side, b: side };
  return { mode: "stack", a, b, panel: true };
}
