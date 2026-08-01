/* Game-picker poster for Four in a Row — a slice of the cabinet under the
   amber spotlight, one gold diagonal already made. Deterministic: every
   coordinate is an integer literal, no randomness and no trig. */

import { bungee } from "./font";
import { DISC_PAINT } from "./geometry";

const P_CELL = 38;
const P_FRAME = 11;
const P_COLS = 5;
const P_ROWS = 4;
const P_R = 15;
const P_W = P_COLS * P_CELL + P_FRAME * 2;
const P_H = P_ROWS * P_CELL + P_FRAME * 2;

const px = (col: number) => P_FRAME + col * P_CELL + P_CELL / 2;
const py = (row: number) => P_FRAME + (P_ROWS - 1 - row) * P_CELL + P_CELL / 2;

const CELLS = Array.from({ length: P_COLS * P_ROWS }, (_, i) => ({
  col: i % P_COLS,
  row: Math.floor(i / P_COLS),
}));

/** A finished gold diagonal, with a plausible pile of discs holding it up. */
const FILLED: { col: number; row: number; c: "red" | "yellow"; win?: boolean }[] = [
  { col: 0, row: 0, c: "yellow", win: true },
  { col: 1, row: 0, c: "red" },
  { col: 1, row: 1, c: "yellow", win: true },
  { col: 2, row: 0, c: "red" },
  { col: 2, row: 1, c: "red" },
  { col: 2, row: 2, c: "yellow", win: true },
  { col: 3, row: 0, c: "red" },
  { col: 3, row: 1, c: "yellow" },
  { col: 3, row: 2, c: "red" },
  { col: 3, row: 3, c: "yellow", win: true },
  { col: 4, row: 0, c: "red" },
];

export function Connect4Poster() {
  return (
    <div
      className="relative flex h-full min-h-[190px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#f5b23e]/35"
      style={{
        background:
          "radial-gradient(110% 80% at 50% -8%, rgba(245,178,62,0.16) 0%, transparent 62%), linear-gradient(180deg, #191521 0%, #0f0d16 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 54px rgba(5,4,8,0.85)" }} />

      <svg
        viewBox={`0 0 ${P_W} ${P_H}`}
        className="relative h-auto w-[152px]"
        style={{ filter: "drop-shadow(0 10px 16px rgba(0,0,0,0.55))" }}
        aria-hidden
      >
        <defs>
          <linearGradient id="c4p-plastic" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0%" stopColor="#2450be" />
            <stop offset="30%" stopColor="#1b3fa0" />
            <stop offset="100%" stopColor="#12266b" />
          </linearGradient>
          {(["red", "yellow"] as const).map((c) => {
            const p = DISC_PAINT[c];
            return (
              <radialGradient key={c} id={`c4p-${c}`} cx="0.36" cy="0.28" r="0.82">
                <stop offset="0%" stopColor={p.light} />
                <stop offset="38%" stopColor={p.base} />
                <stop offset="80%" stopColor={p.base} />
                <stop offset="100%" stopColor={p.deep} />
              </radialGradient>
            );
          })}
          <radialGradient id="c4p-hole" cx="0.5" cy="0.5" r="0.5">
            <stop offset="52%" stopColor="#000000" stopOpacity="0" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.6" />
          </radialGradient>
          <mask id="c4p-holes">
            <rect x={0} y={0} width={P_W} height={P_H} rx={16} fill="#ffffff" />
            {CELLS.map((c) => (
              <circle key={`${c.col}-${c.row}`} cx={px(c.col)} cy={py(c.row)} r={P_R} fill="#000000" />
            ))}
          </mask>
        </defs>

        {/* discs behind the face */}
        {FILLED.map((d) => (
          <g key={`${d.col}-${d.row}`}>
            <circle cx={px(d.col)} cy={py(d.row)} r={P_R + 1} fill={`url(#c4p-${d.c})`} />
            <circle
              cx={px(d.col)}
              cy={py(d.row)}
              r={P_R * 0.58}
              fill="none"
              stroke={DISC_PAINT[d.c].ring}
              strokeWidth={1.1}
              opacity={0.4}
            />
            <circle cx={px(d.col) - P_R * 0.32} cy={py(d.row) - P_R * 0.36} r={P_R * 0.17} fill="#ffffff" opacity={0.32} />
          </g>
        ))}

        {/* the moulded face */}
        <g mask="url(#c4p-holes)">
          <rect x={0} y={0} width={P_W} height={P_H} rx={16} fill="url(#c4p-plastic)" />
          <rect x={1} y={1} width={P_W - 2} height={P_H - 2} rx={15} fill="none" stroke="#7f9dff" strokeOpacity={0.26} strokeWidth={1.6} />
        </g>

        {/* hole lips */}
        {CELLS.map((c) => (
          <circle key={`lip-${c.col}-${c.row}`} cx={px(c.col)} cy={py(c.row)} r={P_R} fill="url(#c4p-hole)" />
        ))}

        {/* the made line */}
        <line
          x1={px(0)}
          y1={py(0)}
          x2={px(3)}
          y2={py(3)}
          stroke="#fff8e6"
          strokeOpacity={0.24}
          strokeWidth={11}
          strokeLinecap="round"
        />
        <line
          x1={px(0)}
          y1={py(0)}
          x2={px(3)}
          y2={py(3)}
          stroke="#fffdf6"
          strokeWidth={3.4}
          strokeLinecap="round"
        />
      </svg>

      <div className="relative mt-3 text-center">
        <div
          className={`${bungee.className} text-[14px] leading-none`}
          style={{ color: "#f4ead8", textShadow: "0 2px 0 rgba(0,0,0,0.55), 0 0 18px rgba(245,178,62,0.35)" }}
        >
          FOUR IN A ROW
        </div>
        <div className="mt-1.5 text-[9px] uppercase tracking-[0.28em]" style={{ color: "#a2957f" }}>
          Drop · Stack · Connect
        </div>
      </div>
    </div>
  );
}
