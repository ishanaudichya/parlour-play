"use client";

/* The cabinet. One scalable <svg>: royal-blue moulded plastic with 42 holes
   punched clean through (an SVG mask), discs sitting BEHIND the face so the
   plastic clips their rims, and the falling disc riding above it so it never
   strobes between holes. Every arc is a static path scaled by a transform —
   no runtime trig, so no hydration drift. */

import { motion } from "framer-motion";
import { memo } from "react";
import { COLS, ROWS, type Board, type Coord, type Disc } from "@/lib/games/connect4/types";
import {
  ALL_CELLS,
  BLEED,
  BOARD_H,
  BOARD_W,
  BOUNCE,
  BOUNCE_DOWN,
  BOUNCE_UP,
  CELL,
  cx,
  cy,
  DISC_PAINT,
  DISC_R,
  FALL_EASE,
  fallSeconds,
  FRAME,
  HOLE_R,
  HOVER_Y,
  LEG_H,
  LIP,
  n2,
  SWIFT,
  VIEWBOX,
} from "./geometry";

/* ---------------- one disc ----------------
   Drawn on a unit circle at the origin and scaled into place, so the
   highlight geometry is a constant string. */

const SPECULAR = "M -0.53 -0.49 A 0.72 0.72 0 0 1 0.29 -0.66";
const UNDERSHADE = "M -0.56 0.45 A 0.72 0.72 0 0 0 0.56 0.45";

function DiscBody({
  col,
  row,
  color,
  r = DISC_R,
  opacity = 1,
}: {
  col: number;
  row: number;
  color: Disc;
  r?: number;
  opacity?: number;
}) {
  const p = DISC_PAINT[color];
  return (
    <g transform={`translate(${cx(col)} ${cy(row)}) scale(${r})`} opacity={opacity}>
      <circle r={1} fill={`url(#c4-disc-${color})`} />
      {/* moulded outer rim */}
      <circle r={0.93} fill="none" stroke={p.deep} strokeWidth={0.07} opacity={0.45} />
      {/* the lighter inner ring every real disc has */}
      <circle r={0.6} fill="none" stroke={p.ring} strokeWidth={0.075} opacity={0.42} />
      <circle r={0.6} fill="none" stroke={p.deep} strokeWidth={0.045} opacity={0.28} transform="translate(0 0.035)" />
      {/* specular arc + hot spot */}
      <path
        d={SPECULAR}
        fill="none"
        stroke="#ffffff"
        strokeWidth={0.1}
        strokeLinecap="round"
        opacity={0.5}
      />
      <circle cx={-0.3} cy={-0.35} r={0.14} fill="#ffffff" opacity={0.3} />
      <path
        d={UNDERSHADE}
        fill="none"
        stroke={p.deep}
        strokeWidth={0.13}
        strokeLinecap="round"
        opacity={0.35}
      />
    </g>
  );
}

/** A disc floating free (ghost preview / mid-fall) — drawn at an arbitrary spot. */
function FloatDisc({ color, r, ghost }: { color: Disc; r: number; ghost?: boolean }) {
  const p = DISC_PAINT[color];
  return (
    <g transform={`scale(${r})`} opacity={ghost ? 0.42 : 1}>
      <circle r={1} fill={`url(#c4-disc-${color})`} />
      {ghost && <circle r={0.97} fill="none" stroke={p.light} strokeWidth={0.06} strokeDasharray="0.22 0.16" opacity={0.9} />}
      {!ghost && (
        <>
          <circle r={0.93} fill="none" stroke={p.deep} strokeWidth={0.07} opacity={0.45} />
          <circle r={0.6} fill="none" stroke={p.ring} strokeWidth={0.075} opacity={0.42} />
          <path d={SPECULAR} fill="none" stroke="#ffffff" strokeWidth={0.1} strokeLinecap="round" opacity={0.5} />
          <circle cx={-0.3} cy={-0.35} r={0.14} fill="#ffffff" opacity={0.3} />
        </>
      )}
    </g>
  );
}

/* ---------------- defs ---------------- */

