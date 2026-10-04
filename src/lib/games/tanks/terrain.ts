/* The ridge. World units, y UP: x ∈ [0, W], y ∈ [0, H]. The ground is a
   height per column — dirt never overhangs, it settles, exactly like Pocket
   Tanks: blow a hole under a hill and the hill drops into it.

   Every terrain edit is a pure function of (ground, op) that rounds what it
   touches to a tenth, so the server and the replay — which apply the same
   ops in the same order — land on the same ridge. */

import type { Biome, TerrainOp } from "./types";

export const W = 1200;
export const H = 640;
/** world units per column */
export const COL = 2;
export const NCOL = W / COL;
/** bedrock: nothing digs below this */
export const FLOOR = 6;
/** dirt never piles above this */
export const CEIL = H - 70;
/** a tank's hit radius around its centre (x, y + TANK_CY) */
export const TANK_R = 14;
export const TANK_CY = 9;
/** the barrel pivots here above the tank's ground point, and is this long */
export const PIVOT_Y = 15;
export const BARREL = 20;
/** how far one drive goes */
export const DRIVE_DIST = 64;
/** tanks keep this far from the edges */
export const EDGE = 18;

const r1 = (v: number) => Math.round(v * 10) / 10;

/* ---------------- sampling ---------------- */

/** Ground height at x, linearly interpolated between column centres. */
export function heightAt(g: ArrayLike<number>, x: number): number {
  const f = x / COL - 0.5;
  if (f <= 0) return g[0];
  if (f >= NCOL - 1) return g[NCOL - 1];
  const i = Math.floor(f);
  const u = f - i;
  return g[i] * (1 - u) + g[i + 1] * u;
}

/** dh/dx around x. */
export const slopeAt = (g: ArrayLike<number>, x: number) => (heightAt(g, x + 3) - heightAt(g, x - 3)) / 6;

/** A tank rests on the highest point under its treads. */
export function tankGround(g: ArrayLike<number>, x: number): number {
  return r1(Math.max(heightAt(g, x - 8), heightAt(g, x), heightAt(g, x + 8)));
}

/** The tilt (radians, + = nose up to the right) a tank sits at. */
export function tankTilt(g: ArrayLike<number>, x: number): number {
  const a = Math.atan2(heightAt(g, x + 10) - heightAt(g, x - 10), 20);
  return Math.max(-0.5, Math.min(0.5, a));
}

/* ---------------- edits ---------------- */

function span(cx: number, r: number): [number, number] {
  return [Math.max(0, Math.ceil((cx - r) / COL - 0.5)), Math.min(NCOL - 1, Math.floor((cx + r) / COL - 0.5))];
}

/** Remove a disc of earth; whatever was above it drops into the gap. */
function carve(g: number[], cx: number, cy: number, r: number) {
  const [i0, i1] = span(cx, r);
  for (let i = i0; i <= i1; i++) {
    const dx = (i + 0.5) * COL - cx;
    const q = r * r - dx * dx;
    if (q <= 0) continue;
    const dy = Math.sqrt(q);
    const bot = cy - dy;
    const top = cy + dy;
    const h = g[i];
    if (h <= bot) continue;
    g[i] = r1(Math.max(FLOOR, h > top ? h - 2 * dy : bot));
  }
}

/** Drop a ball of earth; it lands on whatever is below and heaps up. */
function dirt(g: number[], cx: number, cy: number, r: number) {
  const [i0, i1] = span(cx, r);
  for (let i = i0; i <= i1; i++) {
    const dx = (i + 0.5) * COL - cx;
    const q = r * r - dx * dx;
    if (q <= 0) continue;
    const dy = Math.sqrt(q);
    const h = g[i];
    const next = h < cy - dy ? h + 2 * dy : Math.max(h, cy + dy);
    g[i] = r1(Math.min(CEIL, next));
  }
}

/** Raise a smooth mound centred on x. */
function bump(g: number[], cx: number, r: number, hgt: number) {
  const [i0, i1] = span(cx, r);
  for (let i = i0; i <= i1; i++) {
    const u = ((i + 0.5) * COL - cx) / r;
    if (u <= -1 || u >= 1) continue;
    const w = (1 - u * u) * (1 - u * u);
    g[i] = r1(Math.min(CEIL, g[i] + hgt * w));
  }
}

/** A row of discs along a segment: beams, drills, burrows. */
function line(g: number[], x1: number, y1: number, x2: number, y2: number, r: number) {
  const len = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.ceil(len / (r * 0.7)));
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    carve(g, r1(x1 + (x2 - x1) * u), r1(y1 + (y2 - y1) * u), r);
  }
}

