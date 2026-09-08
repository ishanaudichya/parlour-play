"use client";

/* The heirloom board. One scalable <svg>: a lacquered frame with a brass
   bevel, an ivory enamel surface ruled in brown ink, four pigment yards,
   coloured home columns meeting at a brass boss, and glossy domed tokens
   that hop square to square. Every coordinate is integer arithmetic on the
   60-unit grid — nothing here can drift between server and client. */

import { motion } from "framer-motion";
import { memo } from "react";
import {
  COLOR_ORDER,
  HOME_COLUMN,
  SAFE_INDEXES,
  START_INDEX,
  STAR_INDEXES,
  TRACK,
  YARD_ORIGIN,
  pointFor,
  yardSlots,
} from "@/lib/games/ludo/board";
import { destination } from "@/lib/games/ludo/engine";
import type { LudoColor, LudoViewPlayer } from "@/lib/games/ludo/types";
import {
  BOARD,
  BRASS,
  BRASS_LIGHT,
  C,
  CREAM,
  FLY_MS,
  FRAME,
  HOP_MS,
  INK,
  INK_SOFT,
  IVORY,
  IVORY_DEEP,
  LACQUER,
  LACQUER_DEEP,
  n2,
  OUT_MS,
  PAINT,
  px,
  SIZE,
  START_HEADING,
  SWIFT,
  TOKEN_R,
} from "./paint";
import { tokenKey, type LudoPlayback, type TokenMode } from "./playback";

/* ---------------- static art ---------------- */

/** A five-point star centred at the origin, radius r. */
function starPath(r: number): string {
  const pts: string[] = [];
  const inner = r * 0.45;
  // precomputed unit-circle points for 10 vertices (36° apart) — no runtime trig drift
  const unit: [number, number][] = [
    [0, -1], [0.5878, -0.809], [0.9511, -0.309], [0.9511, 0.309], [0.5878, 0.809],
    [0, 1], [-0.5878, 0.809], [-0.9511, 0.309], [-0.9511, -0.309], [-0.5878, -0.809],
  ];
  unit.forEach(([ux, uy], i) => {
    const rr = i % 2 === 0 ? r : inner;
    pts.push(`${n2(ux * rr)} ${n2(uy * rr)}`);
  });
  return `M ${pts.join(" L ")} Z`;
}

const STAR = starPath(15);

function Arrow({ heading }: { heading: "E" | "N" | "W" | "S" }) {
  const rot = heading === "E" ? 0 : heading === "S" ? 90 : heading === "W" ? 180 : 270;
  return <path d="M -9 -8 L 7 0 L -9 8 L -4 0 Z" fill={IVORY} opacity={0.9} transform={`rotate(${rot})`} />;
}

