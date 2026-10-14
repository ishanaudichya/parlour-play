/* The armoury's insignia — one hand-drawn 24×24 mark for each of Pocket
   Tanks' original 30, painted in the weapon's own hue on a dark disc. Used on
   the draft cards, the weapon picker and the end card. */

import type { ReactNode } from "react";
import { WEAPONS, type WeaponId } from "@/lib/games/tanks/weapons";

const INK = "#14130f";

const GROUND = "#6d4c41";

/** a round bullet with a dash of motion */
function dot(c: string, x: number, y: number, r = 2.6, trail = 0): ReactNode {
  return (
    <g>
      {trail > 0 && <path d={`M${x - trail} ${y + trail * 0.6}L${x - r} ${y + r * 0.4}`} stroke={c} strokeWidth={r * 0.9} strokeLinecap="round" opacity={0.45} />}
      <circle cx={x} cy={y} r={r} fill={c} stroke={INK} strokeWidth={0.6} />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.35} fill="#fff" opacity={0.8} />
    </g>
  );
}

function burst(c: string, x: number, y: number, r: number, n = 8): ReactNode {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const rr = i % 2 ? r * 0.5 : r;
    pts.push(`${(x + Math.cos(a) * rr).toFixed(2)},${(y + Math.sin(a) * rr).toFixed(2)}`);
  }
  return <polygon points={pts.join(" ")} fill={c} stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />;
}

/** the classic explosion: concentric rings */
function rings(x: number, y: number, r: number, cols = ["#ffeb3b", "#ff9800", "#e53935"]): ReactNode {
  return (
    <g>
      {cols.map((col, i) => (
        <circle key={i} cx={x} cy={y} r={r * (1 - i / cols.length)} fill={col} />
      ))}
    </g>
  );
}

const ground = (d = "M2 18 Q12 15 22 18 V22 H2 Z") => <path d={d} fill={GROUND} />;
const tank = (x: number, y: number, c = "#e5483a") => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-3.6} y={-1.6} width={7.2} height={2.4} rx={1.2} fill={INK} />
    <path d="M-3 -1.6 L3 -1.6 L2.2 -3.4 L-2.4 -3.4 Z" fill={c} />
  </g>
);
const arc = (d: string, c: string, dash = "1.4 1.2") => <path d={d} fill="none" stroke={c} strokeWidth={0.9} strokeDasharray={dash} strokeLinecap="round" />;

