"use client";

/* The table and the STACC on it. One SVG in card-radius units: the cobalt
   table with the triangle lattice every card snaps to, the cards in the order
   they were laid (later cards lie over earlier ones, exactly as on a real
   table), the cyan flash on whatever surfaces the latest card matched, and —
   when you're holding a card — ghost spots where it can go. Hover a ghost and
   the surfaces it would touch light up, like the diagrams in the rulebook. */

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";
import { checkPlacement, coverage, toXY, type Bounds, type Touch, type V } from "@/lib/games/staccs/geometry";
import type { BoardCard, Card, Suit } from "@/lib/games/staccs/types";
import { Cube, HEX, RHOMBUS } from "./Cube";
import { CYAN, GRID, TABLE, TABLE_HI } from "./palette";

const SQ3 = Math.sqrt(3);

export interface Ghost {
  v: V;
  touches: Touch[];
}

function at(v: V, rot = 0) {
  const [x, y] = toXY(v);
  return `translate(${x.toFixed(4)} ${y.toFixed(4)}) rotate(${rot * 60})`;
}

function SurfaceGlow({ board, t, strong }: { board: BoardCard[]; t: Touch; strong?: boolean }) {
  const b = board[t.idx];
  return (
    <g transform={at(b.v, b.rot)}>
      <polygon points={RHOMBUS[t.surface]} fill={CYAN} opacity={strong ? 0.55 : 0.4} />
      <polygon points={RHOMBUS[t.surface]} fill="none" stroke={CYAN} strokeWidth={0.07} strokeLinejoin="round" />
    </g>
  );
}

