/* Game-picker poster for Pocket Tanks — a slice of the Red Mesa at dusk:
   two tanks on a cratered ridge, a dotted arc between them, and the shell
   going off at the end of it. Every coordinate is a literal. */

import { stencil } from "./font";
import { TANK } from "./palette";

function Tank({ x, y, c, flip = false, barrel }: { x: number; y: number; c: keyof typeof TANK; flip?: boolean; barrel: number }) {
  const P = TANK[c];
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <ellipse cy={1} rx={13} ry={2} fill="#000" opacity={0.4} />
      <g transform={`translate(0 -10) rotate(${-barrel})`}>
        <rect x={1} y={-1.2} width={13} height={2.4} fill="#3a3d35" />
        <rect x={12} y={-1.9} width={3} height={3.8} fill="#1d1f1a" />
      </g>
      <rect x={-11.5} y={-6} width={23} height={6} rx={3} fill="#1b1d18" />
      {[-8, -4, 0, 4, 8].map((wx) => (
        <circle key={wx} cx={wx} cy={-3} r={1.9} fill="#5c6056" />
      ))}
      <path d="M-10.5 -7 L10.5 -7 L8.5 -10.2 L-9 -10.2 Z" fill={P.base} stroke={P.deep} strokeWidth={0.5} />
      <path d="M-5 -10.2 A5.6 5 0 0 1 6 -10.2 Z" fill={P.base} stroke={P.deep} strokeWidth={0.5} />
      <path d="M-9 -9.8 H8" stroke={P.light} strokeWidth={0.6} opacity={0.8} />
    </g>
  );
}

export function TanksPoster() {
  return (
    <div className="relative flex h-full min-h-[190px] w-full flex-col items-center justify-start overflow-hidden rounded-lg border border-[#f2b134]/40" style={{ background: "linear-gradient(180deg, #170d31 0%, #3d1a52 30%, #932f5c 58%, #e5664b 80%, #ffbd73 100%)" }}>
      <svg viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="tkp-sun" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#fff3c4" />
            <stop offset="60%" stopColor="#ffb36b" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#ffb36b" stopOpacity={0} />
          </radialGradient>
          <linearGradient id="tkp-rock" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e09257" />
            <stop offset="35%" stopColor="#bb5c3b" />
            <stop offset="100%" stopColor="#4a2427" />
          </linearGradient>
          <radialGradient id="tkp-boom" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="30%" stopColor="#ffd27a" />
            <stop offset="70%" stopColor="#ff7a2a" stopOpacity={0.6} />
            <stop offset="100%" stopColor="#ff7a2a" stopOpacity={0} />
          </radialGradient>
        </defs>
        <circle cx={170} cy={78} r={44} fill="url(#tkp-sun)" />
        <circle cx={170} cy={78} r={17} fill="#ffe2a8" />
        <path d="M120 70 H230 M140 76 H210" stroke="#5a2a5e" strokeOpacity={0.5} strokeWidth={1.4} />
        {/* far mesas */}
        <path d="M0 98 L18 98 L22 84 L52 84 L56 98 L96 98 L100 88 L128 88 L132 98 L240 98 V150 H0 Z" fill="#4b1f45" />
        <path d="M0 106 L60 106 L64 96 L84 96 L88 106 L150 106 L156 92 L190 92 L196 106 L240 106 V150 H0 Z" fill="#6e2d45" />
        {/* the ridge, with a fresh crater */}
        <path d="M0 122 Q30 112 54 116 Q80 120 104 110 Q118 104 128 112 Q134 124 146 124 Q156 122 160 114 Q176 104 200 112 Q222 118 240 112 V150 H0 Z" fill="url(#tkp-rock)" />
        <path d="M0 122 Q30 112 54 116 Q80 120 104 110 Q118 104 128 112 Q134 124 146 124 Q156 122 160 114 Q176 104 200 112 Q222 118 240 112" fill="none" stroke="#ffc98a" strokeWidth={1.4} />
        <path d="M10 132 Q80 128 150 134 T240 130 M0 141 Q90 137 170 142 T240 140" stroke="#000" strokeOpacity={0.15} strokeWidth={0.8} fill="none" />
        {/* the shot */}
        <path d="M44 106 Q110 6 196 98" fill="none" stroke="#fff3d8" strokeWidth={1.2} strokeDasharray="2 4" strokeLinecap="round" opacity={0.85} />
        <Tank x={40} y={116} c="red" barrel={58} />
        <Tank x={212} y={115} c="blue" flip barrel={40} />
        <circle cx={198} cy={102} r={22} fill="url(#tkp-boom)" />
        {[[-1, -1.2], [1.2, -0.8], [-1.4, -0.2], [0.6, -1.5], [1.6, 0.1]].map(([dx, dy], i) => (
          <line key={i} x1={198 + dx * 6} y1={102 + dy * 6} x2={198 + dx * 16} y2={102 + dy * 16} stroke="#fff0b0" strokeWidth={1} strokeLinecap="round" />
        ))}
        {[[-14, -10, 2], [12, -16, 1.6], [18, -6, 1.4], [-8, -18, 1.2]].map(([dx, dy, s], i) => (
          <rect key={i} x={198 + dx} y={102 + dy} width={s * 1.6} height={s} fill="#8a3d2c" transform={`rotate(${i * 40} ${198 + dx} ${102 + dy})`} />
        ))}
      </svg>
      <div className="relative mt-3 text-center">
        <div className={`${stencil.className} text-[22px] leading-none tracking-[0.04em]`} style={{ color: "#f3ecd6", textShadow: "0 2px 0 rgba(0,0,0,0.6), 0 0 18px rgba(255,140,60,0.6)" }}>
          Pocket Tanks
        </div>
        <div className="mt-1.5 text-[9px] uppercase tracking-[0.28em]" style={{ color: "#ffe2c0", textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}>
          Draft · Aim · Level the ridge
        </div>
      </div>
    </div>
  );
}
