/* The STACC's geometry. A STACCS card is a hexagon drawn as a cube: three
   rhombus surfaces — TOP, SIDE (right) and FACE (left). Laid on the table,
   a new card overlaps exactly one surface of the card it stacks onto, so the
   whole structure lives on a triangular lattice:

   - card centres sit on lattice VERTICES, axial (i, j) ↔ point i·e1 + j·e2
     with e1 = (√3/2, ½) and e2 = (−√3/2, ½), in card-radius units, y down;
   - each card covers the six lattice TRIANGLES around its centre;
   - a surface is two of those triangles, which two depends on rotation.

   Placement legality is then pure bookkeeping on triangles: a new card
   touches every surface it covers completely while that surface is still
   fully showing; each must be unlocked and matched (suit on a top, number on
   a side, letter on a
   face). Laying a card over PART of some other surface is fine — that
   surface just drops out of play — as the rulebook's own examples show.
   Pure functions; shared by the engine, the client and the fuzz test. */

import type { BoardCard, Card, Surface } from "./types";

export type V = [number, number];

/** Unit steps from a vertex, by direction index. 0 = up, then clockwise. */
export const DIRS: V[] = [
  [-1, -1], // 0 up
  [0, -1], // 1 upper-right
  [1, 0], // 2 lower-right
  [1, 1], // 3 down
  [0, 1], // 4 lower-left
  [-1, 0], // 5 upper-left
];

const SQ3_2 = Math.sqrt(3) / 2;

/** Lattice vertex → plane point (card-radius units, y down). */
export function toXY([i, j]: V): [number, number] {
  return [(i - j) * SQ3_2, (i + j) / 2];
}

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1]];

/** Canonical key for the triangle with corner vertices a, b, c. */
function triKey(a: V, b: V, c: V): string {
  return [a, b, c]
    .map((v) => `${v[0]},${v[1]}`)
    .sort()
    .join("|");
}

/** The six triangles around vertex v; triangle k lies between directions k and k+1. */
export function trianglesAt(v: V): string[] {
  const out: string[] = [];
  for (let k = 0; k < 6; k++) out.push(triKey(v, add(v, DIRS[k]), add(v, DIRS[(k + 1) % 6])));
  return out;
}

/** Which surface triangle k (relative to the card's centre) belongs to, for a card at rotation r. */
export function surfaceOf(k: number, r: number): Surface {
  const rel = (((k - r) % 6) + 6) % 6;
  return rel === 5 || rel === 0 ? "top" : rel === 1 || rel === 2 ? "side" : "face";
}

/** The triangle indexes of a surface at rotation r. */
export function surfaceTris(s: Surface, r: number): [number, number] {
  const base = s === "top" ? [5, 0] : s === "side" ? [1, 2] : [3, 4];
  return [(base[0] + r) % 6, (base[1] + r) % 6];
}

/** Where a card must be centred to cover surface s of a card at v with rotation r. */
export function beyond(v: V, s: Surface, r: number): V {
  const d = s === "top" ? 0 : s === "side" ? 2 : 4;
  return add(v, DIRS[(d + r) % 6]);
}

/* ---------------- the table ---------------- */

export interface Bounds {
  /** half-width in card-radius units */
  x: number;
  /** top and bottom edges (y down) */
  top: number;
  bottom: number;
}

/** One deck plays on a table; two decks get one twice as roomy. */
export const BOUNDS_ONE: Bounds = { x: 8.7, top: -13.6, bottom: 4.1 };
export const BOUNDS_TWO: Bounds = { x: 11.7, top: -17.6, bottom: 5.1 };

/** All six corners of a card centred at v sit on the table. */
export function onTable(v: V, b: Bounds): boolean {
  const [cx, cy] = toXY(v);
  return cx - SQ3_2 >= -b.x - 1e-9 && cx + SQ3_2 <= b.x + 1e-9 && cy - 1 >= b.top - 1e-9 && cy + 1 <= b.bottom + 1e-9;
}

/* ---------------- coverage ---------------- */

export interface Cover {
  /** triangle key → index (in board order) of the card on top of it */
  owner: Map<string, number>;
}

export function coverage(board: BoardCard[]): Cover {
  const owner = new Map<string, number>();
  board.forEach((b, idx) => trianglesAt(b.v).forEach((t) => owner.set(t, idx)));
  return { owner };
}

/** Surfaces of a board card still fully visible. */
export function visibleSurfaces(board: BoardCard[], cov: Cover, idx: number): Surface[] {
  const tris = trianglesAt(board[idx].v);
  return (["top", "side", "face"] as Surface[]).filter((s) => surfaceTris(s, board[idx].rot).every((k) => cov.owner.get(tris[k]) === idx));
}

/* ---------------- matching ---------------- */

export const isNumber = (c: Card) => c.rank !== "W" && typeof c.rank === "number";
export const isLetter = (c: Card) => c.rank === "J" || c.rank === "Q" || c.rank === "K" || c.rank === "A";