export function Board({
  board,
  bounds,
  lockFrom,
  blockedTop,
  lastSeq,
  lastIdx,
  ghosts,
  hover,
  onHover,
  onPick,
  holding,
  holdingRot,
  wildPreview,
}: {
  board: BoardCard[];
  bounds: Bounds;
  lockFrom: number;
  blockedTop: number | null;
  /** the latest placement, to animate it in and flash what it matched */
  lastSeq: number;
  lastIdx: number | null;
  ghosts: Ghost[];
  hover: string | null;
  onHover: (key: string | null) => void;
  onPick: (g: Ghost) => void;
  /** the card in your hand you're about to lay */
  holding: Card | null;
  holdingRot: number;
  wildPreview: { v: V; rot: number; called: Suit | null } | null;
}) {
  const pad = 0.5;
  const full = { x: -bounds.x - pad, y: bounds.top - pad, w: bounds.x * 2 + pad * 2, h: bounds.bottom - bounds.top + pad * 2 };

  // the camera frames the STACC (and wherever the held card could go), keeps
  // the table's aspect, never zooms in tighter than ~11 card-radii, and eases
  // out toward the whole table as the structure grows
  const vb = useMemo(() => {
    const pts: [number, number][] = [...board.map((b) => toXY(b.v)), ...ghosts.map((g) => toXY(g.v))];
    let x0 = Math.min(...pts.map((p) => p[0])) - 0.9;
    let x1 = Math.max(...pts.map((p) => p[0])) + 0.9;
    let y0 = Math.min(...pts.map((p) => p[1])) - 1;
    let y1 = Math.max(...pts.map((p) => p[1])) + 1;
    const margin = 2.6;
    x0 -= margin;
    x1 += margin;
    y0 -= margin;
    y1 += margin;
    const aspect = full.w / full.h;
    let w = Math.max(x1 - x0, 11 * aspect);
    let h = Math.max(y1 - y0, 11);
    if (w / h > aspect) h = w / aspect;
    else w = h * aspect;
    w = Math.min(w, full.w);
    h = Math.min(h, full.h);
    const cx = Math.min(Math.max((x0 + x1) / 2, full.x + w / 2), full.x + full.w - w / 2);
    const cy = Math.min(Math.max((y0 + y1) / 2, full.y + h / 2), full.y + full.h - h / 2);
    return { x: cx - w / 2, y: cy - h / 2, w, h };
  }, [board, ghosts, full.x, full.y, full.w, full.h]);

  // what the latest card matched
  const flash = useMemo(() => {
    if (lastIdx === null || lastIdx < 1 || lastIdx >= board.length) return [] as Touch[];
    const prefix = board.slice(0, lastIdx);
    const bc = board[lastIdx];
    return checkPlacement(prefix, coverage(prefix), bc.card, bc.v, { x: 1e9, top: -1e9, bottom: 1e9 }, 0, null).touches;
  }, [board, lastIdx]);

  const lines = useMemo(() => {
    const out: string[] = [];
    const k = Math.ceil(bounds.x / (SQ3 / 2)) + 1;
    for (let m = -k; m <= k; m++) {
      const x = (m * SQ3) / 2;
      out.push(`M${x.toFixed(3)} ${bounds.top}V${bounds.bottom}`);
    }
    const span = Math.ceil(bounds.x / SQ3 + (bounds.bottom - bounds.top)) + 2;
    for (let j = Math.floor(bounds.top) - span; j <= Math.ceil(bounds.bottom) + span; j++) {
      const x0 = -bounds.x;
      const x1 = bounds.x;
      out.push(`M${x0} ${(x0 / SQ3 + j).toFixed(3)}L${x1} ${(x1 / SQ3 + j).toFixed(3)}`);
      out.push(`M${x0} ${(-x0 / SQ3 + j).toFixed(3)}L${x1} ${(-x1 / SQ3 + j).toFixed(3)}`);
    }
    return out.join("");
  }, [bounds]);

  const hovered = ghosts.find((g) => `${g.v[0]},${g.v[1]}` === hover) ?? null;

  return (
    <motion.svg
      initial={false}
      animate={{ viewBox: `${vb.x.toFixed(3)} ${vb.y.toFixed(3)} ${vb.w.toFixed(3)} ${vb.h.toFixed(3)}` }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="block h-full w-full"
      aria-label="The STACC"
    >
      <defs>
        <linearGradient id="st-table" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={TABLE_HI} />
          <stop offset="100%" stopColor={TABLE} />
        </linearGradient>
        <radialGradient id="st-lamp" cx="0.5" cy="0.3" r="0.75">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.14} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
        <clipPath id="st-clip">
          <rect x={-bounds.x} y={bounds.top} width={bounds.x * 2} height={bounds.bottom - bounds.top} rx={0.6} />
        </clipPath>
        <filter id="st-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="0.07" />
        </filter>
      </defs>

      {/* the table */}
      <rect x={-bounds.x} y={bounds.top} width={bounds.x * 2} height={bounds.bottom - bounds.top} rx={0.6} fill="url(#st-table)" />
      <g clipPath="url(#st-clip)">
        <path d={lines} stroke={GRID} strokeWidth={0.02} fill="none" />
        <rect x={-bounds.x} y={bounds.top} width={bounds.x * 2} height={bounds.bottom - bounds.top} fill="url(#st-lamp)" />
      </g>
      <rect x={-bounds.x} y={bounds.top} width={bounds.x * 2} height={bounds.bottom - bounds.top} rx={0.6} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={0.04} />

      {/* the STACC */}
      {board.map((b, i) => {
        const fresh = i === lastIdx;
        return (
          <g key={b.card.id} transform={at(b.v, b.rot)}>
            <motion.g
              key={fresh ? `fresh-${lastSeq}` : "still"}
              initial={fresh ? { opacity: 0, scale: 1.35, y: -0.5 } : false}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={fresh ? { type: "spring", stiffness: 380, damping: 22 } : undefined}
            >
              <polygon points={HEX} transform="translate(0.08 0.12)" fill="#04103a" opacity={0.35} filter="url(#st-shadow)" />
              <Cube card={b.card} called={b.called} locked={i < lockFrom} blocked={i === blockedTop} />
            </motion.g>
          </g>
        );
      })}

      {/* what the latest card matched */}
      <AnimatePresence>
        {flash.length > 0 && (
          <motion.g key={`flash-${lastSeq}`} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 1, 0] }} transition={{ duration: 1.6, times: [0, 0.12, 0.6, 1] }} style={{ pointerEvents: "none" }}>
            {flash.map((t) => (
              <SurfaceGlow key={`${t.idx}${t.surface}`} board={board} t={t} />
            ))}
          </motion.g>
        )}
      </AnimatePresence>

      {/* where the held card can go */}
      {ghosts.map((g) => {
        const key = `${g.v[0]},${g.v[1]}`;
        const on = hover === key;
        return (
          <g
            key={key}
            transform={at(g.v)}
            style={{ cursor: "pointer" }}
            onPointerEnter={() => onHover(key)}
            onPointerLeave={() => onHover(null)}
            onClick={() => onPick(g)}
          >
            <polygon points={HEX} fill={CYAN} opacity={on ? 0.0 : 0.16}>
              {!on && <animate attributeName="opacity" values="0.08;0.24;0.08" dur="1.6s" repeatCount="indefinite" />}
            </polygon>
            <polygon points={HEX} fill="none" stroke={CYAN} strokeWidth={0.07} strokeDasharray="0.16 0.1" strokeLinejoin="round" opacity={on ? 0 : 1} />
            {/* a generous invisible hit area */}
            <polygon points={HEX} fill="transparent" />
          </g>
        );
      })}

      {/* hovering a ghost: what it touches, and the card sitting there */}
      {hovered && holding && (
        <g style={{ pointerEvents: "none" }}>
          <g transform={at(hovered.v, holding.rank === "W" ? (wildPreview?.rot ?? holdingRot) : holdingRot)} opacity={0.55}>
            <Cube card={holding} called={wildPreview?.called ?? undefined} />
          </g>
          {hovered.touches.map((t) => (
            <SurfaceGlow key={`h${t.idx}${t.surface}`} board={board} t={t} strong />
          ))}
          <g transform={at(hovered.v)}>
            <polygon points={HEX} fill="none" stroke={CYAN} strokeWidth={0.06} />
          </g>
        </g>
      )}

      {/* a wild being set: pinned at its spot while you pick a direction and a suit */}
      {wildPreview && holding?.rank === "W" && !hovered && (
        <g transform={at(wildPreview.v, wildPreview.rot)} style={{ pointerEvents: "none" }}>
          <Cube card={holding} called={wildPreview.called ?? undefined} />
          {/* the new direction */}
          <path d="M0 -1.15L0 -1.75M-0.22 -1.5L0 -1.78L0.22 -1.5" stroke={CYAN} strokeWidth={0.11} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      )}
    </motion.svg>
  );
}