function Defs() {
  return (
    <defs>
      <linearGradient id="c4-plastic" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0%" stopColor="#2450be" />
        <stop offset="26%" stopColor="#1b3fa0" />
        <stop offset="78%" stopColor="#153080" />
        <stop offset="100%" stopColor="#12266b" />
      </linearGradient>

      <linearGradient id="c4-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
        <stop offset="38%" stopColor="#ffffff" stopOpacity="0.03" />
        <stop offset="100%" stopColor="#000018" stopOpacity="0.18" />
      </linearGradient>

      <linearGradient id="c4-leg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#16307f" />
        <stop offset="100%" stopColor="#0c1a4c" />
      </linearGradient>

      {(["red", "yellow"] as const).map((c) => {
        const p = DISC_PAINT[c];
        return (
          <radialGradient key={c} id={`c4-disc-${c}`} cx="0.36" cy="0.28" r="0.82">
            <stop offset="0%" stopColor={p.light} />
            <stop offset="38%" stopColor={p.base} />
            <stop offset="80%" stopColor={p.base} />
            <stop offset="100%" stopColor={p.deep} />
          </radialGradient>
        );
      })}

      {/* the shadow the plastic lip casts into each hole */}
      <radialGradient id="c4-hole-in" cx="0.5" cy="0.5" r="0.5">
        <stop offset="52%" stopColor="#000000" stopOpacity="0" />
        <stop offset="84%" stopColor="#000000" stopOpacity="0.18" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.62" />
      </radialGradient>

      {/* bevel around the lip: light on top, dark underneath */}
      <linearGradient id="c4-hole-rim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#000010" stopOpacity="0.55" />
        <stop offset="55%" stopColor="#4d76e0" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#9db8ff" stopOpacity="0.3" />
      </linearGradient>

      <linearGradient id="c4-colwash" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.17" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0.03" />
      </linearGradient>

      <linearGradient id="c4-colblock" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff5a4a" stopOpacity="0.16" />
        <stop offset="100%" stopColor="#ff5a4a" stopOpacity="0.02" />
      </linearGradient>

      <radialGradient id="c4-floor" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="#000000" stopOpacity="0.55" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0" />
      </radialGradient>

      {/* the holes, punched out of the face */}
      <mask id="c4-holes">
        <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={38} fill="#ffffff" />
        {ALL_CELLS.map((c) => (
          <circle key={`${c.col}-${c.row}`} cx={cx(c.col)} cy={cy(c.row)} r={HOLE_R} fill="#000000" />
        ))}
      </mask>
    </defs>
  );
}

/* ---------------- board ---------------- */

export interface FallingDisc {
  key: string;
  col: number;
  row: number;
  color: Disc;
}

export interface BoardProps {
  board: Board;
  /** the viewer's colour — null when spectating */
  yourColor: Disc | null;
  /** your turn, game live, you are seated */
  interactive: boolean;
  hoverCol: number | null;
  onHoverCol: (col: number | null) => void;
  onDropCol: (col: number) => void;
  falling: FallingDisc | null;
  onLanded: () => void;
  winningLine: Coord[] | null;
}

