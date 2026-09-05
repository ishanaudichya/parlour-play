"use client";

/* The reactor. One scalable <svg>: a sheet of black glass, hairline grid
   lines that glow in the colour of whoever holds the turn, and glass orbs
   with a hot core. Cells one orb short of critical shiver; when a cell
   bursts its orbs fly to the neighbours and the replay hook feeds us the
   next frame. Every coordinate is an integer expression, no trig — nothing
   here can drift between server and client. */

import { motion } from "framer-motion";
import { memo } from "react";
import { criticalMass } from "@/lib/games/chainreaction/engine";
import type { ChainBoard } from "@/lib/games/chainreaction/types";
import { CELL, cx, cy, FRAME, GLASS, GLASS_RX, GRID_IDLE, ORB_PAINT, ORB_R, orbOffsets, paintFor } from "./palette";
import type { Flight } from "./playback";

/* ---------------- one orb ---------------- */

function Orb({ seat, r = ORB_R, ghost = false, halo = true }: { seat: number; r?: number; ghost?: boolean; halo?: boolean }) {
  const p = paintFor(seat);
  if (ghost) {
    return (
      <g>
        <circle r={r} fill={p.base} opacity={0.16} />
        <circle r={r - 1} fill="none" stroke={p.light} strokeWidth={1.6} strokeDasharray="4 3" opacity={0.85} />
      </g>
    );
  }
  return (
    <g>
      {halo && <circle r={r * 1.9} fill={`url(#cr-halo-${seat})`} opacity={0.5} />}
      <circle r={r} fill={`url(#cr-orb-${seat})`} />
      <circle r={r - 0.6} fill="none" stroke={p.deep} strokeWidth={0.9} opacity={0.35} />
      <ellipse cx={-r * 0.32} cy={-r * 0.4} rx={r * 0.32} ry={r * 0.22} fill="#ffffff" opacity={0.6} />
    </g>
  );
}

/* ---------------- defs ---------------- */

