"use client";

import { useId } from "react";
import { CHARACTER_INFO } from "@/lib/games/coup/meta";
import type { Character } from "@/lib/games/coup/types";

/* Hand-drawn art-deco SVG card faces. Everything is code — no image assets. */

const GOLD = "#dcb975";
const GOLD_DIM = "#9a7a41";
const GOLD_BRIGHT = "#f6e9c8";
const PARCH = "#a89d84";

function polar(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  // round: trig results can differ by 1 ULP between server and client engines,
  // which serializes to different path strings and breaks hydration
  return [Number((cx + r * Math.cos(a)).toFixed(2)), Number((cy + r * Math.sin(a)).toFixed(2))];
}

function Sunburst({ color }: { color: string }) {
  const rays = [];
  for (let i = 0; i < 24; i++) {
    const a1 = i * 15 - 3;
    const a2 = i * 15 + 3;
    const [x1, y1] = polar(100, 125, 105, a1);
    const [x2, y2] = polar(100, 125, 105, a2);
    rays.push(<path key={i} d={`M100,125 L${x1},${y1} L${x2},${y2} Z`} fill={color} opacity={0.06} />);
  }
  return <g>{rays}</g>;
}

function CornerDeco() {
  const corner = (x: number, y: number, sx: number, sy: number) => (
    <g transform={`translate(${x},${y}) scale(${sx},${sy})`}>
      <path d="M0,14 L0,0 L14,0" fill="none" stroke={GOLD_DIM} strokeWidth="1.4" />
      <path d="M3,9 L3,3 L9,3" fill="none" stroke={GOLD_DIM} strokeWidth="0.8" opacity={0.7} />
      <path d="M5.5,5.5 l2.4,-2.4 2.4,2.4 -2.4,2.4 Z" fill={GOLD} opacity={0.9} />
    </g>
  );
  return (
    <g>
      {corner(16, 16, 1, 1)}
      {corner(184, 16, -1, 1)}
      {corner(16, 284, 1, -1)}
      {corner(184, 284, -1, -1)}
    </g>
  );
}

function Frame({ deep, color, id }: { deep: string; color: string; id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={deep} />
          <stop offset="55%" stopColor="#0d0a13" />
          <stop offset="100%" stopColor="#080609" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="50%" cy="42%" r="55%">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="1.5" y="1.5" width="197" height="297" rx="13" fill={`url(#${id}-bg)`} stroke={GOLD_DIM} strokeWidth="1.6" />
      <rect x="8" y="8" width="184" height="284" rx="8" fill="none" stroke={GOLD} strokeWidth="0.9" opacity="0.75" />
      <rect x="1.5" y="1.5" width="197" height="297" rx="13" fill={`url(#${id}-glow)`} />
    </>
  );
}

function NamePlate({ ch }: { ch: Character }) {
  const info = CHARACTER_INFO[ch];
  const name = info.name.toUpperCase();
  // fit long names (AMBASSADOR, CONTESSA…) inside the 132px plate
  const long = name.length > 7;
  return (
    <g>
      <line x1="34" y1="207" x2="166" y2="207" stroke={GOLD_DIM} strokeWidth="1" />
      <path d="M100,203 l4,4 -4,4 -4,-4 Z" fill={GOLD} />
      <line x1="34" y1="207" x2="88" y2="207" stroke={GOLD} strokeWidth="1" opacity="0.6" />
      <text
        x="100"
        y="238"
        textAnchor="middle"
        fontFamily="var(--font-cinzel), serif"
        fontWeight="700"
        fontSize={long ? 17 : 22}
        letterSpacing={long ? 1.5 : 4}
        fill={GOLD_BRIGHT}
        {...(name.length > 8 ? { textLength: 128, lengthAdjust: "spacingAndGlyphs" as const } : {})}
      >
        {name}
      </text>
      {info.power && (
        <text x="100" y="260" textAnchor="middle" fontFamily="var(--font-inter), sans-serif" fontSize="8.5" letterSpacing="1.6" fill={PARCH}>
          {info.power.toUpperCase()}
        </text>
      )}
      {info.counter && (
        <text x="100" y={info.power ? 274 : 260} textAnchor="middle" fontFamily="var(--font-inter), sans-serif" fontSize="8.5" letterSpacing="1.6" fill={PARCH} opacity="0.75">
          {info.counter.toUpperCase()}
        </text>
      )}
    </g>
  );
}