/** Integer hash → [0, 1). Deterministic everywhere (no trig, no floats in). */
export function hash01(a: number, b: number): number {
  let h = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The ground slumps: smooth noise, strongest at the epicentre. */
function quake(g: number[], cx: number, r: number, amp: number, seed: number) {
  const [i0, i1] = span(cx, r);
  const STEP = 14; // columns between noise knots
  for (let i = i0; i <= i1; i++) {
    const dx = Math.abs((i + 0.5) * COL - cx);
    if (dx >= r) continue;
    const k = Math.floor(i / STEP);
    const u = i / STEP - k;
    const s = u * u * (3 - 2 * u);
    const n = hash01(k, seed) * (1 - s) + hash01(k + 1, seed) * s;
    g[i] = r1(Math.max(FLOOR, g[i] - amp * (1 - dx / r) * (0.35 + 0.65 * n)));
  }
}

export function applyOp(g: number[], op: TerrainOp): void {
  switch (op.k) {
    case "carve":
      return carve(g, op.x, op.y, op.r);
    case "dirt":
      return dirt(g, op.x, op.y, op.r);
    case "bump":
      return bump(g, op.x, op.r, op.h);
    case "line":
      return line(g, op.x1, op.y1, op.x2, op.y2, op.r);
    case "quake":
      return quake(g, op.x, op.r, op.amp, op.seed);
  }
}

/* ---------------- driving ---------------- */

/** Where a tank at x ends up driving `dir`: it stops at cliffs and edges. */
export function driveTo(g: ArrayLike<number>, x: number, dir: -1 | 1, others: number[]): number {
  let at = x;
  for (let s = 0; s < DRIVE_DIST; s++) {
    const next = at + dir;
    if (next < EDGE || next > W - EDGE) break;
    if (others.some((o) => Math.abs(o - next) < 30)) break; // don't ram another tank
    if (tankGround(g, next) - tankGround(g, at) > 1.6) break; // too steep to climb
    at = next;
  }
  return at;
}

/* ---------------- generation ---------------- */

/** Value noise from control knots every `step` columns, smoothstepped. */
function octave(rng: () => number, step: number): (i: number) => number {
  const knots = Array.from({ length: Math.ceil(NCOL / step) + 2 }, () => rng());
  return (i: number) => {
    const f = i / step;
    const k = Math.floor(f);
    const u = f - k;
    const s = u * u * (3 - 2 * u);
    return knots[k] * (1 - s) + knots[k + 1] * s;
  };
}

const BIOME_SHAPE: Record<Biome, { base: number; amp: number; rough: number }> = {
  mesa: { base: 190, amp: 230, rough: 0.22 },
  tundra: { base: 170, amp: 260, rough: 0.3 },
  ashlands: { base: 160, amp: 250, rough: 0.38 },
  lunar: { base: 170, amp: 180, rough: 0.18 },
};

/** Spread the tanks across the ridge with a little jitter. */
export function spawnXs(n: number, rng: () => number): number[] {
  const margin = 110;
  const span = W - 2 * margin;
  return Array.from({ length: n }, (_, i) => {
    const base = margin + (n === 1 ? span / 2 : (span * i) / (n - 1));
    return Math.round(base + (rng() * 2 - 1) * 26);
  });
}

/** A fresh ridge for `biome`, with a level pad under every spawn point. */
export function generateGround(biome: Biome, spawns: number[], rng: () => number): number[] {
  const shape = BIOME_SHAPE[biome];
  const big = octave(rng, 150);
  const mid = octave(rng, 48);
  const fine = octave(rng, 9);
  const g: number[] = [];
  for (let i = 0; i < NCOL; i++) {
    const n = big(i) * 0.62 + mid(i) * (0.38 - shape.rough * 0.4) + fine(i) * shape.rough * 0.4;
    g.push(shape.base + n * shape.amp);
  }
  // mesas get flat tops: quantise the high ground into shelves
  if (biome === "mesa") {
    for (let i = 0; i < NCOL; i++) {
      const shelf = 46;
      const q = Math.round(g[i] / shelf) * shelf;
      g[i] = g[i] * 0.45 + q * 0.55;
    }
  }
  // level pads where the tanks start
  for (const sx of spawns) {
    const c = Math.round(sx / COL);
    const pad = 16;
    const level = g.slice(Math.max(0, c - pad), Math.min(NCOL, c + pad)).reduce((a, b) => a + b, 0) / (2 * pad);
    for (let i = c - pad * 2; i <= c + pad * 2; i++) {
      if (i < 0 || i >= NCOL) continue;
      const d = Math.abs(i - c);
      const w = d <= pad ? 1 : 1 - (d - pad) / pad;
      const s = w * w * (3 - 2 * w);
      g[i] = g[i] * (1 - s) + level * s;
    }
  }
  return g.map((h) => r1(Math.max(60, Math.min(CEIL - 60, h))));
}