function BoardImpl({
  board,
  yourColor,
  interactive,
  hoverCol,
  onHoverCol,
  onDropCol,
  falling,
  onLanded,
  winningLine,
}: BoardProps) {
  const winKeys = new Set((winningLine ?? []).map((c) => `${c.col}-${c.row}`));
  const dim = winningLine !== null;
  const hoverFull = hoverCol !== null && board[hoverCol][ROWS - 1] !== null;

  // drop on click, not pointerdown: a click never fires after a touch-scroll,
  // so dragging the page from the board can't fling a disc in by accident
  const choose = (col: number) => {
    onHoverCol(col);
    if (interactive && board[col][ROWS - 1] === null) onDropCol(col);
  };

  return (
    <svg
      viewBox={VIEWBOX}
      className="block h-auto w-full select-none"
      style={{ overflow: "visible", filter: "drop-shadow(0 26px 34px rgba(0,0,0,0.5))" }}
      aria-label="Four in a Row board"
    >
      <Defs />

      {/* floor shadow */}
      <ellipse
        cx={BOARD_W / 2}
        cy={BOARD_H + LEG_H - 6}
        rx={BOARD_W * 0.44}
        ry={17}
        fill="url(#c4-floor)"
      />

      {/* legs, tucked behind the shell */}
      {[FRAME + CELL * 0.6, BOARD_W - FRAME - CELL * 1.6].map((x) => (
        <rect key={x} x={x} y={BOARD_H - 26} width={CELL} height={LEG_H + 26} rx={12} fill="url(#c4-leg)" />
      ))}

      {/* discs, behind the face */}
      <g>
        {ALL_CELLS.map((c) => {
          const disc = board[c.col][c.row];
          if (!disc) return null;
          const isFalling = falling !== null && falling.col === c.col && falling.row === c.row;
          if (isFalling) return null; // it is still in the air
          const won = winKeys.has(`${c.col}-${c.row}`);
          return (
            <DiscBody
              key={`${c.col}-${c.row}`}
              col={c.col}
              row={c.row}
              color={disc}
              opacity={dim && !won ? 0.34 : 1}
            />
          );
        })}
      </g>

      {/* the moulded face, holes punched clean through */}
      <g mask="url(#c4-holes)" pointerEvents="none">
        <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={38} fill="url(#c4-plastic)" />
        <rect x={0} y={0} width={BOARD_W} height={BOARD_H} rx={38} fill="url(#c4-sheen)" />
        <rect
          x={1.5}
          y={1.5}
          width={BOARD_W - 3}
          height={BOARD_H - 3}
          rx={37}
          fill="none"
          stroke="#7f9dff"
          strokeOpacity={0.28}
          strokeWidth={3}
        />
        <rect
          x={FRAME - 7}
          y={FRAME - 7}
          width={BOARD_W - (FRAME - 7) * 2}
          height={BOARD_H - (FRAME - 7) * 2}
          rx={22}
          fill="none"
          stroke="#0a1440"
          strokeOpacity={0.35}
          strokeWidth={2}
        />
      </g>

      {/* column wash on hover — light spilling down the plastic */}
      {hoverCol !== null && (
        <motion.g
          initial={{ opacity: 0, x: cx(hoverCol) }}
          animate={{ opacity: 1, x: cx(hoverCol) }}
          transition={{
            opacity: { duration: 0.2, ease: SWIFT },
            x: { type: "spring", stiffness: 520, damping: 34, mass: 0.5 },
          }}
          pointerEvents="none"
        >
          <rect
            x={-CELL / 2}
            y={8}
            width={CELL}
            height={BOARD_H - 16}
            rx={14}
            fill={hoverFull ? "url(#c4-colblock)" : "url(#c4-colwash)"}
          />
        </motion.g>
      )}

      {/* hole lips, drawn over disc rims so the discs really sit inside */}
      <g pointerEvents="none">
        {ALL_CELLS.map((c) => (
          <g key={`lip-${c.col}-${c.row}`}>
            <circle cx={cx(c.col)} cy={cy(c.row)} r={HOLE_R} fill="url(#c4-hole-in)" />
            <circle
              cx={cx(c.col)}
              cy={cy(c.row)}
              r={HOLE_R + 1}
              fill="none"
              stroke="url(#c4-hole-rim)"
              strokeWidth={2.5}
            />
          </g>
        ))}
      </g>

      {/* the winning line */}
      {winningLine && winningLine.length >= 2 && (
        <g pointerEvents="none">
          {winningLine.map((c) => (
            <motion.circle
              key={`glow-${c.col}-${c.row}`}
              cx={cx(c.col)}
              cy={cy(c.row)}
              r={HOLE_R + 4}
              fill="none"
              stroke="#fff3d4"
              strokeWidth={4}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.15, 0.85, 0.15] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}
          <motion.line
            x1={cx(winningLine[0].col)}
            y1={cy(winningLine[0].row)}
            x2={cx(winningLine[winningLine.length - 1].col)}
            y2={cy(winningLine[winningLine.length - 1].row)}
            stroke="#fff8e6"
            strokeOpacity={0.28}
            strokeWidth={26}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: SWIFT }}
          />
          <motion.line
            x1={cx(winningLine[0].col)}
            y1={cy(winningLine[0].row)}
            x2={cx(winningLine[winningLine.length - 1].col)}
            y2={cy(winningLine[winningLine.length - 1].row)}
            stroke="#fffdf6"
            strokeWidth={9}
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: SWIFT }}
          />
        </g>
      )}

      {/* ghost disc waiting in the lip */}
      {interactive && yourColor !== null && hoverCol !== null && (
        <motion.g
          initial={false}
          animate={{ x: cx(hoverCol), y: HOVER_Y, opacity: hoverFull ? 0.5 : 1 }}
          transition={{ type: "spring", stiffness: 520, damping: 34, mass: 0.5 }}
          pointerEvents="none"
        >
          {hoverFull ? (
            <g opacity={0.7}>
              <circle r={DISC_R} fill="none" stroke="#8b8496" strokeWidth={4} strokeDasharray="9 8" />
              <path
                d={`M ${n2(-DISC_R * 0.42)} ${n2(-DISC_R * 0.42)} L ${n2(DISC_R * 0.42)} ${n2(DISC_R * 0.42)}`}
                stroke="#8b8496"
                strokeWidth={5}
                strokeLinecap="round"
              />
            </g>
          ) : (
            <FloatDisc color={yourColor} r={DISC_R} ghost />
          )}
        </motion.g>
      )}

      {/* the disc in flight — above the face, so it never flickers behind plastic */}
      {falling && (
        <motion.g
          key={falling.key}
          initial={{ y: HOVER_Y - cy(falling.row) }}
          animate={{ y: [HOVER_Y - cy(falling.row), 0, -BOUNCE, 0] }}
          transition={{
            duration: fallSeconds(falling.row),
            times: [0, 0.74, 0.88, 1],
            ease: [FALL_EASE, BOUNCE_UP, BOUNCE_DOWN],
          }}
          onAnimationComplete={onLanded}
          pointerEvents="none"
        >
          <g transform={`translate(${cx(falling.col)} ${cy(falling.row)})`}>
            <FloatDisc color={falling.color} r={DISC_R} />
          </g>
        </motion.g>
      )}

      {/* column hit targets — the whole column, lip included.
          pointerleave lives on the group so sliding between columns doesn't
          blink the ghost off and on. */}
      <g onPointerLeave={() => onHoverCol(null)}>
        {Array.from({ length: COLS }, (_, col) => {
          const full = board[col][ROWS - 1] !== null;
          return (
            <rect
              key={`hit-${col}`}
              x={col === 0 ? -BLEED : FRAME + col * CELL}
              y={-LIP}
              width={col === 0 || col === COLS - 1 ? CELL + FRAME + BLEED : CELL}
              height={LIP + BOARD_H}
              fill="transparent"
              style={{ cursor: interactive ? (full ? "not-allowed" : "pointer") : "default" }}
              onPointerEnter={() => onHoverCol(col)}
              onClick={() => choose(col)}
            />
          );
        })}
      </g>
    </svg>
  );
}

export const Connect4Board = memo(BoardImpl);