function Defs() {
  return (
    <defs>
      <linearGradient id="ludo-lacquer" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#4a2418" />
        <stop offset="35%" stopColor={LACQUER} />
        <stop offset="100%" stopColor={LACQUER_DEEP} />
      </linearGradient>
      <linearGradient id="ludo-brass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor={BRASS_LIGHT} />
        <stop offset="50%" stopColor={BRASS} />
        <stop offset="100%" stopColor="#7d5f2a" />
      </linearGradient>
      <radialGradient id="ludo-ivory" cx="0.5" cy="0.45" r="0.75">
        <stop offset="0%" stopColor="#f8f0dc" />
        <stop offset="70%" stopColor={IVORY} />
        <stop offset="100%" stopColor={IVORY_DEEP} />
      </radialGradient>
      {COLOR_ORDER.map((c) => {
        const p = PAINT[c];
        return (
          <linearGradient key={`yard-${c}`} id={`ludo-yard-${c}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={p.light} />
            <stop offset="45%" stopColor={p.base} />
            <stop offset="100%" stopColor={p.deep} />
          </linearGradient>
        );
      })}
      {COLOR_ORDER.map((c) => {
        const p = PAINT[c];
        return (
          <radialGradient key={`tok-${c}`} id={`ludo-tok-${c}`} cx="0.38" cy="0.32" r="0.78">
            <stop offset="0%" stopColor={p.light} />
            <stop offset="35%" stopColor={p.base} />
            <stop offset="82%" stopColor={p.base} />
            <stop offset="100%" stopColor={p.deep} />
          </radialGradient>
        );
      })}
      <radialGradient id="ludo-boss" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0%" stopColor={BRASS_LIGHT} />
        <stop offset="60%" stopColor={BRASS} />
        <stop offset="100%" stopColor="#6d5124" />
      </radialGradient>
      <radialGradient id="ludo-vignette" cx="0.5" cy="0.5" r="0.72">
        <stop offset="70%" stopColor="#000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000" stopOpacity="0.16" />
      </radialGradient>
    </defs>
  );
}

/** Everything that never changes: frame, surface, yards, track, home. */
const StaticBoard = memo(function StaticBoard() {
  const cell = (x: number, y: number, fill: string, extra?: React.ReactNode) => (
    <g key={`${x}-${y}`}>
      <rect x={px(x)} y={px(y)} width={C} height={C} fill={fill} stroke={INK_SOFT} strokeWidth={1.2} />
      {extra}
    </g>
  );

  return (
    <g>
      {/* lacquer frame */}
      <rect x={0} y={0} width={SIZE} height={SIZE} rx={30} fill="url(#ludo-lacquer)" />
      <rect x={FRAME - 9} y={FRAME - 9} width={BOARD + 18} height={BOARD + 18} rx={10} fill="none" stroke="url(#ludo-brass)" strokeWidth={3} />
      <rect x={FRAME - 3} y={FRAME - 3} width={BOARD + 6} height={BOARD + 6} rx={6} fill="none" stroke={BRASS} strokeOpacity={0.35} strokeWidth={1} />
      {[[19, 19], [SIZE - 19, 19], [19, SIZE - 19], [SIZE - 19, SIZE - 19]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r={7.5} fill="url(#ludo-boss)" />
          <circle cx={x} cy={y} r={2.2} fill={LACQUER_DEEP} opacity={0.7} />
        </g>
      ))}

      {/* ivory surface */}
      <rect x={FRAME} y={FRAME} width={BOARD} height={BOARD} fill="url(#ludo-ivory)" />

      {/* yards */}
      {COLOR_ORDER.map((c) => {
        const [x0, y0] = YARD_ORIGIN[c];
        const p = PAINT[c];
        return (
          <g key={`yard-${c}`}>
            <rect x={px(x0) + 3} y={px(y0) + 3} width={6 * C - 6} height={6 * C - 6} rx={14} fill={`url(#ludo-yard-${c})`} />
            <rect x={px(x0) + 3} y={px(y0) + 3} width={6 * C - 6} height={6 * C - 6} rx={14} fill="none" stroke={p.deep} strokeOpacity={0.5} strokeWidth={1.5} />
            <rect x={px(x0 + 1)} y={px(y0 + 1)} width={4 * C} height={4 * C} rx={10} fill={IVORY_DEEP} stroke={p.deep} strokeOpacity={0.45} strokeWidth={2} />
            <rect x={px(x0 + 1) + 3} y={px(y0 + 1) + 3} width={4 * C - 6} height={4 * C - 6} rx={8} fill="none" stroke="#fff" strokeOpacity={0.35} strokeWidth={1} />
            {yardSlots(c).map(([sx, sy], i) => (
              <g key={i}>
                <circle cx={px(sx)} cy={px(sy)} r={TOKEN_R + 5} fill={p.tint} opacity={0.55} />
                <circle cx={px(sx)} cy={px(sy)} r={TOKEN_R + 5} fill="none" stroke={p.base} strokeOpacity={0.6} strokeWidth={2} />
                <circle cx={px(sx)} cy={px(sy)} r={TOKEN_R - 6} fill={p.base} opacity={0.14} />
              </g>
            ))}
          </g>
        );
      })}

      {/* the loop */}
      {TRACK.map(([x, y], i) => {
        const startOf = COLOR_ORDER.find((c) => START_INDEX[c] === i);
        if (startOf) {
          return cell(
            x,
            y,
            PAINT[startOf].base,
            <g transform={`translate(${px(x) + C / 2} ${px(y) + C / 2})`}>
              <Arrow heading={START_HEADING[startOf]} />
            </g>
          );
        }
        if (STAR_INDEXES.has(i)) {
          return cell(
            x,
            y,
            IVORY,
            <path d={STAR} transform={`translate(${px(x) + C / 2} ${px(y) + C / 2})`} fill={INK} opacity={0.3} />
          );
        }
        return cell(x, y, IVORY);
      })}

      {/* home columns */}
      {COLOR_ORDER.map((c) => HOME_COLUMN[c].map(([x, y]) => cell(x, y, PAINT[c].base)))}

      {/* the home: four pigments meeting at a brass boss */}
      {(
        [
          ["red", `${px(6)},${px(6)} ${px(6)},${px(9)} ${px(7.5)},${px(7.5)}`],
          ["green", `${px(6)},${px(6)} ${px(9)},${px(6)} ${px(7.5)},${px(7.5)}`],
          ["yellow", `${px(9)},${px(6)} ${px(9)},${px(9)} ${px(7.5)},${px(7.5)}`],
          ["blue", `${px(6)},${px(9)} ${px(9)},${px(9)} ${px(7.5)},${px(7.5)}`],
        ] as [LudoColor, string][]
      ).map(([c, pts]) => (
        <polygon key={c} points={pts} fill={PAINT[c].base} stroke={INK} strokeOpacity={0.45} strokeWidth={1.2} />
      ))}
      <rect x={px(6)} y={px(6)} width={3 * C} height={3 * C} fill="none" stroke={INK} strokeOpacity={0.5} strokeWidth={1.5} />
      <circle cx={px(7.5)} cy={px(7.5)} r={20} fill="url(#ludo-boss)" stroke="#5a4218" strokeWidth={1.2} />
      <circle cx={px(7.5)} cy={px(7.5)} r={7} fill={IVORY} opacity={0.9} />
      <circle cx={px(7.5)} cy={px(7.5)} r={2.5} fill={LACQUER_DEEP} opacity={0.6} />

      {/* soft vignette on the enamel */}
      <rect x={FRAME} y={FRAME} width={BOARD} height={BOARD} fill="url(#ludo-vignette)" pointerEvents="none" />
    </g>
  );
});

/* ---------------- tokens ---------------- */

function TokenBody({ color, r = TOKEN_R, faded = false }: { color: LudoColor; r?: number; faded?: boolean }) {
  const p = PAINT[color];
  return (
    <g opacity={faded ? 0.55 : 1}>
      <ellipse cy={r * 0.78} rx={r * 0.88} ry={r * 0.34} fill="#000" opacity={0.3} />
      <circle r={r} fill={`url(#ludo-tok-${color})`} />
      <circle r={r - 1} fill="none" stroke={p.deep} strokeWidth={1.6} opacity={0.65} />
      <circle r={r * 0.58} fill="none" stroke={p.deep} strokeWidth={1.3} opacity={0.4} />
      <circle r={r * 0.28} fill={p.light} opacity={0.4} />
      <ellipse cx={-r * 0.3} cy={-r * 0.4} rx={r * 0.34} ry={r * 0.2} fill="#fff" opacity={0.55} />
    </g>
  );
}

const transitionFor = (mode: TokenMode) => {
  switch (mode) {
    case "hop":
      return { duration: HOP_MS / 1000, ease: "easeOut" as const };
    case "out":
      return { duration: OUT_MS / 1000, ease: SWIFT };
    case "fly":
      return { duration: FLY_MS / 1000, ease: [0.4, 0, 0.2, 1] as [number, number, number, number] };
    default:
      return { duration: 0 };
  }
};

const liftFor = (mode: TokenMode): number => (mode === "hop" ? 18 : mode === "out" ? 44 : mode === "fly" ? 60 : 0);

/* ---------------- board ---------------- */

export interface LudoBoardProps {
  players: LudoViewPlayer[];
  pb: LudoPlayback;
  /** the seat whose turn it is — its yard glows; null when the game is over */
  turnSeat: number | null;
  /** you may pick a token right now */
  interactive: boolean;
  mySeat: number | null;
  movable: number[];
  die: number | null;
  hoverToken: number | null;
  onHoverToken: (t: number | null) => void;
  onPickToken: (t: number) => void;
  winnerSeat: number | null;
}

interface Placed {
  key: string;
  seat: number;
  token: number;
  color: LudoColor;
  pos: number;
  mode: TokenMode;
  x: number;
  y: number;
  faded: boolean;
}

function BoardImpl({ players, pb, turnSeat, interactive, mySeat, movable, die, hoverToken, onHoverToken, onPickToken, winnerSeat }: LudoBoardProps) {
  // place every token, then spread the ones sharing a square
  const placed: Placed[] = [];
  for (const p of players) {
    if (p.left) continue;
    p.tokens.forEach((_, t) => {
      const key = tokenKey(p.seat, t);
      const pos = pb.pos[key] ?? p.tokens[t];
      const mode = pb.mode[key] ?? "snap";
      const [ux, uy] = pointFor(p.color, pos, t);
      placed.push({ key, seat: p.seat, token: t, color: p.color, pos, mode, x: px(ux), y: px(uy), faded: winnerSeat !== null && winnerSeat !== p.seat });
    });
  }
  const groups = new Map<string, Placed[]>();
  for (const t of placed) {
    const g = `${t.x},${t.y}`;
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  const SPREAD: Record<number, [number, number][]> = {
    1: [[0, 0]],
    2: [[-9, 3], [9, -3]],
    3: [[-10, 5], [10, 5], [0, -8]],
    4: [[-9, -8], [9, -8], [-9, 8], [9, 8]],
  };
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const layout = SPREAD[Math.min(4, g.length)];
    g.forEach((t, i) => {
      const [dx, dy] = layout[i % layout.length];
      t.x += dx;
      t.y += dy;
    });
  }
  // the token in motion is drawn last, so it rides over everything
  placed.sort((a, b) => (a.key === pb.moving ? 1 : b.key === pb.moving ? -1 : a.y - b.y));

  const me = mySeat !== null ? players.find((p) => p.seat === mySeat) ?? null : null;
  const movableSet = new Set(interactive ? movable : []);
  const hover = interactive && hoverToken !== null && me && movableSet.has(hoverToken) ? hoverToken : null;
  const dest = hover !== null && me && die ? destination(me.tokens[hover], die) : -1;
  const destPoint = dest >= 0 && me ? pointFor(me.color, dest, hover ?? 0) : null;

  const turnColor = turnSeat !== null ? players.find((p) => p.seat === turnSeat)?.color ?? null : null;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="block h-auto w-full select-none"
      style={{ overflow: "visible", filter: "drop-shadow(0 30px 44px rgba(0,0,0,0.6))" }}
      aria-label="Ludo board"
    >
      <Defs />
      <StaticBoard />

      {/* the active yard breathes */}
      {turnColor && (
        <motion.rect
          key={turnColor}
          x={px(YARD_ORIGIN[turnColor][0]) + 3}
          y={px(YARD_ORIGIN[turnColor][1]) + 3}
          width={6 * C - 6}
          height={6 * C - 6}
          rx={14}
          fill="none"
          stroke={CREAM}
          strokeWidth={3}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.15, 0.7, 0.15] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          pointerEvents="none"
        />
      )}

      {/* destination preview */}
      {destPoint && me && (
        <g pointerEvents="none" transform={`translate(${px(destPoint[0])} ${px(destPoint[1])})`}>
          <motion.circle
            r={TOKEN_R + 6}
            fill={PAINT[me.color].base}
            opacity={0.18}
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
          />
          <circle r={TOKEN_R + 1} fill="none" stroke={PAINT[me.color].light} strokeWidth={2.5} strokeDasharray="6 5" />
          <TokenBody color={me.color} r={TOKEN_R - 3} faded />
        </g>
      )}

      {/* tokens */}
      {placed.map((t) => {
        const mine = t.seat === mySeat;
        const selectable = interactive && mine && movableSet.has(t.token);
        const lift = liftFor(t.mode);
        return (
          <motion.g
            key={t.key}
            initial={false}
            animate={{ x: t.x, y: t.y }}
            transition={transitionFor(t.mode)}
            style={{ cursor: selectable ? "pointer" : "default" }}
            onPointerEnter={() => selectable && onHoverToken(t.token)}
            onPointerLeave={() => selectable && onHoverToken(null)}
            onClick={() => selectable && onPickToken(t.token)}
          >
            {selectable && (
              <motion.circle
                r={TOKEN_R + 7}
                fill="none"
                stroke={CREAM}
                strokeWidth={3}
                animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.08, 1] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
              />
            )}
            {/* the hop itself: a little arc keyed to each step */}
            <motion.g
              key={`${t.pos}:${t.mode}`}
              initial={{ y: 0 }}
              animate={{ y: lift ? [0, -lift, 0] : 0 }}
              transition={{ duration: transitionFor(t.mode).duration, ease: "easeInOut" }}
            >
              <TokenBody color={t.color} faded={t.faded} />
            </motion.g>
            {/* an oversized hit area so small screens can tap it */}
            {selectable && <circle r={TOKEN_R + 12} fill="transparent" />}
          </motion.g>
        );
      })}
    </svg>
  );
}

export const LudoBoard = memo(BoardImpl);

/** For chrome outside the board: is this loop square safe? (exported for the rules card) */
export const isSafeIndex = (i: number) => SAFE_INDEXES.has(i);
