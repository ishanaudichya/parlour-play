/* The armoury's insignia — one hand-drawn 24×24 mark per weapon, painted in
   the weapon's own hue on a dark enamel disc. Used on draft cards, the
   loader and the end card. */

import type { ReactNode } from "react";
import { WEAPONS, type WeaponId } from "@/lib/games/tanks/weapons";

const INK = "#14130f";

function shell(c: string, x = 12, y = 12, rot = -45, s = 1): ReactNode {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
      <path d="M-6 -2.6 H3 Q7 0 3 2.6 H-6 Z" fill={c} stroke={INK} strokeWidth={0.8} />
      <rect x={-6} y={-2.6} width={2} height={5.2} fill={INK} opacity={0.55} />
      <path d="M-5.5 -1.8 H2" stroke="#fff" strokeOpacity={0.45} strokeWidth={0.7} />
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
  return <polygon points={pts.join(" ")} fill={c} stroke={INK} strokeWidth={0.7} strokeLinejoin="round" />;
}

const ICONS: Record<WeaponId, (c: string) => ReactNode> = {
  shell: (c) => shell(c, 12, 12, -40, 1.25),
  howitzer: (c) => (
    <>
      {shell(c, 12, 12, -40, 1.55)}
      <path d="M5 19 L9 15" stroke={c} strokeWidth={1.2} strokeLinecap="round" opacity={0.6} />
    </>
  ),
  sun: (c) => (
    <>
      {Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={12 + Math.cos(a) * 6.5} y1={12 + Math.sin(a) * 6.5} x2={12 + Math.cos(a) * 9.5} y2={12 + Math.sin(a) * 9.5} stroke={c} strokeWidth={1.3} strokeLinecap="round" />;
      })}
      <circle cx={12} cy={12} r={5.2} fill={c} stroke={INK} strokeWidth={0.8} />
      <circle cx={10.6} cy={10.6} r={1.6} fill="#fff" opacity={0.7} />
    </>
  ),
  trident: (c) => (
    <>
      {shell(c, 9, 15, -60, 0.8)}
      {shell(c, 12, 12, -45, 0.8)}
      {shell(c, 15, 9, -30, 0.8)}
    </>
  ),
  fan: (c) => (
    <>
      {[-70, -55, -40, -25, -10].map((r, i) => (
        <g key={i}>{shell(c, 6 + Math.cos((r * Math.PI) / 180) * 8, 18 + Math.sin((r * Math.PI) / 180) * 8, r, 0.62)}</g>
      ))}
    </>
  ),
  hydra: (c) => (
    <>
      <path d="M4 20 Q9 12 12 11" stroke={c} strokeWidth={1.6} fill="none" strokeLinecap="round" />
      {[[-35, 18, 6], [0, 19, 11], [35, 16, 16.5]].map(([r, x, y], i) => (
        <g key={i}>
          <path d={`M12 11 Q${(12 + x) / 2} ${y - 3} ${x} ${y - 4}`} stroke={c} strokeWidth={1.3} fill="none" />
          <circle cx={x} cy={y - 4} r={2.3} fill={c} stroke={INK} strokeWidth={0.7} />
          <circle cx={x + 0.6} cy={y - 4.6} r={0.5} fill="#fff" />
          {void r}
        </g>
      ))}
    </>
  ),
  mirv: (c) => (
    <>
      <path d="M4 14 Q12 2 20 14" stroke={c} strokeWidth={1} strokeDasharray="1.5 1.5" fill="none" />
      {[5, 9, 13, 17, 21].map((x, i) => (
        <g key={i}>
          <line x1={x - 0.5} y1={13} x2={x - 0.5} y2={17} stroke={c} strokeWidth={0.6} opacity={0.6} />
          <circle cx={x - 0.5} cy={18.5} r={1.6} fill={c} stroke={INK} strokeWidth={0.6} />
        </g>
      ))}
      {burst(c, 12, 7, 3, 5)}
    </>
  ),
  cluster: (c) => (
    <>
      <circle cx={12} cy={13} r={4.6} fill={c} stroke={INK} strokeWidth={0.8} />
      {[0, 60, 120, 180, 240, 300].map((a) => {
        const r = (a * Math.PI) / 180;
        return <circle key={a} cx={12 + Math.cos(r) * 8} cy={13 + Math.sin(r) * 8} r={1.7} fill={c} stroke={INK} strokeWidth={0.6} />;
      })}
      <circle cx={10.8} cy={11.6} r={1.2} fill="#fff" opacity={0.5} />
    </>
  ),
  daisy: (c) => (
    <>
      <path d="M2 17 H22" stroke="#7a6a50" strokeWidth={1} />
      {[4, 9, 14, 19].map((x, i) => (
        <g key={i}>
          <rect x={x - 1.5} y={12} width={3} height={5} rx={0.6} fill={i % 2 ? "#ffd34d" : c} stroke={INK} strokeWidth={0.6} />
        </g>
      ))}
      {burst("#ffd34d", 19.5, 8, 3.4, 6)}
    </>
  ),
  roller: (c) => (
    <>
      <path d="M2 20 Q12 12 22 20" stroke="#7a6a50" strokeWidth={1.2} fill="none" />
      <circle cx={8} cy={12} r={5} fill={c} stroke={INK} strokeWidth={0.8} />
      <path d="M8 7 A5 5 0 0 1 13 12" stroke="#c0392b" strokeWidth={1.6} fill="none" />
      <path d="M15 11 h4 M16 14 h3" stroke={c} strokeWidth={0.9} strokeLinecap="round" opacity={0.6} />
    </>
  ),
  pinball: (c) => (
    <>
      <path d="M3 18 L8 9 L13 17 L18 8" stroke={c} strokeWidth={0.9} strokeDasharray="1.4 1.2" fill="none" />
      <circle cx={18.5} cy={7.5} r={3.4} fill={c} stroke={INK} strokeWidth={0.8} />
      <circle cx={17.4} cy={6.4} r={1.1} fill="#fff" />
      <path d="M2 20 H22" stroke="#7a6a50" strokeWidth={1} />
    </>
  ),
  tunneler: (c) => (
    <>
      <path d="M2 9 Q8 7 22 9 V22 H2 Z" fill="#6a4a30" />
      <path d="M5 8 Q9 13 14 15" stroke="#2a1a10" strokeWidth={3.4} strokeLinecap="round" fill="none" />
      <g transform="translate(15.5 16) rotate(25)">
        <path d="M-3 -2 L3 0 L-3 2 Z" fill={c} stroke={INK} strokeWidth={0.6} />
      </g>
    </>
  ),
  sinkhole: (c) => (
    <>
      <path d="M2 9 H8 Q12 20 16 9 H22 V22 H2 Z" fill="#6a4a30" />
      <path d="M12 3 V11" stroke={c} strokeWidth={1.6} />
      <path d="M10 10 L12 14 L14 10 Z" fill={c} stroke={INK} strokeWidth={0.6} />
    </>
  ),
  lance: (c) => (
    <>
      <line x1={3} y1={20} x2={21} y2={4} stroke={c} strokeWidth={4} opacity={0.35} strokeLinecap="round" />
      <line x1={3} y1={20} x2={21} y2={4} stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <line x1={3} y1={20} x2={21} y2={4} stroke="#fff" strokeWidth={0.6} strokeLinecap="round" />
    </>
  ),
  prism: (c) => (
    <>
      <path d="M2 20 H22" stroke="#7a6a50" strokeWidth={1} />
      <polyline points="3,5 9,19 15,6 21,15" stroke={c} strokeWidth={1.6} fill="none" strokeLinejoin="round" />
      <polyline points="3,5 9,19 15,6 21,15" stroke="#fff" strokeWidth={0.5} fill="none" strokeLinejoin="round" />
    </>
  ),
  napalm: (c) => (
    <>
      <path d="M2 18 Q12 14 22 18 V22 H2 Z" fill="#5a3a24" />
      {[6, 12, 18].map((x, i) => (
        <path key={i} d={`M${x - 2.4} 17 Q${x - 2} ${11 - i} ${x} ${8 + (i % 2) * 2} Q${x + 2} ${12 - i} ${x + 2.4} 17 Z`} fill={i === 1 ? "#ffd34d" : c} stroke={INK} strokeWidth={0.5} />
      ))}
    </>
  ),
  acid: (c) => (
    <>
      <path d="M5 9 Q5 4 10 4.5 Q12 2 15.5 4 Q20 4 19.5 8.5 Q19.5 11 16 11 H8 Q5 11 5 9 Z" fill="#3d5a1c" stroke={INK} strokeWidth={0.6} />
      {[7, 11, 15, 18].map((x, i) => (
        <path key={i} d={`M${x} ${13 + (i % 2) * 2} q-1 2 0 3 q1 -1 0 -3 Z`} fill={c} stroke={c} strokeWidth={1} />
      ))}
    </>
  ),
  thunder: (c) => (
    <>
      <path d="M4 8 Q4 3 9 3.5 Q11 1.5 14.5 3 Q20 3 20 7.5 Q20 10 16 10 H8 Q4 10 4 8 Z" fill="#2a3247" stroke={INK} strokeWidth={0.6} />
      <path d="M13 9 L9.5 15 H12.5 L10 21 L16 13 H13 L15 9 Z" fill={c} stroke={INK} strokeWidth={0.6} strokeLinejoin="round" />
    </>
  ),
  airraid: (c) => (
    <>
      <g transform="translate(12 7)">
        <ellipse rx={8} ry={1.6} fill={c} stroke={INK} strokeWidth={0.6} />
        <path d="M-2 0 L-5 4 H-2 L1 0 Z" fill={c} stroke={INK} strokeWidth={0.5} />
        <path d="M-7 -1 L-8.5 -3.5 H-6.5 L-5 -1" fill={c} />
      </g>
      {[8, 12, 16].map((x, i) => (
        <ellipse key={i} cx={x} cy={13 + i * 2.6} rx={1} ry={1.8} fill={INK} stroke={c} strokeWidth={0.5} />
      ))}
    </>
  ),
  meteors: (c) => (
    <>
      {[[16, 6, 2.6], [10, 12, 2], [18, 15, 1.6]].map(([x, y, r], i) => (
        <g key={i}>
          <path d={`M${x} ${y} L${x - 7} ${y - 6}`} stroke={c} strokeWidth={r} strokeLinecap="round" opacity={0.45} />
          <circle cx={x} cy={y} r={r} fill="#5a4436" stroke={c} strokeWidth={0.8} />
        </g>
      ))}
      <path d="M2 21 H22" stroke="#7a6a50" strokeWidth={1} />
    </>
  ),
  skyspear: (c) => (
    <>
      <rect x={10} y={2} width={4} height={15} fill={c} opacity={0.4} />
      <rect x={11.3} y={2} width={1.4} height={15} fill="#fff" />
      <ellipse cx={12} cy={18.5} rx={7} ry={2} fill="none" stroke={c} strokeWidth={1} />
      <ellipse cx={12} cy={18.5} rx={3.5} ry={1} fill="none" stroke={c} strokeWidth={0.8} />
    </>
  ),
  singularity: (c) => (
    <>
      <ellipse cx={12} cy={12} rx={10} ry={3.4} fill="none" stroke={c} strokeWidth={1.2} transform="rotate(-18 12 12)" />
      <circle cx={12} cy={12} r={4.6} fill="#06020c" stroke={c} strokeWidth={1} />
      <ellipse cx={12} cy={12} rx={7} ry={2} fill="none" stroke="#ffd6f5" strokeWidth={0.6} transform="rotate(-18 12 12)" strokeDasharray="4 3" />
    </>
  ),
  tremor: (c) => (
    <>
      <polyline points="2,12 5,12 7,6 9,18 11,4 13,20 15,8 17,15 19,12 22,12" stroke={c} strokeWidth={1.5} fill="none" strokeLinejoin="round" />
    </>
  ),
  volcano: (c) => (
    <>
      <path d="M2 21 L9 10 H15 L22 21 Z" fill="#4a2a20" stroke={INK} strokeWidth={0.6} />
      <path d="M9 10 Q12 12 15 10" fill={c} />
      {[[8, 5], [12, 3], [16, 6]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={1.4} fill={c} />
      ))}
      <path d="M11 13 L10 17 M13 13 L14 16" stroke={c} strokeWidth={0.9} />
    </>
  ),
  mudpie: (c) => (
    <>
      <path d="M2 20 Q12 10 22 20 Z" fill={c} stroke={INK} strokeWidth={0.6} />
      <circle cx={12} cy={7} r={4} fill={c} stroke={INK} strokeWidth={0.7} />
      <circle cx={13.4} cy={8} r={1} fill={INK} opacity={0.4} />
      <circle cx={10.5} cy={6} r={0.7} fill={INK} opacity={0.4} />
    </>
  ),
  rampart: (c) => (
    <>
      <path d="M3 21 H21" stroke="#7a6a50" strokeWidth={1} />
      <path d="M7 21 V8 H9 V6 H11 V8 H13 V6 H15 V8 H17 V21 Z" fill={c} stroke={INK} strokeWidth={0.7} />
      <path d="M7 12 H17 M7 16 H17 M12 8 V12 M10 12 V16 M14 12 V16 M12 16 V21" stroke={INK} strokeWidth={0.5} opacity={0.5} />
    </>
  ),
  blink: (c) => (
    <>
      <path d="M12 3 L16 12 L12 21 L8 12 Z" fill="none" stroke={c} strokeWidth={1.3} />
      <path d="M12 7 L14 12 L12 17 L10 12 Z" fill={c} />
      <circle cx={4} cy={6} r={0.9} fill={c} />
      <circle cx={20} cy={17} r={0.9} fill={c} />
      <circle cx={19} cy={5} r={0.6} fill={c} />
    </>
  ),
  seeker: (c) => (
    <>
      <circle cx={17} cy={7} r={4} fill="none" stroke={c} strokeWidth={0.8} />
      <path d="M17 2 V4 M17 10 V12 M12 7 H14 M20 7 H22" stroke={c} strokeWidth={0.8} />
      <path d="M3 20 Q5 11 13 10" stroke="#ddd" strokeWidth={0.8} fill="none" strokeDasharray="1.4 1.2" />
      <g transform="translate(14 9) rotate(-28)">
        <rect x={-4} y={-1.3} width={6} height={2.6} fill="#eee" stroke={INK} strokeWidth={0.5} />
        <path d="M2 -1.3 L4.5 0 L2 1.3 Z" fill={c} />
      </g>
    </>
  ),
  boomerang: (c) => (
    <>
      <path d="M5 18 Q8 6 18 5" stroke={c} strokeWidth={3.4} fill="none" strokeLinecap="round" />
      <path d="M5 18 Q8 6 18 5" stroke={INK} strokeWidth={0.6} fill="none" strokeDasharray="2 2" opacity={0.5} />
      <path d="M20 12 Q21 18 15 20" stroke={c} strokeWidth={0.8} fill="none" strokeDasharray="1.2 1.2" />
    </>
  ),
  buzzsaw: (c) => (
    <>
      <polygon
        points={Array.from({ length: 24 }, (_, i) => {
          const a = (i / 24) * Math.PI * 2;
          const r = i % 2 ? 6.6 : 8.6;
          return `${(12 + Math.cos(a) * r).toFixed(2)},${(11 + Math.sin(a) * r).toFixed(2)}`;
        }).join(" ")}
        fill={c}
        stroke={INK}
        strokeWidth={0.6}
      />
      <circle cx={12} cy={11} r={2.6} fill={INK} opacity={0.6} />
      <circle cx={12} cy={11} r={1} fill="#e8b23a" />
    </>
  ),
  fireworks: (c) => (
    <>
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2;
        const col = ["#ff6bd6", "#62f0ff", "#ffd34d", "#8cff6b"][i % 4];
        return (
          <g key={i}>
            <line x1={12 + Math.cos(a) * 3} y1={10 + Math.sin(a) * 3} x2={12 + Math.cos(a) * 8} y2={10 + Math.sin(a) * 8} stroke={col} strokeWidth={1} strokeLinecap="round" />
            <circle cx={12 + Math.cos(a) * 9} cy={10 + Math.sin(a) * 9} r={0.9} fill={col} />
          </g>
        );
      })}
      <circle cx={12} cy={10} r={1.6} fill={c} />
      <path d="M12 21 V16" stroke={c} strokeWidth={0.8} strokeDasharray="1 1" />
    </>
  ),
  gatling: (c) => (
    <>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={3} y={8 + i * 3} width={11} height={2} rx={1} fill="#7d858e" stroke={INK} strokeWidth={0.5} />
      ))}
      <rect x={2} y={7} width={3} height={10} rx={1} fill="#4a4f55" />
      {[16, 19, 22].map((x, i) => (
        <line key={i} x1={x - 2} y1={9 + i * 3} x2={x} y2={9 + i * 3} stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      ))}
    </>
  ),
  jackhammer: (c) => (
    <>
      <path d="M2 20 Q12 24 22 20 V22 H2 Z" fill="#6a4a30" />
      <rect x={9} y={4} width={6} height={10} fill="#7d858e" stroke={INK} strokeWidth={0.6} />
      <rect x={9} y={7} width={6} height={2.4} fill={c} />
      <path d="M9 14 L12 18 L15 14 Z" fill="#3b4047" />
      <path d="M5 16 Q4 14 5 12 M19 16 Q20 14 19 12" stroke={c} strokeWidth={0.8} fill="none" />
    </>
  ),
  twister: (c) => (
    <>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <ellipse key={i} cx={12 + Math.sin(i) * 1.2} cy={4 + i * 3} rx={9 - i * 1.4} ry={1.4} fill="none" stroke={c} strokeWidth={1.1} />
      ))}
      <path d="M8 21 H16" stroke={c} strokeWidth={0.8} opacity={0.5} />
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