/** Does `c` match surface `s` of board card `b`? */
export function matches(c: Card, b: BoardCard, s: Surface): boolean {
  if (s === "top") {
    const suit = b.card.rank === "W" ? b.called : b.card.suit;
    return c.rank === "W" || c.suit === suit;
  }
  if (c.rank === "W") return false; // wilds only ever go on a top
  if (s === "side") return isNumber(c) && isNumber(b.card) && c.rank === b.card.rank;
  return isLetter(c) && isLetter(b.card) && c.rank === b.card.rank;
}

export interface Touch {
  idx: number;
  surface: Surface;
}

export interface PlacementCheck {
  ok: boolean;
  touches: Touch[];
  why?: string;
}

/**
 * Can card `c` be laid with its centre on vertex `v`? `lockFrom` is the index
 * of the most recent wild (everything before it is locked); `blockedTop` is
 * a zero's board index whose top is off-limits this turn.
 */
export function checkPlacement(
  board: BoardCard[],
  cov: Cover,
  c: Card,
  v: V,
  bounds: Bounds,
  lockFrom: number,
  blockedTop: number | null
): PlacementCheck {
  if (!onTable(v, bounds)) return { ok: false, touches: [], why: "That would go off the table." };
  const mine = trianglesAt(v);
  const mineSet = new Set(mine);
  // a card TOUCHES a surface when it lies over all of it while all of it is
  // still showing; overlapping part of a surface is allowed (that surface is
  // simply out of play afterwards), exactly as with real cards on a table
  const touches: Touch[] = [];
  const owners = new Set<number>();
  for (const t of mine) {
    const idx = cov.owner.get(t);
    if (idx !== undefined) owners.add(idx);
  }
  for (const idx of owners) {
    const b = board[idx];
    const bt = trianglesAt(b.v);
    for (const surface of ["top", "side", "face"] as Surface[]) {
      const [a1, z1] = surfaceTris(surface, b.rot);
      if (mineSet.has(bt[a1]) && mineSet.has(bt[z1]) && cov.owner.get(bt[a1]) === idx && cov.owner.get(bt[z1]) === idx) touches.push({ idx, surface });
    }
  }
  if (touches.length === 0) return { ok: false, touches, why: "It has to sit squarely on a showing surface." };
  for (const { idx, surface } of touches) {
    const b = board[idx];
    if (idx < lockFrom) return { ok: false, touches, why: "Those cards are locked behind a wild." };
    if (surface === "top" && blockedTop === idx) return { ok: false, touches, why: "That zero's top is blocked this turn." };
    if (c.rank === "W" && surface !== "top") return { ok: false, touches, why: "Wilds only go on a top." };
    if (!matches(c, b, surface)) {
      const want = surface === "top" ? "suit" : surface === "side" ? "number" : "letter";
      return { ok: false, touches, why: `Every surface it touches must match — that ${surface} needs the same ${want}.` };
    }
  }
  return { ok: true, touches };
}

/** Every vertex a card could possibly go to: just beyond each visible, unlocked surface. */
export function candidateVertices(board: BoardCard[], cov: Cover, lockFrom: number): V[] {
  const out = new Map<string, V>();
  for (let idx = Math.max(0, lockFrom); idx < board.length; idx++) {
    for (const s of visibleSurfaces(board, cov, idx)) {
      const v = beyond(board[idx].v, s, board[idx].rot);
      out.set(`${v[0]},${v[1]}`, v);
    }
  }
  return [...out.values()];
}

/** All legal vertices for card `c` right now. */
export function legalSpots(board: BoardCard[], c: Card, bounds: Bounds, lockFrom: number, blockedTop: number | null, cov = coverage(board)): { v: V; touches: Touch[] }[] {
  const out: { v: V; touches: Touch[] }[] = [];
  for (const v of candidateVertices(board, cov, lockFrom)) {
    const r = checkPlacement(board, cov, c, v, bounds, lockFrom, blockedTop);
    if (r.ok) out.push({ v, touches: r.touches });
  }
  return out;
}

/**
 * Directions a wild laid at `v` may face: not the current one, and only those
 * whose new top is genuinely open — otherwise the STACC (everything behind
 * the wild being locked) would dead-end on the spot.
 */
export function openRotations(board: BoardCard[], v: V, dir: number, bounds: Bounds): number[] {
  const out: number[] = [];
  for (let r = 0; r < 6; r++) {
    if (r === dir) continue;
    const next: BoardCard[] = [...board, { card: { id: "_w", suit: "S", rank: "W" }, v, rot: r, called: "S", by: -1 }];
    const probe: Card = { id: "_p", suit: "S", rank: 2 };
    if (legalSpots(next, probe, bounds, next.length - 1, null).length) out.push(r);
  }
  return out;
}