function EmblemRing({ color }: { color: string }) {
  return (
    <g>
      <circle cx="100" cy="125" r="64" fill="#0a0810" opacity="0.55" />
      <circle cx="100" cy="125" r="64" fill="none" stroke={GOLD} strokeWidth="1.2" opacity="0.9" />
      <circle cx="100" cy="125" r="59" fill="none" stroke={color} strokeWidth="0.8" opacity="0.55" />
      <path d="M100,57 l4.5,4.5 -4.5,4.5 -4.5,-4.5 Z" fill={GOLD} />
      <path d="M100,184 l4.5,4.5 -4.5,4.5 -4.5,-4.5 Z" fill={GOLD} />
    </g>
  );
}

/* ---------------- character emblems ---------------- */

function DukeEmblem({ color, bright }: { color: string; bright: string }) {
  return (
    <g>
      <path
        d="M68,142 L68,104 L84,122 L100,92 L116,122 L132,104 L132,142 Z"
        fill={color}
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="68" cy="99" r="4" fill={bright} stroke={GOLD} strokeWidth="1" />
      <circle cx="100" cy="87" r="4.5" fill={bright} stroke={GOLD} strokeWidth="1" />
      <circle cx="132" cy="99" r="4" fill={bright} stroke={GOLD} strokeWidth="1" />
      <rect x="64" y="142" width="72" height="9" rx="2" fill={GOLD_DIM} stroke={GOLD} strokeWidth="1" />
      <path d="M100,108 l6,10 -6,10 -6,-10 Z" fill={bright} opacity="0.95" />
      <rect x="76" y="156" width="48" height="5" rx="2.5" fill={GOLD_DIM} opacity="0.8" />
      <rect x="82" y="164" width="36" height="5" rx="2.5" fill={GOLD_DIM} opacity="0.55" />
    </g>
  );
}

function AssassinEmblem({ color, bright }: { color: string; bright: string }) {
  return (
    <g>
      <path d="M118,72 A46,46 0 1 0 118,178 A38,38 0 1 1 118,72 Z" fill={bright} opacity="0.1" />
      <circle cx="100" cy="64" r="5.5" fill={color} stroke={GOLD} strokeWidth="1.2" />
      <rect x="96" y="69" width="8" height="13" rx="2.5" fill={color} stroke={GOLD} strokeWidth="1" />
      <rect x="82" y="82" width="36" height="6.5" rx="3" fill={GOLD_DIM} stroke={GOLD} strokeWidth="1" />
      <path d="M100,158 L91,96 L91,89 L109,89 L109,96 Z" fill={color} stroke={GOLD} strokeWidth="1.4" strokeLinejoin="round" />
      <line x1="100" y1="92" x2="100" y2="146" stroke="#0a0810" strokeWidth="1.6" opacity="0.7" />
      <path d="M100,158 L96,132 L100,138 L104,132 Z" fill={bright} opacity="0.55" />
    </g>
  );
}

function CaptainEmblem({ color, bright }: { color: string; bright: string }) {
  return (
    <g fill="none" stroke={color} strokeWidth="5" strokeLinecap="round">
      <circle cx="100" cy="80" r="8" strokeWidth="4.5" stroke={GOLD} fill="none" />
      <line x1="100" y1="88" x2="100" y2="146" />
      <line x1="78" y1="106" x2="122" y2="106" strokeWidth="4.5" />
      <path d="M100,146 C82,146 68,134 66,118" />
      <path d="M100,146 C118,146 132,134 134,118" />
      <path d="M59,126 L66,113 L75,124" strokeWidth="4" stroke={GOLD} />
      <path d="M141,126 L134,113 L125,124" strokeWidth="4" stroke={GOLD} />
      <path d="M62,164 q9,-7 19,0 t19,0 t19,0 t19,0" stroke={bright} strokeWidth="2.2" opacity="0.8" />
      <path d="M70,174 q9,-7 19,0 t19,0 t19,0" stroke={bright} strokeWidth="2" opacity="0.45" />
    </g>
  );
}

function AmbassadorEmblem({ color, bright }: { color: string; bright: string }) {
  const leaf = (x: number, y: number, rot: number, flip = 1) => (
    <ellipse
      cx={x}
      cy={y}
      rx="9"
      ry="3.6"
      transform={`rotate(${rot * flip} ${x} ${y})`}
      fill={color}
      stroke={GOLD}
      strokeWidth="0.7"
    />
  );
  return (
    <g>
      <path d="M74,158 C58,138 58,106 74,86" fill="none" stroke={GOLD_DIM} strokeWidth="2" />
      <path d="M126,158 C142,138 142,106 126,86" fill="none" stroke={GOLD_DIM} strokeWidth="2" />
      {leaf(70, 148, -38)}
      {leaf(63, 128, -12)}
      {leaf(63, 106, 14)}
      {leaf(71, 89, 40)}
      {leaf(130, 148, 38)}
      {leaf(137, 128, 12)}
      {leaf(137, 106, -14)}
      {leaf(129, 89, -40)}
      <path d="M100,88 L128,120 L100,152 L72,120 Z" fill="none" stroke={GOLD} strokeWidth="1.6" />
      <path d="M100,98 L120,120 L100,142 L80,120 Z" fill={color} stroke={GOLD} strokeWidth="1" />
      <path d="M100,110 l9,10 -9,10 -9,-10 Z" fill={bright} />
    </g>
  );
}

