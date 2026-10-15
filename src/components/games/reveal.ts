/* Card sizing for the social-deduction endgame reveals (Avalon, Secret
   Hitler): every role card on the table, as large as the screen allows,
   without the page ever scrolling. */

import { clamp } from "@/lib/client/useBox";

export interface RevealFit {
  /** factions side by side (with a divider) or stacked */
  side: boolean;
  /** card width */
  w: number;
  /** gap between cards */
  gap: number;
  /** gap between the two side-by-side factions (each side of the divider) */
  split: number;
}

/** Card size for an end-of-game reveal: two factions of cards, side by side
    or stacked, as large as the measured card zone allows. `zoneW` is the
    zone's width, `budgetH` the height it may take before the page would
    scroll. Each card column is `w + 4` wide with a name line under it. */
export function fitReveal(
  zoneW: number,
  budgetH: number,
  groups: [number, number],
  { maxW = 160, minW = 46, aspect = 1.4, nameH = 22, labelH = 26, stackGap = 16 } = {}
): RevealFit {
  const gap = zoneW >= 600 ? 14 : 10;
  const split = zoneW >= 1000 ? 48 : 28;
  if (!zoneW || budgetH <= 0) return { side: zoneW >= 720, w: minW, gap, split };
  const big = Math.max(...groups);
  const cell = (room: number, cols: number) => (room - gap * (cols - 1)) / cols - 4;
  let best: RevealFit = { side: false, w: 0, gap, split };
  const take = (side: boolean, w: number) => {
    if (w > best.w + 0.5) best = { side, w, gap, split };
  };
  // side by side: each faction gets half the zone, one to three rows
  if (zoneW >= 720) {
    const half = (zoneW - split * 2 - 1) / 2;
    for (let rows = 1; rows <= 3; rows++) {
      const cols = Math.ceil(big / rows);
      const r = Math.ceil(big / cols);
      const byH = (budgetH - labelH - r * nameH - (r - 1) * gap) / r / aspect;
      take(true, Math.min(cell(half, cols), byH));
    }
  }
  // stacked: one faction above the other
  for (let cols = 2; cols <= 6; cols++) {
    const r = Math.ceil(groups[0] / cols) + Math.ceil(groups[1] / cols);
    const byH = (budgetH - 2 * labelH - stackGap - r * nameH - (r - 2) * gap) / r / aspect;
    take(false, Math.min(cell(zoneW, cols), byH));
  }
  return { ...best, w: Math.floor(clamp(best.w, minW, maxW)) };
}
