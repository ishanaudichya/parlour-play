/* UNO card art — pure SVG, no assets. Chunky rounded cards with a thick white
   border, tilted white ellipse and big shadowed glyphs. */

import type { CSSProperties } from "react";
import type { UnoCard, UnoColor, UnoSymbol } from "@/lib/games/uno/types";

export const UNO_HEX: Record<UnoColor, string> = {
  red: "#ef5350",
  yellow: "#ffca28",
  green: "#66bb6a",
  blue: "#42a5f5",
};

export const WILD_HEX = "#1c1c23";

/** Deterministic decorative jitter (deg) per card id — no randomness in render. */
export function cardJitter(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (Math.abs(h) % 11) - 5;
}

/* ---------------- glyphs (centered at 0,0) ---------------- */

function SkipGlyph({ stroke, r, sw }: { stroke: string; r: number; sw: number }) {
  const d = r * 0.72;
  return (
    <g>
      <circle r={r} fill="none" stroke={stroke} strokeWidth={sw} />
      <line x1={-d} y1={-d} x2={d} y2={d} stroke={stroke} strokeWidth={sw} strokeLinecap="round" />
    </g>
  );
}

const ARROW = "-24,-7 6,-7 6,-17 26,0 6,17 6,7 -24,7";

function ReverseGlyph({ fill, scale }: { fill: string; scale: number }) {
  return (
    <g transform={`rotate(45) scale(${scale})`}>
      <g transform="translate(0 -14)">
        <polygon points={ARROW} fill={fill} />
      </g>
      <g transform="rotate(180) translate(0 -14)">
        <polygon points={ARROW} fill={fill} />
      </g>
    </g>
  );
}

function MiniCards2({ fill }: { fill: string }) {
  return (
    <g>
      <g transform="translate(-9 -7) rotate(-14)">
        <rect x="-16" y="-23" width="32" height="46" rx="6" fill="rgba(0,0,0,.25)" transform="translate(2.5 3.5)" />
        <rect x="-16" y="-23" width="32" height="46" rx="6" fill={fill} stroke="#fff" strokeWidth="3.5" />
      </g>
      <g transform="translate(10 8) rotate(11)">
        <rect x="-16" y="-23" width="32" height="46" rx="6" fill="rgba(0,0,0,.25)" transform="translate(2.5 3.5)" />
        <rect x="-16" y="-23" width="32" height="46" rx="6" fill={fill} stroke="#fff" strokeWidth="3.5" />
      </g>
    </g>
  );
}

/** Four-color pinwheel filling the tilted ellipse (for wilds). */
function Pinwheel({ scale = 1 }: { scale?: number }) {
  return (
    <g transform={`translate(60 90) rotate(-32) scale(${scale})`}>
      <path d="M0 0 L42 0 A42 66 0 0 0 0 -66 Z" fill={UNO_HEX.red} />
      <path d="M0 0 L0 -66 A42 66 0 0 0 -42 0 Z" fill={UNO_HEX.blue} />
      <path d="M0 0 L-42 0 A42 66 0 0 0 0 66 Z" fill={UNO_HEX.yellow} />
      <path d="M0 0 L0 66 A42 66 0 0 0 42 0 Z" fill={UNO_HEX.green} />
      <ellipse rx="42" ry="66" fill="none" stroke="#fff" strokeWidth="3.5" />
    </g>
  );
}

function CornerText({ text }: { text: string }) {
  return (
    <g>
      <text
        x="1.5"
        y="2"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="26"
        fontWeight="800"
        fill="rgba(0,0,0,.35)"
      >
        {text}
      </text>
      <text textAnchor="middle" dominantBaseline="central" fontSize="26" fontWeight="800" fill="#fff">
        {text}
      </text>
    </g>
  );
}

function Corner({ symbol }: { symbol: UnoSymbol }) {
  switch (symbol) {
    case "skip":
      return <SkipGlyph stroke="#fff" r={10} sw={4.5} />;
    case "reverse":
      return <ReverseGlyph fill="#fff" scale={0.34} />;
    case "draw2":
      return <CornerText text="+2" />;
    case "wild4":
      return <CornerText text="+4" />;
    case "wild":
      return (
        <g>
          <rect x="-8.5" y="-8.5" width="8" height="8" rx="2" fill={UNO_HEX.red} />
          <rect x="0.5" y="-8.5" width="8" height="8" rx="2" fill={UNO_HEX.blue} />
          <rect x="-8.5" y="0.5" width="8" height="8" rx="2" fill={UNO_HEX.yellow} />
          <rect x="0.5" y="0.5" width="8" height="8" rx="2" fill={UNO_HEX.green} />
        </g>
      );
    default:
      return <CornerText text={symbol} />;
  }
}