function ContessaEmblem({ color, bright }: { color: string; bright: string }) {
  const wedges = [];
  const cx = 100;
  const cy = 150;
  const R = 58;
  for (let i = 0; i < 6; i++) {
    const a1 = -63 + i * 21;
    const a2 = a1 + 21;
    const [x1, y1] = polar(cx, cy, R, a1);
    const [x2, y2] = polar(cx, cy, R, a2);
    wedges.push(
      <path
        key={i}
        d={`M${cx},${cy} L${x1},${y1} A${R},${R} 0 0 1 ${x2},${y2} Z`}
        fill={i % 2 === 0 ? color : bright}
        opacity={i % 2 === 0 ? 0.85 : 0.32}
        stroke={GOLD}
        strokeWidth="0.9"
      />
    );
  }
  const spokes = [];
  for (let i = 0; i <= 6; i++) {
    const [x, y] = polar(cx, cy, R, -63 + i * 21);
    spokes.push(<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={GOLD_DIM} strokeWidth="1" opacity="0.8" />);
  }
  return (
    <g>
      <g>{wedges}</g>
      {spokes}
      <circle cx={cx} cy={cy} r="7.5" fill={color} stroke={GOLD} strokeWidth="1.4" />
      <circle cx={cx} cy={cy} r="3" fill={bright} />
      <circle cx={cx} cy="86" r="4" fill={bright} opacity="0.9" />
      <path d="M100,74 l3.5,8 -3.5,8 -3.5,-8 Z" fill={GOLD} opacity="0.9" />
    </g>
  );
}

const EMBLEMS: Record<Character, (p: { color: string; bright: string }) => React.ReactNode> = {
  duke: DukeEmblem,
  assassin: AssassinEmblem,
  captain: CaptainEmblem,
  ambassador: AmbassadorEmblem,
  contessa: ContessaEmblem,
};

export function CardFace({ ch, className }: { ch: Character; className?: string }) {
  const id = useId().replace(/[:]/g, "");
  const info = CHARACTER_INFO[ch];
  const Emblem = EMBLEMS[ch];
  return (
    <svg viewBox="0 0 200 300" className={className} role="img" aria-label={info.name}>
      <Frame deep={info.deep} color={info.color} id={id} />
      <Sunburst color={info.bright} />
      <CornerDeco />
      <EmblemRing color={info.color} />
      <Emblem color={info.color} bright={info.bright} />
      <NamePlate ch={ch} />
    </svg>
  );
}

export function CardBack({ className }: { className?: string }) {
  const id = useId().replace(/[:]/g, "");
  return (
    <svg viewBox="0 0 200 300" className={className} role="img" aria-label="Face-down card">
      <defs>
        <linearGradient id={`${id}-bbg`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c1527" />
          <stop offset="100%" stopColor="#0a0810" />
        </linearGradient>
        <pattern id={`${id}-dia`} width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M11,3 l5,8 -5,8 -5,-8 Z" fill="none" stroke="#c69f58" strokeWidth="0.6" opacity="0.16" />
        </pattern>
      </defs>
      <rect x="1.5" y="1.5" width="197" height="297" rx="13" fill={`url(#${id}-bbg)`} stroke={GOLD_DIM} strokeWidth="1.6" />
      <rect x="8" y="8" width="184" height="284" rx="8" fill={`url(#${id}-dia)`} stroke={GOLD} strokeWidth="0.9" opacity="0.9" />
      <CornerDeco />
      <circle cx="100" cy="150" r="52" fill="#0a0810" opacity="0.7" />
      <circle cx="100" cy="150" r="52" fill="none" stroke={GOLD} strokeWidth="1.2" />
      <circle cx="100" cy="150" r="46" fill="none" stroke={GOLD_DIM} strokeWidth="0.8" />
      <Sunburst color={GOLD} />
      <text
        x="100"
        y="169"
        textAnchor="middle"
        fontFamily="var(--font-cinzel), serif"
        fontWeight="900"
        fontSize="56"
        fill={GOLD}
      >
        C
      </text>
      <path d="M100,90 l5,6 -5,6 -5,-6 Z" fill={GOLD} />
      <path d="M100,198 l5,6 -5,6 -5,-6 Z" fill={GOLD} />
    </svg>
  );
}
