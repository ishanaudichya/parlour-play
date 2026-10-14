/* Game-picker poster for Dots and Boxes — a corner of a ruled notebook page:
   a few lines in two inks, a box hatched and initialled, a pen mid-stroke. */

import { hand } from "./font";
import { inkOf } from "./palette";

const U = 22;
const dots = Array.from({ length: 5 * 4 }, (_, i) => [(i % 5) * U, Math.floor(i / 5) * U]);
const lines: [number, number, number, number, number][] = [
  [0, 0, U, 0, 0],
  [U, 0, U * 2, 0, 1],
  [0, 0, 0, U, 1],
  [U, 0, U, U, 0],
  [0, U, U, U, 0],
  [U * 2, 0, U * 2, U, 1],
  [U, U, U * 2, U, 1],
  [U * 3, U, U * 3, U * 2, 0],
  [U * 2, U * 2, U * 3, U * 2, 1],
  [U * 3, 0, U * 4, 0, 0],
];

export function DotsPoster() {
  return (
    <div
      className="relative flex h-full min-h-[190px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#c9bfa6]"
      style={{
        background:
          "#fbf7ec repeating-linear-gradient(0deg, transparent 0 10px, rgba(80,130,200,0.16) 10px 11px), repeating-linear-gradient(90deg, transparent 0 10px, rgba(80,130,200,0.16) 10px 11px)",
      }}
    >
      <div className="pointer-events-none absolute inset-y-0 left-[12%] w-px" style={{ background: "rgba(214,70,70,0.45)" }} />
      <svg viewBox={`-12 -12 ${U * 4 + 24} ${U * 3 + 24}`} className="relative w-[170px]" aria-hidden>
        <defs>
          {[0, 1].map((s) => (
            <pattern key={s} id={`dp-h${s}`} width={3} height={3} patternUnits="userSpaceOnUse" patternTransform={`rotate(${s ? -45 : 45})`}>
              <line x1={0} y1={0} x2={0} y2={3} stroke={inkOf(s)} strokeWidth={1} />
            </pattern>
          ))}
        </defs>
        <rect x={2} y={2} width={U - 4} height={U - 4} fill="url(#dp-h0)" opacity={0.55} />
        <text x={U / 2} y={U / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={inkOf(0)} className={hand.className}>
          A
        </text>
        <rect x={U + 2} y={2} width={U - 4} height={U - 4} fill="url(#dp-h1)" opacity={0.55} />
        <text x={U * 1.5} y={U / 2 + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={inkOf(1)} className={hand.className}>
          B
        </text>
        {lines.map(([x1, y1, x2, y2, s], i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={inkOf(s)} strokeWidth={2.2} strokeLinecap="round" />
        ))}
        <line x1={U * 4} y1={U} x2={U * 4} y2={U * 1.6} stroke={inkOf(0)} strokeWidth={2.2} strokeLinecap="round" strokeDasharray="2.5 2.5" />
        {dots.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.9} fill="#2c2f3a" />
        ))}
      </svg>
      <div className={`${hand.className} relative mt-2 text-[22px] font-bold leading-none`} style={{ color: "#23262f" }}>
        Dots and Boxes
      </div>
    </div>
  );
}