const ICONS: Record<WeaponId, (c: string) => ReactNode> = {
  single: (c) => dot(c, 13, 11, 3.6, 7),
  big: (c) => (
    <>
      {rings(12, 12, 8.5)}
      {dot(c, 12, 12, 2.6)}
    </>
  ),
  three: (c) => (
    <>
      {dot(c, 7, 15, 2.2, 3)}
      {dot(c, 12, 10, 2.2, 3)}
      {dot(c, 17, 5.5, 2.2, 3)}
    </>
  ),
  five: (c) => (
    <>
      {[[4.5, 17], [8, 12], [12, 8], [16.5, 5.5], [20, 4]].map(([x, y], i) => (
        <g key={i}>{dot(c, x, y, 1.9)}</g>
      ))}
    </>
  ),
  jackhammer: (c) => (
    <>
      {ground()}
      {arc("M12 17 Q12 3 12 17", c, "1 1")}
      {[4, 8, 12].map((y, i) => (
        <path key={i} d={`M9.5 ${y} H14.5`} stroke={c} strokeWidth={0.9} opacity={0.6 - i * 0.15} />
      ))}
      {rings(12, 17, 3.2)}
      {dot(c, 12, 6, 2.2)}
    </>
  ),
  heatseeker: (c) => (
    <>
      {ground()}
      {tank(17, 17)}
      {arc("M3 13 Q8 3 13 7 Q16 10 16.5 14", c)}
      {dot(c, 16.4, 13.2, 2.2)}
      <path d="M14 11 L15 9 M18.8 11 L18 9" stroke="#ff8a65" strokeWidth={0.7} opacity={0.8} />
    </>
  ),
  tracer: (c) => (
    <>
      {ground()}
      {[0, 1, 2].map((i) => (
        <g key={i}>{arc(`M3 17 Q${10 + i * 2} ${2 + i * 2} ${16 + i * 2.5} 17`, c, "0.6 1.4")}</g>
      ))}
      <text x={20.5} y={13} fontSize={4.5} fontWeight={700} fill={c} textAnchor="middle">
        +1
      </text>
    </>
  ),
  piledriver: (c) => (
    <>
      {ground("M2 9 H22 V22 H2 Z")}
      <path d="M10 9 V20 H14 V9 Z" fill={INK} opacity={0.75} />
      {[10, 14, 18].map((y, i) => (
        <g key={i}>{rings(12, y, 2.6 - i * 0.3, ["#fff176", "#ff9800"])}</g>
      ))}
      {dot(c, 12, 5, 2)}
    </>
  ),
  dirtmover: (c) => (
    <>
      {ground("M2 9 H22 V22 H2 Z")}
      <path d="M6 9 L18 19 L20 17 L9 8 Z" fill={INK} opacity={0.75} />
      <path d="M13 13 L18.5 17.5 M18.5 17.5 L18.4 14.8 M18.5 17.5 L15.8 17.6" stroke={c} strokeWidth={1.1} strokeLinecap="round" fill="none" />
      {dot(c, 6, 6, 1.8)}
    </>
  ),
  crazyivan: (c) => (
    <>
      {dot(c, 12, 12, 2.6)}
      {[
        "M12 12 Q6 8 4 12",
        "M12 12 Q16 4 20 7",
        "M12 12 Q18 16 20 20",
        "M12 12 Q9 18 5 19",
        "M12 12 Q12 6 9 3",
      ].map((d, i) => (
        <path key={i} d={d} fill="none" stroke={c} strokeWidth={0.9} strokeLinecap="round" />
      ))}
      {[[4, 12], [20, 7], [20, 20], [5, 19], [9, 3]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.2} fill={c} />
      ))}
    </>
  ),
  spider: (c) => (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return <line key={i} x1={12} y1={12} x2={12 + Math.cos(a) * 10} y2={12 + Math.sin(a) * 10} stroke={c} strokeWidth={0.5} />;
      })}
      {[3.5, 6.5, 9.5].map((r, k) => (
        <polygon
          key={k}
          points={Array.from({ length: 8 }, (_, i) => {
            const a = (i / 8) * Math.PI * 2;
            return `${(12 + Math.cos(a) * r).toFixed(2)},${(12 + Math.sin(a) * r).toFixed(2)}`;
          }).join(" ")}
          fill="none"
          stroke={c}
          strokeWidth={0.5}
        />
      ))}
      <circle cx={12} cy={12} r={2} fill={INK} stroke={c} strokeWidth={0.5} />
    </>
  ),
  sniper: (c) => (
    <>
      <circle cx={12} cy={12} r={8} fill="none" stroke={c} strokeWidth={1.1} />
      <circle cx={12} cy={12} r={1.2} fill="#ff5252" />
      <path d="M12 2 V8 M12 16 V22 M2 12 H8 M16 12 H22" stroke={c} strokeWidth={1.1} />
    </>
  ),
  magicwall: (c) => (
    <>
      {ground()}
      <rect x={10} y={3} width={4} height={14} fill={GROUND} stroke={INK} strokeWidth={0.5} />
      <path d="M10 3 H14" stroke={c} strokeWidth={1} />
      {[[6, 6], [18, 8], [16, 3]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y - 1.4} V${y + 1.4} M${x - 1.4} ${y} H${x + 1.4}`} stroke={c} strokeWidth={0.7} />
      ))}
    </>
  ),
  dirtslinger: (c) => (
    <>
      {ground("M2 17 L9 17 L12 21 L15 17 L22 17 V22 H2 Z")}
      {[[6, 10], [4, 7], [8, 6], [18, 10], [20, 7], [16, 6]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.3} fill={GROUND} stroke={c} strokeWidth={0.4} />
      ))}
      <path d="M12 16 L6 9 M12 16 L18 9" stroke={c} strokeWidth={0.7} strokeDasharray="1 1" />
    </>
  ),
  zapper: (c) => (
    <>
      {ground()}
      {tank(17, 17)}
      {dot(c, 6, 5, 2.2)}
      <path d="M7.5 6.5 L11 9 L9.5 10.5 L15.5 14.5" fill="none" stroke={c} strokeWidth={1.2} strokeLinejoin="round" />
    </>
  ),
  napalm: (c) => (
    <>
      {ground()}
      {[6, 12, 18].map((x, i) => (
        <path key={i} d={`M${x - 2.4} 17 Q${x - 2} ${11 - i} ${x} ${8 + (i % 2) * 2} Q${x + 2} ${12 - i} ${x + 2.4} 17 Z`} fill={i === 1 ? "#ffd54f" : c} stroke={INK} strokeWidth={0.4} />
      ))}
    </>
  ),
  hailstorm: (c) => (
    <>
      {ground()}
      {Array.from({ length: 16 }, (_, i) => {
        const x = 3 + ((i * 37) % 18);
        const y = 3 + ((i * 53) % 13);
        return <rect key={i} x={x} y={y} width={1.4} height={1.4} fill={c} transform={`rotate(45 ${x + 0.7} ${y + 0.7})`} />;
      })}
    </>
  ),
  groundhog: (c) => (
    <>
      <path d="M2 18 Q12 4 22 18 V22 H2 Z" fill={GROUND} />
      <path d="M4 17 L19 14" stroke={c} strokeWidth={1} strokeDasharray="1.2 1" />
      {rings(19.5, 14, 3)}
    </>
  ),
  worm: (c) => (
    <>
      {ground("M2 8 H22 V22 H2 Z")}
      <path d="M4 18 Q7 15 9 18 T14 15 T17 11 T19 8" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      {rings(19, 7, 2.8)}
    </>
  ),
  homingworm: (c) => (
    <>
      {ground("M2 9 H22 V22 H2 Z")}
      {tank(17, 9)}
      <path d="M3 16 H16.5 V10" fill="none" stroke={c} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15 12 L16.5 10 L18 12" fill="none" stroke={c} strokeWidth={1} />
    </>
  ),
  skipper: (c) => (
    <>
      {ground()}
      {arc("M2 16 Q5 6 8 16 Q10.5 10 13 16 Q14.8 12 16.5 16 Q17.8 14 19 16", c, "0")}
      {rings(20.5, 16, 2.6)}
    </>
  ),
  chainreaction: (c) => (
    <>
      {ground()}
      {[[6, 15, 2.6], [11, 12, 3.4], [16, 15, 2.8], [19, 10, 2], [8, 8, 2]].map(([x, y, r], i) => (
        <g key={i}>{rings(x, y, r, i % 2 ? ["#fff176", c, "#e53935"] : ["#ffffff", "#ffb74d", c])}</g>
      ))}
    </>
  ),
  pineapple: (c) => (
    <>
      <ellipse cx={12} cy={14} rx={5} ry={6.2} fill={c} stroke={INK} strokeWidth={0.6} />
      <path d="M8 11 L16 17 M8 15 L13 19 M10 9 L16 13 M16 11 L8 17 M16 15 L11 19 M14 9 L8 13" stroke={INK} strokeWidth={0.45} opacity={0.6} />
      <path d="M12 8 L9.5 3.5 M12 8 L12 3 M12 8 L14.5 3.5" stroke="#43a047" strokeWidth={1.3} strokeLinecap="round" />
    </>
  ),
  firecracker: (c) => (
    <>
      {ground()}
      {[3.5, 7.5, 12, 16.5, 20.5].map((x, i) => (
        <g key={i}>{burst(i === 2 ? "#ffea00" : c, x, 14.5, 2.6 - Math.abs(i - 2) * 0.35, 6)}</g>
      ))}
    </>
  ),
  homingmissile: (c) => (
    <>
      {ground()}
      {tank(12, 17)}
      {arc("M2 6 H12", c)}
      <g transform="translate(12 9) rotate(90)">
        <rect x={-3} y={-1.2} width={5} height={2.4} fill="#eceff1" stroke={INK} strokeWidth={0.4} />
        <path d="M2 -1.2 L4 0 L2 1.2 Z" fill={c} />
      </g>
    </>
  ),
  dirtball: (c) => (
    <>
      {ground("M2 18 Q12 12 22 18 V22 H2 Z")}
      <circle cx={12} cy={8} r={4.2} fill={GROUND} stroke={c} strokeWidth={0.7} />
      <circle cx={13.4} cy={9} r={0.9} fill={INK} opacity={0.4} />
      <circle cx={10.6} cy={7} r={0.7} fill={INK} opacity={0.4} />
    </>
  ),
  tommygun: (c) => (
    <>
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${3 + i * 4} ${16 - i * 2.4} l3 -1.8`} stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      ))}
    </>
  ),
  mountainmover: (c) => (
    <>
      <path d="M2 18 L6 9 L9 13 Q12 21 15 13 L18 9 L22 18 V22 H2 Z" fill={GROUND} />
      <path d="M9 13 Q12 21 15 13" fill="none" stroke={c} strokeWidth={0.9} strokeDasharray="1.2 1" />
      <path d="M12 4 V10 M9.5 7.5 L12 10 L14.5 7.5" fill="none" stroke={c} strokeWidth={1.1} strokeLinecap="round" />
    </>
  ),
  scattershot: (c) => (
    <>
      {ground()}
      {rings(12, 16.5, 2.6)}
      {[50, 70, 90, 110, 130].map((deg, i) => {
        const a = (deg * Math.PI) / 180;
        return <g key={i}>{dot(c, 12 + Math.cos(a) * 9, 16 - Math.sin(a) * 10, 1.5)}</g>;
      })}
    </>
  ),
  cruiser: (c) => (
    <>
      <path d="M2 17 Q7 12 12 16 T22 14 V22 H2 Z" fill={GROUND} />
      {arc("M3 14.5 Q7 10 11 13.5", c, "1 1")}
      {dot(c, 13.5, 14.2, 2.2)}
      <path d="M16 12 L19 12 M16.5 14 L19.5 14" stroke={c} strokeWidth={0.7} opacity={0.6} />
    </>
  ),
};

export function WeaponIcon({ id, size = 28, plate = true, dim = false }: { id: WeaponId; size?: number; plate?: boolean; dim?: boolean }) {
  const m = WEAPONS[id];
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden style={{ opacity: dim ? 0.4 : 1, filter: dim ? "grayscale(0.8)" : undefined, flexShrink: 0 }}>
      {plate && (
        <>
          <circle cx={12} cy={12} r={11.5} fill="#16170f" stroke={m.hue} strokeOpacity={0.55} strokeWidth={0.8} />
          <circle cx={12} cy={12} r={11.5} fill={`url(#tk-plate)`} opacity={0.35} />
        </>
      )}
      <g transform={plate ? "translate(2.4 2.4) scale(0.8)" : undefined}>{ICONS[id](m.hue)}</g>
    </svg>
  );
}

/** Rendered once per screen: the gradient the icon plates share. */
export function IconDefs() {
  return (
    <svg width={0} height={0} style={{ position: "absolute" }} aria-hidden>
      <defs>
        <radialGradient id="tk-plate" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </radialGradient>
      </defs>
    </svg>
  );
}
