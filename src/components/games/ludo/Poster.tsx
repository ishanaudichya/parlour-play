/* Game-picker poster for Ludo — a corner of the heirloom board: the vermilion
   yard, the first stretch of the loop with its star, a token on its way, and
   the die showing the six that got it out. Every coordinate is a literal. */

import { DieFace } from "./Die";
import { rozha } from "./font";
import { BRASS, IVORY, IVORY_DEEP, PAINT } from "./paint";

const K = 26; // poster cell

function Tok({ x, y, c, r = 8 }: { x: number; y: number; c: keyof typeof PAINT; r?: number }) {
  const p = PAINT[c];
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cy={r * 0.75} rx={r * 0.85} ry={r * 0.3} fill="#000" opacity={0.3} />
      <circle r={r} fill={`url(#ludop-${c})`} />
      <circle r={r - 0.8} fill="none" stroke={p.deep} strokeWidth={1} opacity={0.6} />
      <ellipse cx={-r * 0.3} cy={-r * 0.4} rx={r * 0.32} ry={r * 0.18} fill="#fff" opacity={0.55} />
    </g>
  );
}

export function LudoPoster() {
  const W = 9 * K;
  const H = 6 * K;
  return (
    <div
      className="relative flex h-full min-h-[190px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#c9a45c]/45"
      style={{ background: "radial-gradient(110% 80% at 50% -8%, rgba(201,164,92,0.22) 0%, transparent 62%), linear-gradient(180deg, #32161f 0%, #170a10 100%)" }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ boxShadow: "inset 0 0 54px rgba(0,0,0,0.8)" }} />

      <svg viewBox={`-6 -6 ${W + 12} ${H + 12}`} className="relative h-auto w-[176px]" style={{ filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.6))" }} aria-hidden>
        <defs>
          {(["red", "yellow", "blue", "green"] as const).map((c) => (
            <radialGradient key={c} id={`ludop-${c}`} cx="0.38" cy="0.32" r="0.78">
              <stop offset="0%" stopColor={PAINT[c].light} />
              <stop offset="40%" stopColor={PAINT[c].base} />
              <stop offset="100%" stopColor={PAINT[c].deep} />
            </radialGradient>
          ))}
          <linearGradient id="ludop-yard" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={PAINT.red.light} />
            <stop offset="50%" stopColor={PAINT.red.base} />
            <stop offset="100%" stopColor={PAINT.red.deep} />
          </linearGradient>
        </defs>
        {/* lacquer edge + ivory */}
        <rect x={-6} y={-6} width={W + 12} height={H + 12} rx={8} fill="#2b1510" />
        <rect x={-3} y={-3} width={W + 6} height={H + 6} rx={5} fill="none" stroke={BRASS} strokeWidth={1.2} opacity={0.8} />
        <rect x={0} y={0} width={W} height={H} fill={IVORY} />
        {/* the red yard, cropped */}
        <rect x={1} y={1} width={6 * K - 2} height={6 * K - 1} rx={6} fill="url(#ludop-yard)" />
        <rect x={K} y={K} width={4 * K} height={4 * K} rx={4} fill={IVORY_DEEP} stroke={PAINT.red.deep} strokeOpacity={0.5} />
        {[[2 * K, 2 * K], [4 * K, 2 * K], [2 * K, 4 * K], [4 * K, 4 * K]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={11} fill={PAINT.red.tint} stroke={PAINT.red.base} strokeOpacity={0.6} />
        ))}
        <Tok x={2 * K} y={2 * K} c="red" />
        <Tok x={4 * K} y={2 * K} c="red" />
        <Tok x={2 * K} y={4 * K} c="red" />
        {/* the arm: three columns of track */}
        {[0, 1, 2].map((col) =>
          [0, 1, 2, 3, 4, 5].map((row) => {
            const x = (6 + col) * K;
            const y = row * K;
            const isHome = col === 1 && row < 5;
            const isStart = col === 0 && row === 5;
            return (
              <rect key={`${col}-${row}`} x={x} y={y} width={K} height={K} fill={isHome ? PAINT.blue.base : isStart ? PAINT.red.base : IVORY} stroke="rgba(74,50,32,0.4)" strokeWidth={0.7} />
            );
          })
        )}
        {/* a star on the outer column */}
        <path d="M 0 -7 L 1.9 -2.4 L 6.9 -2.2 L 3 1 L 4.2 5.9 L 0 3.2 L -4.2 5.9 L -3 1 L -6.9 -2.2 L -1.9 -2.4 Z" transform={`translate(${8.5 * K} ${2.5 * K})`} fill="#4a3220" opacity={0.35} />
        <Tok x={6.5 * K} y={2.5 * K} c="red" r={7.5} />
        <Tok x={8.5 * K} y={4.5 * K} c="yellow" r={7.5} />
      </svg>

      {/* the die, tucked into the corner */}
      <div className="absolute right-4 top-4 rotate-[14deg]" style={{ filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.6))" }}>
        <DieFace value={6} size={34} />
      </div>

      <div className="relative mt-3 text-center">
        <div className={`${rozha.className} text-[20px] leading-none`} style={{ color: "#f4ead8", textShadow: "0 2px 0 rgba(0,0,0,0.5), 0 0 18px rgba(201,164,92,0.4)" }}>
          Ludo
        </div>
        <div className="mt-1.5 text-[9px] uppercase tracking-[0.28em]" style={{ color: "#a4937a" }}>
          Roll · Race · Send them home
        </div>
      </div>
    </div>
  );
}
