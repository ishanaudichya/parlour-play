/* The STACCS card: a hexagon painted as a cube. Three rhombus surfaces —
   TOP (brightest, the pale suit print), FACE (left: the suit pip, or the
   character on J/Q/K/A) and SIDE (right: the big rank) — each drawn flat in a
   unit square and mapped onto its rhombus with an isometric matrix, so every
   pip and numeral lies on the cube like print. Pixel suits are real bitmaps;
   numerals are Silkscreen. Radius 1, centred on the origin, y down. */

import type { ReactNode } from "react";
import type { Card, Suit } from "@/lib/games/staccs/types";
import { CUBE, INK, SUIT_COLOR, SUIT_TINT, WILD } from "./palette";

const S = Math.sqrt(3) / 2;

/** unit square → each rhombus */
const M_TOP = `matrix(${S} 0.5 ${-S} 0.5 0 -1)`;
const M_FACE = `matrix(${S} 0.5 0 1 ${-S} -0.5)`;
const M_SIDE = `matrix(${S} -0.5 0 1 0 0)`;

export const HEX = `0,-1 ${S},-0.5 ${S},0.5 0,1 ${-S},0.5 ${-S},-0.5`;
export const RHOMBUS = {
  top: `0,0 ${-S},-0.5 0,-1 ${S},-0.5`,
  face: `0,0 ${-S},-0.5 ${-S},0.5 0,1`,
  side: `0,0 ${S},-0.5 ${S},0.5 0,1`,
};

/* ---------------- pixel art ---------------- */

const BITMAPS: Record<Suit, string[]> = {
  H: [".XX...XX.", "XXXX.XXXX", "XXXXXXXXX", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."],
  S: ["....X....", "...XXX...", "..XXXXX..", ".XXXXXXX.", "XXXXXXXXX", "XXXXXXXXX", ".XX.X.XX.", "....X....", "...XXX..."],
  C: ["...XXX...", "..XXXXX..", "..XXXXX..", "XX.XXX.XX", "XXXXXXXXX", "XXXXXXXXX", "XX..X..XX", "....X....", "...XXX..."],
  D: ["....X....", "...XXX...", "..XXXXX..", ".XXXXXXX.", "XXXXXXXXX", ".XXXXXXX.", "..XXXXX..", "...XXX...", "....X...."],
};

/** A bitmap as one path, fitted into a box (x, y, w) of the unit square, centred. */
function bitmapPath(rows: string[], x: number, y: number, w: number): string {
  const cols = Math.max(...rows.map((r) => r.length));
  const p = w / Math.max(cols, rows.length);
  const ox = x + (w - cols * p) / 2;
  const oy = y + (w - rows.length * p) / 2;
  let d = "";
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      if (row[c] !== "X") {
        c++;
        continue;
      }
      let e = c;
      while (e < row.length && row[e] === "X") e++;
      // a hair of overlap so runs never show seams
      d += `M${(ox + c * p).toFixed(4)} ${(oy + r * p).toFixed(4)}h${((e - c) * p + 0.002).toFixed(4)}v${(p + 0.002).toFixed(4)}h${(-(e - c) * p - 0.002).toFixed(4)}z`;
      c = e;
    }
  });
  return d;
}

export function Pip({ suit, x, y, w, color }: { suit: Suit; x: number; y: number; w: number; color: string }) {
  return <path d={bitmapPath(BITMAPS[suit], x, y, w)} fill={color} />;
}

/* headwear and features for the court cards, 12×12 on the face */
const COURT: Record<"J" | "Q" | "K" | "A", { hat: string[]; hatColor: "suit" | "gold" | "ink" }> = {
  J: { hat: ["....XXXX....", "...XXXXXX...", "..XXXXXXXXXX"], hatColor: "suit" },
  Q: { hat: [".X...X...X..", ".XX.XXX.XX..", ".XXXXXXXXX.."], hatColor: "gold" },
  K: { hat: ["X...XX...X..", "XX.XXXX.XX..", "XXXXXXXXXX..", "XXXXXXXXXX.."], hatColor: "gold" },
  A: { hat: ["....X.......", "...XXX......", "XXXXXXXXX...", ".XXXXXXX....", "..XX..XX...."], hatColor: "gold" },
};

function Court({ rank, suit }: { rank: "J" | "Q" | "K" | "A"; suit: Suit }) {
  const c = COURT[rank];
  const hat = c.hatColor === "suit" ? SUIT_COLOR[suit] : c.hatColor === "gold" ? "#f5b82e" : INK;
  const face = rank === "A"
    ? ["............", "..XX....XX..", "..XX....XX..", "............", ".X........X.", "..XXXXXXXX..", "...XXXXXX..."]
    : rank === "K"
      ? ["............", "..XX....XX..", "..XX....XX..", "............", "..XXXXXXXX..", "..X.XXXX.X..", "....XXXX...."]
      : rank === "Q"
        ? ["............", "..XX....XX..", "..X.....X...", "............", "....XXXX....", "...X....X..."]
        : ["............", "..XX....XX..", "..XX....XX..", "............", "...XXXXXX...", "....XXXX...."];
  return (
    <g>
      <path d={bitmapPath(c.hat, 0.2, 0.1, 0.6)} fill={hat} />
      <path d={bitmapPath(face, 0.2, 0.42, 0.6)} fill={INK} />
      {(rank === "Q" || rank === "K") && <path d={bitmapPath(["X........X"], 0.2, 0.66, 0.6)} fill={SUIT_COLOR[suit]} opacity={0.75} />}
    </g>
  );
}

