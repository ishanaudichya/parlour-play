"use client";

/* The table is sized to the room it actually has. The play area (everything
   under the toolbar, left of the chronicle) is measured, then the opponents'
   seats, your hand and the action dock are scaled to fill it — bounded by
   BOTH width and height, so nothing scrolls and nothing floats in a sea of
   empty felt on a big screen. */

import { clamp } from "@/lib/client/useBox";

export interface TableLayout {
  /** narrow screen: the dock stacks (hand + name above, controls below) */
  phone: boolean;
  /** horizontal gutter of the play area */
  padX: number;
  /** width of one of your cards (cards are 2:3) */
  yc: number;
  /** dock outer width cap and inner padding */
  dockW: number;
  dockPad: number;
  /** action buttons per row (7 = one row, 4 = 4 + 3) */
  actionCols: 4 | 7;
  /** dock body is tall enough for the action blurbs */
  roomy: boolean;
  /** opponent card width, seat width, seat columns */
  ow: number;
  seatW: number;
  cols: number;
  seatGap: number;
  /** centre-stage headline size (px) */
  banner: number;
  /** width of the claimed-character card shown in the court (0: no room) */
  claimW: number;
}

/** seat chrome around the two cards: padding, header row, gap above the cards */
export function seatChrome(ow: number, phone: boolean) {
  const pad = phone ? 7 : ow > 80 ? 12 : 10;
  const med = Math.round(clamp(ow * 0.42, 24, 40));
  // header row: medallion beside name + coins (two text lines)
  const head = Math.max(med, ow > 80 ? 50 : 40);
  const gap = phone ? 5 : ow > 80 ? 8 : 6;
  return { pad, med, head, gap };
}

export function tableLayout(w: number, h: number, opponents: number, hasDock = true): TableLayout {
  // first paint before measuring: something sane
  if (!w || !h) {
    return {
      phone: false,
      padX: 16,
      yc: 96,
      dockW: 900,
      dockPad: 18,
      actionCols: 7,
      roomy: false,
      ow: 48,
      seatW: 142,
      cols: Math.max(1, opponents),
      seatGap: 14,
      banner: 24,
      claimW: 0,
    };
  }

  const phone = w < 640;
  const padX = phone ? 8 : w > 1100 ? 24 : 16;

  /* ---------------- your dock ---------------- */
  const dockW = Math.min(w - 2 * padX, 1160);
  const dockPad = phone ? 10 : h > 820 && w > 1000 ? 22 : 16;
  const inner = dockW - 2 * dockPad;

  let yc: number;
  let actionCols: 4 | 7;
  let dockH: number;
  let roomy = false;
  if (phone) {
    // hand + name on top, controls in a full-width band below
    yc = clamp(Math.min(h * 0.115, (inner - 10) * 0.22), 46, 92);
    actionCols = 4;
    const band = 2 * 52 + 6;
    dockH = yc * 1.5 + 10 + band + 2 * dockPad + 8;
  } else {
    const gutter = w > 1000 ? 28 : 20;
    // the controls column needs ~400px for the 4 + 3 grid (so "Assassin · pay 3"
    // keeps to one line); the hand takes the rest
    yc = clamp(Math.min(h * 0.2, (inner - 400 - gutter - 10) / 2), 70, 196);
    const ctxW = inner - 2 * yc - 10 - gutter;
    actionCols = ctxW >= 900 ? 7 : 4;
    const head = 40;
    // the controls need this much height; the hand may be shorter than that
    const need = head + 12 + (actionCols === 7 ? 64 : 2 * 56 + 8);
    const body = Math.max(yc * 1.5, need);
    const btnW = actionCols === 7 ? (ctxW - 6 * 10) / 7 : (ctxW - 3 * 8) / 4;
    const rowH = actionCols === 7 ? body - head - 12 : (body - head - 12 - 8) / 2;
    roomy = btnW >= 124 && rowH >= 86;
    dockH = body + 2 * dockPad + 12;
  }

  if (!hasDock) dockH = 0;

  /* ---------------- opponents ---------------- */
  const centerMin = phone ? 88 : h > 820 ? 170 : 124;
  const top = phone ? 10 : 16;
  // a spectator has no hand to show: the seats may take most of the room
  const share = hasDock ? (phone ? 0.44 : 0.4) : 0.62;
  const budget = Math.max(96, Math.min(h * share, h - dockH - centerMin - top));
  const owMax = hasDock ? Math.min(phone ? 66 : 132, yc * (phone ? 0.85 : 0.72)) : phone ? 84 : 150;
  const seatGap = phone ? 8 : w > 1100 ? 18 : 12;
  const availW = w - 2 * padX;

  let best = { cols: Math.max(1, opponents), ow: 0 };
  const m = Math.max(1, opponents);
  for (let rows = 1; rows <= m; rows++) {
    // the fewest columns that still fit everyone in this many rows
    const cols = Math.ceil(m / rows);
    if (Math.ceil(m / cols) !== rows) continue;
    const seatW = (availW - (cols - 1) * seatGap) / cols;
    // chrome depends on card size; iterate once with a guess
    let ow = owMax;
    for (let k = 0; k < 2; k++) {
      const c = seatChrome(ow, phone);
      const owW = (seatW - 2 * c.pad - c.gap) / 2;
      const rowH = (budget - (rows - 1) * seatGap) / rows;
      const owH = (rowH - c.head - 2 * c.pad - (phone ? 6 : 8)) / 1.5;
      ow = Math.min(owW, owH, owMax);
    }
    // more rows only when it buys clearly bigger cards
    if (ow > best.ow * 1.12 || best.ow === 0) best = { cols, ow };
  }
  const ow = Math.floor(clamp(best.ow, phone ? 30 : 36, owMax));
  const c = seatChrome(ow, phone);
  const minSeat = phone ? 104 : 132;
  const seatW = Math.floor(
    Math.min((availW - (best.cols - 1) * seatGap) / best.cols, Math.max(minSeat, 2 * ow + 2 * c.pad + c.gap))
  );

  const banner = phone ? (w < 380 ? 18 : 20) : Math.round(clamp(Math.min(h * 0.034, w * 0.026), 22, 34));

  // what's left for the court once seats and dock are placed
  const rows = Math.ceil(m / best.cols);
  const seatH = c.pad * 2 + 2 + c.head + (phone ? 6 : 8) + ow * 1.5;
  const centerH = h - dockH - top - rows * seatH - (rows - 1) * seatGap;
  const cw = Math.min(ow * 1.05, (centerH - (phone ? 120 : 150)) / 1.5);
  const claimW = cw >= (phone ? 40 : 56) ? Math.floor(cw) : 0;

  return {
    phone,
    padX,
    yc: Math.floor(yc),
    dockW,
    dockPad,
    actionCols,
    roomy,
    ow,
    seatW,
    cols: best.cols,
    seatGap,
    banner,
    claimW,
  };
}