function Defs() {
  return (
    <defs>
      {ORB_PAINT.map((p, seat) => (
        <radialGradient key={`orb-${seat}`} id={`cr-orb-${seat}`} cx="0.36" cy="0.32" r="0.8">
          <stop offset="0%" stopColor={p.light} />
          <stop offset="28%" stopColor={p.base} />
          <stop offset="75%" stopColor={p.base} />
          <stop offset="100%" stopColor={p.deep} />
        </radialGradient>
      ))}
      {ORB_PAINT.map((p, seat) => (
        <radialGradient key={`halo-${seat}`} id={`cr-halo-${seat}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={p.base} stopOpacity="0.55" />
          <stop offset="55%" stopColor={p.base} stopOpacity="0.14" />
          <stop offset="100%" stopColor={p.base} stopOpacity="0" />
        </radialGradient>
      ))}
      <linearGradient id="cr-sheen" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.07" />
        <stop offset="42%" stopColor="#ffffff" stopOpacity="0.012" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
      </linearGradient>
      <radialGradient id="cr-vignette" cx="0.5" cy="0.5" r="0.75">
        <stop offset="60%" stopColor="#000000" stopOpacity="0" />
        <stop offset="100%" stopColor="#000000" stopOpacity="0.45" />
      </radialGradient>
    </defs>
  );
}

/* ---------------- one cell's orbs ---------------- */

const CellOrbs = memo(function CellOrbs({
  i,
  col,
  row,
  n,
  owner,
  primed,
  popKey,
}: {
  i: number;
  col: number;
  row: number;
  n: number;
  owner: number;
  primed: boolean;
  /** changes when this cell's orb has just been set down — replays the pop-in */
  popKey: string | null;
}) {
  const offsets = orbOffsets(n);
  const inner = (
    <g>
      {offsets.map(([dx, dy], k) => (
        <g key={k} transform={`translate(${dx} ${dy})`}>
          <Orb seat={owner} />
        </g>
      ))}
    </g>
  );
  return (
    <g transform={`translate(${cx(col)} ${cy(row)})`}>
      {popKey ? (
        <g key={popKey} style={{ animation: "cr-pop 380ms cubic-bezier(0.2,1.4,0.4,1) both" }}>
          {inner}
        </g>
      ) : primed ? (
        <g style={{ animation: `cr-shiver ${0.42 + (i % 5) * 0.03}s linear infinite`, animationDelay: `${(i % 7) * -0.06}s` }}>
          {inner}
        </g>
      ) : (
        inner
      )}
    </g>
  );
});

/* ---------------- board ---------------- */

export interface BoardProps {
  cols: number;
  rows: number;
  board: ChainBoard;
  flights: Flight[];
  bursting: number[];
  flightMs: number;
  /** who holds the turn — paints the grid; null when the game is over */
  turnSeat: number | null;
  /** the viewer's seat — null when spectating */
  yourSeat: number | null;
  /** your turn, game live, you are seated */
  interactive: boolean;
  hoverCell: number | null;
  onHoverCell: (i: number | null) => void;
  onPlace: (i: number) => void;
  landed: number | null;
  /** identifies the latest move, so pop-ins and flashes re-key */
  moveKey: string;
  /** game over: everything settles into the winner's colour */
  winnerSeat: number | null;
}

function BoardImpl({
  cols,
  rows,
  board,
  flights,
  bursting,
  flightMs,
  turnSeat,
  yourSeat,
  interactive,
  hoverCell,
  onHoverCell,
  onPlace,
  landed,
  moveKey,
  winnerSeat,
}: BoardProps) {
  const W = cols * CELL + FRAME * 2;
  const H = rows * CELL + FRAME * 2;
  const gridSeat = winnerSeat ?? turnSeat;
  const gridColor = gridSeat === null ? GRID_IDLE : paintFor(gridSeat).base;
  const burstSet = new Set(bursting);

  const legal = (i: number) => yourSeat !== null && (board[i].n === 0 || board[i].owner === yourSeat);
  const hoverLegal = hoverCell !== null && legal(hoverCell);
  const hoverCrit = hoverCell !== null && hoverLegal && board[hoverCell].n + 1 >= criticalMass(cols, rows, hoverCell);

  const choose = (i: number) => {
    onHoverCell(i);
    if (interactive && legal(i)) onPlace(i);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full select-none"
      style={{ overflow: "visible", filter: "drop-shadow(0 30px 40px rgba(0,0,0,0.6))" }}
      aria-label="Chain Reaction board"
    >
      <Defs />

      {/* the glass */}
      <rect x={0} y={0} width={W} height={H} rx={GLASS_RX} fill={GLASS} />
      <rect x={0} y={0} width={W} height={H} rx={GLASS_RX} fill="url(#cr-sheen)" />
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        rx={GLASS_RX - 1}
        fill="none"
        stroke={gridColor}
        strokeOpacity={0.45}
        strokeWidth={2}
        style={{ transition: "stroke 600ms ease" }}
      />
      <rect
        x={1}
        y={1}
        width={W - 2}
        height={H - 2}
        rx={GLASS_RX - 1}
        fill="none"
        stroke={gridColor}
        strokeOpacity={0.14}
        strokeWidth={8}
        style={{ transition: "stroke 600ms ease" }}
      />

      {/* grid — glows in the mover's colour */}
      <g style={{ transition: "stroke 600ms ease" }} stroke={gridColor} strokeLinecap="round">
        {Array.from({ length: cols + 1 }, (_, c) => (
          <g key={`v${c}`}>
            <line x1={FRAME + c * CELL} y1={FRAME} x2={FRAME + c * CELL} y2={H - FRAME} strokeWidth={5} strokeOpacity={0.09} />
            <line x1={FRAME + c * CELL} y1={FRAME} x2={FRAME + c * CELL} y2={H - FRAME} strokeWidth={1.4} strokeOpacity={0.62} />
          </g>
        ))}
        {Array.from({ length: rows + 1 }, (_, r) => (
          <g key={`h${r}`}>
            <line x1={FRAME} y1={FRAME + r * CELL} x2={W - FRAME} y2={FRAME + r * CELL} strokeWidth={5} strokeOpacity={0.09} />
            <line x1={FRAME} y1={FRAME + r * CELL} x2={W - FRAME} y2={FRAME + r * CELL} strokeWidth={1.4} strokeOpacity={0.62} />
          </g>
        ))}
      </g>

      {/* hover tint */}
      {interactive && hoverCell !== null && (
        <g pointerEvents="none">
          <rect
            x={FRAME + (hoverCell % cols) * CELL + 2}
            y={FRAME + Math.floor(hoverCell / cols) * CELL + 2}
            width={CELL - 4}
            height={CELL - 4}
            rx={8}
            fill={hoverLegal ? paintFor(yourSeat).base : "#ff4b5c"}
            opacity={hoverLegal ? (hoverCrit ? 0.2 : 0.12) : 0.09}
            style={{ animation: hoverCrit ? "cr-pulse 0.9s ease-in-out infinite" : undefined }}
          />
          {hoverLegal && yourSeat !== null && (
            <g
              transform={`translate(${cx(hoverCell % cols) + orbOffsets(board[hoverCell].n + 1)[board[hoverCell].n][0]} ${
                cy(Math.floor(hoverCell / cols)) + orbOffsets(board[hoverCell].n + 1)[board[hoverCell].n][1]
              })`}
            >
              <Orb seat={yourSeat} ghost />
            </g>
          )}
          {!hoverLegal && (
            <g transform={`translate(${cx(hoverCell % cols)} ${cy(Math.floor(hoverCell / cols))})`} opacity={0.55}>
              <path d="M -9 -9 L 9 9 M 9 -9 L -9 9" stroke="#ff8a95" strokeWidth={3} strokeLinecap="round" />
            </g>
          )}
        </g>
      )}

      {/* settled orbs */}
      <g pointerEvents="none">
        {board.map((c, i) => {
          if (c.n === 0 || c.owner === null) return null;
          const col = i % cols;
          const row = Math.floor(i / cols);
          return (
            <CellOrbs
              key={i}
              i={i}
              col={col}
              row={row}
              n={c.n}
              owner={c.owner}
              primed={c.n === criticalMass(cols, rows, i) - 1 && !burstSet.has(i)}
              popKey={landed === i ? moveKey : null}
            />
          );
        })}
      </g>

      {/* burst flashes */}
      <g pointerEvents="none">
        {bursting.map((i) => (
          <g key={`${moveKey}:${flightMs}:${i}`} transform={`translate(${cx(i % cols)} ${cy(Math.floor(i / cols))})`}>
            <circle
              r={30}
              fill="none"
              stroke={paintFor(flights[0]?.seat ?? turnSeat).light}
              strokeWidth={4}
              style={{ animation: `cr-flash ${Math.max(120, flightMs)}ms ease-out both` }}
            />
            <circle r={22} fill={paintFor(flights[0]?.seat ?? turnSeat).base} style={{ animation: `cr-flash ${Math.max(120, flightMs)}ms ease-out both` }} opacity={0.5} />
          </g>
        ))}
      </g>

      {/* orbs in flight */}
      <g pointerEvents="none">
        {flights.map((f) => (
          <motion.g
            key={`${moveKey}:${f.key}`}
            initial={{ x: cx(f.from % cols), y: cy(Math.floor(f.from / cols)), scale: 1 }}
            animate={{ x: cx(f.to % cols), y: cy(Math.floor(f.to / cols)), scale: 0.9 }}
            transition={{ duration: flightMs / 1000, ease: [0.3, 0.05, 0.25, 1] }}
          >
            <Orb seat={f.seat} halo={false} r={ORB_R - 1} />
          </motion.g>
        ))}
      </g>

      {/* vignette on the glass */}
      <rect x={0} y={0} width={W} height={H} rx={GLASS_RX} fill="url(#cr-vignette)" pointerEvents="none" />

      {/* hit targets */}
      <g onPointerLeave={() => onHoverCell(null)}>
        {board.map((_, i) => {
          const ok = legal(i);
          return (
            <rect
              key={`hit-${i}`}
              x={FRAME + (i % cols) * CELL}
              y={FRAME + Math.floor(i / cols) * CELL}
              width={CELL}
              height={CELL}
              fill="transparent"
              style={{ cursor: interactive ? (ok ? "pointer" : "not-allowed") : "default" }}
              onPointerEnter={() => onHoverCell(i)}
              onClick={() => choose(i)}
            />
          );
        })}
      </g>
    </svg>
  );
}

export const ChainBoardView = memo(BoardImpl);