/* ---------------- the cube ---------------- */

function Faces({ top, face, side, edge, line }: { top: string; face: string; side: string; edge: string; line: string }) {
  return (
    <>
      <polygon points={RHOMBUS.top} fill={top} />
      <polygon points={RHOMBUS.face} fill={face} />
      <polygon points={RHOMBUS.side} fill={side} />
      <path d={`M0 0L${-S} -0.5M0 0L${S} -0.5M0 0L0 1`} stroke={line} strokeWidth={0.025} />
      <polygon points={HEX} fill="none" stroke={edge} strokeWidth={0.035} strokeLinejoin="round" />
    </>
  );
}

export interface CubeProps {
  card: Card | "back";
  /** wilds on the STACC: the called suit */
  called?: Suit;
  /** behind the latest wild */
  locked?: boolean;
  /** a zero whose top the current player can't use */
  blocked?: boolean;
}

/** The card itself, centred on the origin. Callers translate and rotate it. */
export function Cube({ card, called, locked = false, blocked = false }: CubeProps) {
  let body: ReactNode;
  if (card === "back" || card.rank === "W") {
    const back = card === "back";
    const P = back ? { top: "#3a6cf0", face: "#2a56d4", side: "#1f46b8", edge: "#14318a", line: "#5b8dff" } : WILD;
    body = (
      <>
        <Faces {...P} />
        {/* bricks on the side */}
        <g transform={M_SIDE}>
          <path d="M0 0.33H1M0 0.66H1M0.5 0V0.33M0.25 0.33V0.66M0.75 0.33V0.66M0.5 0.66V1" stroke={P.line} strokeWidth={0.04} opacity={0.55} />
        </g>
        {/* the face */}
        <g transform={M_FACE}>
          <path d={bitmapPath(["XX....XX", "XX....XX", "XX....XX", "........", "X......X", ".XXXXXX."], 0.18, 0.22, 0.64)} fill="#ffffff" />
          {!back && <path d={bitmapPath(["..XXXX..", "...XX..."], 0.18, 0.62, 0.64)} fill="#ff6b7a" />}
        </g>
        <g transform={M_TOP}>
          {called ? (
            <Pip suit={called} x={0.18} y={0.18} w={0.64} color="#ffffff" />
          ) : (
            <path d="M0.2 0.2h0.6v0.6h-0.6z" fill="none" stroke={P.line} strokeWidth={0.05} opacity={0.6} />
          )}
        </g>
      </>
    );
  } else {
    const col = SUIT_COLOR[card.suit];
    const isCourt = card.rank === "J" || card.rank === "Q" || card.rank === "K" || card.rank === "A";
    const label = String(card.rank);
    body = (
      <>
        <Faces {...CUBE} />
        <g transform={M_TOP}>
          <Pip suit={card.suit} x={0.17} y={0.17} w={0.66} color={SUIT_TINT[card.suit]} />
        </g>
        <g transform={M_FACE}>
          {isCourt ? <Court rank={card.rank as "J" | "Q" | "K" | "A"} suit={card.suit} /> : <Pip suit={card.suit} x={0.2} y={0.26} w={0.6} color={col} />}
          <text x={0.08} y={0.2} fontSize={0.16} fontWeight={700} fill={col} style={{ fontFamily: "var(--staccs-pixel)" }}>
            {label}
          </text>
        </g>
        <g transform={M_SIDE}>
          <text x={0.5} y={0.74} fontSize={label.length > 1 ? 0.5 : 0.66} fontWeight={700} textAnchor="middle" fill={col} style={{ fontFamily: "var(--staccs-pixel)" }}>
            {label}
          </text>
          {card.rank === 0 && <path d="M0.22 0.82L0.78 0.22" stroke={col} strokeWidth={0.07} strokeLinecap="square" />}
          <Pip suit={card.suit} x={0.78} y={0.84} w={0.13} color={col} />
        </g>
      </>
    );
  }
  return (
    <g>
      {body}
      {locked && <polygon points={HEX} fill="#0f2a8a" opacity={0.42} />}
      {blocked && (
        <g transform={M_TOP}>
          <circle cx={0.5} cy={0.5} r={0.34} fill="none" stroke="#ff4a5c" strokeWidth={0.09} />
          <path d="M0.26 0.74L0.74 0.26" stroke="#ff4a5c" strokeWidth={0.09} />
        </g>
      )}
    </g>
  );
}

/** A standalone card for hands and chrome. */
export function CubeChip({ size = 56, ...props }: CubeProps & { size?: number }) {
  return (
    <svg viewBox={`${-S - 0.06} -1.06 ${2 * S + 0.12} 2.12`} width={size * S} height={size} style={{ overflow: "visible", display: "block" }} aria-hidden>
      <Cube {...props} />
    </svg>
  );
}