function Center({ symbol, hex }: { symbol: UnoSymbol; hex: string }) {
  switch (symbol) {
    case "skip":
      return (
        <g transform="translate(60 90)">
          <g transform="translate(2.5 3.5)" opacity="0.22">
            <SkipGlyph stroke="#000" r={28} sw={11} />
          </g>
          <SkipGlyph stroke={hex} r={28} sw={11} />
        </g>
      );
    case "reverse":
      return (
        <g transform="translate(60 90)">
          <g transform="translate(2.5 3.5)" opacity="0.22">
            <ReverseGlyph fill="#000" scale={0.95} />
          </g>
          <ReverseGlyph fill={hex} scale={0.95} />
        </g>
      );
    case "draw2":
      return (
        <g transform="translate(60 90)">
          <MiniCards2 fill={hex} />
        </g>
      );
    case "wild":
      return null; // the pinwheel itself is the motif
    case "wild4":
      return (
        <g transform="translate(60 90)">
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="46"
            fontWeight="800"
            fill="#fff"
            stroke="#15151a"
            strokeWidth="7"
            paintOrder="stroke"
          >
            +4
          </text>
        </g>
      );
    default:
      return (
        <g transform="translate(60 90)">
          <text
            x="3"
            y="4"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="74"
            fontWeight="800"
            fill="rgba(0,0,0,.3)"
          >
            {symbol}
          </text>
          <text textAnchor="middle" dominantBaseline="central" fontSize="74" fontWeight="800" fill={hex}>
            {symbol}
          </text>
        </g>
      );
  }
}

/* ---------------- cards ---------------- */

export function CardFace({
  card,
  w = 88,
  className,
  style,
}: {
  card: UnoCard;
  w?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const wild = card.color === null;
  const hex = wild ? WILD_HEX : UNO_HEX[card.color!];
  return (
    <svg
      viewBox="0 0 120 180"
      width={w}
      height={w * 1.5}
      className={className}
      style={style}
      aria-label={`${card.color ?? "wild"} ${card.symbol}`}
      role="img"
    >
      <rect x="1.5" y="1.5" width="117" height="177" rx="16" fill="#fff" />
      <rect x="9" y="9" width="102" height="162" rx="10" fill={hex} />
      {wild ? (
        <Pinwheel scale={card.symbol === "wild4" ? 0.88 : 1} />
      ) : (
        <g>
          <ellipse cx="63" cy="94" rx="42" ry="66" fill="rgba(0,0,0,.25)" transform="rotate(-32 63 94)" />
          <ellipse cx="60" cy="90" rx="42" ry="66" fill="#fff" transform="rotate(-32 60 90)" />
        </g>
      )}
      <Center symbol={card.symbol} hex={hex} />
      <g transform="translate(25 32)">
        <Corner symbol={card.symbol} />
      </g>
      <g transform="translate(95 148) rotate(180)">
        <Corner symbol={card.symbol} />
      </g>
      <rect x="9" y="9" width="102" height="162" rx="10" fill="none" stroke="rgba(0,0,0,.14)" strokeWidth="2" />
    </svg>
  );
}

export function CardBack({
  w = 88,
  className,
  style,
}: {
  w?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 120 180"
      width={w}
      height={w * 1.5}
      className={className}
      style={style}
      aria-label="card back"
      role="img"
    >
      <rect x="1.5" y="1.5" width="117" height="177" rx="16" fill="#fff" />
      <rect x="9" y="9" width="102" height="162" rx="10" fill="#17171d" />
      <ellipse cx="60" cy="90" rx="43" ry="67" fill="#d3372f" transform="rotate(-32 60 90)" />
      <text
        x="60"
        y="90"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="42"
        fontWeight="800"
        fill="#ffca28"
        stroke="#17171d"
        strokeWidth="6"
        paintOrder="stroke"
        transform="rotate(-10 60 90)"
      >
        UNO
      </text>
      <rect x="9" y="9" width="102" height="162" rx="10" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2" />
    </svg>
  );
}
