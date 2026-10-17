"use client";

/* Bluff's cards, painted like a truck's tailgate. Faces are cream panels with
   an enamel border, the index in brush lettering and one big painted pip (the
   court cards get a gold medallion). Backs are rani pink with marigold
   chevrons and the evil eye — every face-down card is watching you. */

import { memo } from "react";
import { rankLabel } from "@/lib/games/bluff/engine";
import type { Card, Suit } from "@/lib/games/bluff/types";
import { paint } from "./font";
import { CREAM, CREAM_EDGE, ENAMELS, GOLD, INK, MARIGOLD, PINK, suitPaint, TEAL } from "./palette";

export const CARD_ASPECT = 1.4;

const PIPS: Record<Suit, React.ReactNode> = {
  H: <path d="M50 88C20 65 4 48 4 30 4 15 16 5 29 5c10 0 17 6 21 14 4-8 11-14 21-14 13 0 25 10 25 25 0 18-16 35-46 58Z" />,
  D: <path d="M50 3 88 50 50 97 12 50Z" />,
  S: <path d="M50 4C30 29 6 43 6 61c0 14 11 23 23 23 9 0 16-5 19-11-1 10-5 18-12 22h28c-7-4-11-12-12-22 3 6 10 11 19 11 12 0 23-9 23-23 0-18-24-32-44-57Z" />,
  C: (
    <>
      <circle cx="50" cy="27" r="19" />
      <circle cx="27" cy="57" r="19" />
      <circle cx="73" cy="57" r="19" />
      <path d="M45 52c0 22-4 33-12 43h34c-8-10-12-21-12-43Z" />
    </>
  ),
};

/** A suit pip, `size` px square. */
export function Pip({ s, size, color }: { s: Suit; size: number; color?: string }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} fill={color ?? suitPaint(s)} aria-hidden className="shrink-0">
      {PIPS[s]}
    </svg>
  );
}

const SUIT_NAME: Record<Suit, string> = { S: "spades", H: "hearts", D: "diamonds", C: "clubs" };

export const CardFace = memo(function CardFace({ card, w }: { card: Card; w: number }) {
  const c = suitPaint(card.s);
  const label = rankLabel(card.r);
  const court = card.r >= 11;
  return (
    <svg viewBox="0 0 100 140" width={w} height={w * CARD_ASPECT} className="block" role="img" aria-label={`${label} of ${SUIT_NAME[card.s]}`}>
      <rect x="1" y="1" width="98" height="138" rx="9" fill={CREAM} stroke={CREAM_EDGE} strokeWidth="1.5" />
      <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke={c} strokeWidth="1.8" />
      <rect x="9" y="9" width="82" height="122" rx="4" fill="none" stroke={GOLD} strokeWidth="0.9" />
      {[[9, 9], [91, 9], [9, 131], [91, 131]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2.4" fill={ENAMELS[(card.r + i) % ENAMELS.length]} stroke={INK} strokeWidth="0.6" />
      ))}
      <g fill={c} className={paint.className}>
        <text x="17" y="31" fontSize={label === "10" ? 19 : 23} textAnchor="middle">
          {label}
        </text>
        <g transform="translate(10 35) scale(0.14)">{PIPS[card.s]}</g>
        <g transform="rotate(180 50 70)">
          <text x="17" y="31" fontSize={label === "10" ? 19 : 23} textAnchor="middle">
            {label}
          </text>
          <g transform="translate(10 35) scale(0.14)">{PIPS[card.s]}</g>
        </g>
      </g>
      {court ? (
        <g>
          <circle cx="50" cy="70" r="27" fill={GOLD} stroke={INK} strokeWidth="1.4" />
          <circle cx="50" cy="70" r="22" fill={CREAM} stroke={c} strokeWidth="1.2" />
          <text x="50" y="80" fontSize="30" textAnchor="middle" fill={c} className={paint.className}>
            {label}
          </text>
          <g transform="translate(43 44) scale(0.14)" fill={c}>
            {PIPS[card.s]}
          </g>
        </g>
      ) : (
        <g transform={card.r === 1 ? "translate(22 42) scale(0.56)" : "translate(29 49) scale(0.42)"} fill={c} stroke={INK} strokeWidth={card.r === 1 ? 2.5 : 0}>
          {PIPS[card.s]}
        </g>
      )}
    </svg>
  );
});

export const CardBack = memo(function CardBack({ w }: { w: number }) {
  const zig = (y: number) => `M14 ${y}${Array.from({ length: 9 }, (_, i) => ` L${14 + (i + 0.5) * 8} ${y + (i % 2 ? 0 : 5)}`).join("")} L86 ${y}`;
  return (
    <svg viewBox="0 0 100 140" width={w} height={w * CARD_ASPECT} className="block" aria-hidden>
      <rect x="1" y="1" width="98" height="138" rx="9" fill={PINK} stroke={INK} strokeWidth="1.5" />
      <rect x="6" y="6" width="88" height="128" rx="6" fill="none" stroke={CREAM} strokeWidth="2.4" />
      <rect x="10" y="10" width="80" height="120" rx="4" fill="none" stroke={MARIGOLD} strokeWidth="1" />
      <g fill="none" stroke={MARIGOLD} strokeWidth="2" strokeLinejoin="round">
        <path d={zig(16)} />
        <path d={zig(26)} />
        <path d={zig(109)} />
        <path d={zig(119)} />
      </g>
      {/* the evil eye */}
      <path d="M18 70Q50 38 82 70Q50 102 18 70Z" fill={CREAM} stroke={INK} strokeWidth="2.2" />
      <circle cx="50" cy="70" r="12.5" fill={TEAL} stroke={INK} strokeWidth="1.6" />
      <circle cx="50" cy="70" r="5.5" fill={INK} />
      <circle cx="46" cy="66" r="2.2" fill={CREAM} />
      <g stroke={INK} strokeWidth="2" strokeLinecap="round">
        {[-30, -15, 0, 15, 30].map((x) => (
          <line key={x} x1={50 + x} y1={70 - 22 + Math.abs(x) * 0.35} x2={50 + x * 1.18} y2={70 - 30 + Math.abs(x) * 0.42} />
        ))}
      </g>
      <circle cx="50" cy="104" r="3" fill={GOLD} stroke={INK} strokeWidth="0.8" />
      <circle cx="40" cy="104" r="2" fill={CREAM} />
      <circle cx="60" cy="104" r="2" fill={CREAM} />
    </svg>
  );
});
