/* Game-picker poster for Chain Reaction — a slice of black glass, the grid
   glowing violet, a few orbs settled and one cell caught mid-burst. Every
   coordinate is a literal: no randomness, no trig, nothing to drift. */

import { chakra } from "./font";
import { ORB_PAINT } from "./palette";

const P_CELL = 40;
const P_FRAME = 8;
const P_COLS = 5;
const P_ROWS = 3;
const P_W = P_COLS * P_CELL + P_FRAME * 2;
const P_H = P_ROWS * P_CELL + P_FRAME * 2;
const R = 6.5;

const px = (col: number) => P_FRAME + col * P_CELL + P_CELL / 2;
const py = (row: number) => P_FRAME + row * P_CELL + P_CELL / 2;

/** settled orbs: [col, row, seat, offsets] */
const ORBS: { col: number; row: number; seat: number; dots: [number, number][] }[] = [
  { col: 0, row: 0, seat: 0, dots: [[0, 0]] },
  { col: 1, row: 2, seat: 1, dots: [[-7, 0], [7, 0]] },
  { col: 4, row: 0, seat: 1, dots: [[0, 0]] },
  { col: 3, row: 1, seat: 0, dots: [[0, -7], [-7, 5], [7, 5]] },
  { col: 4, row: 2, seat: 4, dots: [[0, 0]] },
  { col: 0, row: 2, seat: 4, dots: [[0, 0]] },
];

/** the burst: cell (2,1) has just gone — orbs on their way to four neighbours */
const FLY: { x: number; y: number }[] = [
  { x: px(2), y: py(1) - 22 },
  { x: px(2), y: py(1) + 22 },
  { x: px(2) - 22, y: py(1) },
  { x: px(2) + 22, y: py(1) },
];

function Orb({ x, y, seat, r = R }: { x: number; y: number; seat: number; r?: number }) {
  const p = ORB_PAINT[seat];
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r * 2} fill={p.base} opacity={0.14} />
      <circle r={r} fill={`url(#crp-${seat})`} />
      <ellipse cx={-r * 0.32} cy={-r * 0.4} rx={r * 0.3} ry={r * 0.2} fill="#ffffff" opacity={0.6} />
    </g>
  );
}

export function ChainReactionPoster() {
  const grid = "#c86bff";
  return (
    <div
      className="relative flex h-full min-h-[190px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#c86bff]/35"
      style={{
        background:
          "radial-gradient(110% 80% at 50% -8%, rgba(200,107,255,0.16) 0%, transparent 62%), linear-gradient(180deg, #12141c 0%, #07080c 100%)",
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 54px rgba(0,0,0,0.85)" }} />

      <svg viewBox={`0 0 ${P_W} ${P_H}`} className="relative h-auto w-[164px]" style={{ filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.65))" }} aria-hidden>
        <defs>
          {ORB_PAINT.map((p, seat) => (
            <radialGradient key={seat} id={`crp-${seat}`} cx="0.36" cy="0.32" r="0.8">
              <stop offset="0%" stopColor={p.light} />
              <stop offset="30%" stopColor={p.base} />
              <stop offset="100%" stopColor={p.deep} />
            </radialGradient>
          ))}
        </defs>

        <rect x={0} y={0} width={P_W} height={P_H} rx={9} fill="#05060a" />
        <rect x={0.75} y={0.75} width={P_W - 1.5} height={P_H - 1.5} rx={8.5} fill="none" stroke={grid} strokeOpacity={0.5} strokeWidth={1.2} />

        <g stroke={grid}>
          {Array.from({ length: P_COLS + 1 }, (_, c) => (
            <line key={`v${c}`} x1={P_FRAME + c * P_CELL} y1={P_FRAME} x2={P_FRAME + c * P_CELL} y2={P_H - P_FRAME} strokeWidth={0.8} strokeOpacity={0.6} />
          ))}
          {Array.from({ length: P_ROWS + 1 }, (_, r) => (
            <line key={`h${r}`} x1={P_FRAME} y1={P_FRAME + r * P_CELL} x2={P_W - P_FRAME} y2={P_FRAME + r * P_CELL} strokeWidth={0.8} strokeOpacity={0.6} />
          ))}
        </g>

        {ORBS.map((o) =>
          o.dots.map(([dx, dy], k) => <Orb key={`${o.col}-${o.row}-${k}`} x={px(o.col) + dx} y={py(o.row) + dy} seat={o.seat} />)
        )}

        {/* the burst */}
        <circle cx={px(2)} cy={py(1)} r={15} fill="none" stroke={ORB_PAINT[7].light} strokeWidth={1.4} opacity={0.55} />
        <circle cx={px(2)} cy={py(1)} r={9} fill={ORB_PAINT[7].base} opacity={0.22} />
        {FLY.map((f, i) => (
          <Orb key={i} x={f.x} y={f.y} seat={7} r={5.5} />
        ))}
      </svg>

      <div className="relative mt-3 text-center">
        <div className={`${chakra.className} text-[14px] font-bold leading-none tracking-[0.06em]`} style={{ color: "#eef0f6", textShadow: "0 0 18px rgba(200,107,255,0.45)" }}>
          CHAIN REACTION
        </div>
        <div className="mt-1.5 text-[9px] uppercase tracking-[0.28em]" style={{ color: "#8a90a3" }}>
          Fill · Burst · Convert
        </div>
      </div>
    </div>
  );
}
