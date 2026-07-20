"use client";

/* Classic white-faced playing cards + maroon filigree backs, all SVG/CSS —
   no assets. Sized by the parent (give the wrapper a width; aspect is 5/7). */

import { motion } from "framer-motion";
import type { Card } from "@/lib/games/teenpatti/types";

const SUIT_CHAR: Record<Card["s"], string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const FACE: Record<number, string> = { 11: "J", 12: "Q", 13: "K", 14: "A" };
const rankStr = (r: number) => FACE[r] ?? String(r);
const suitColor = (s: Card["s"]) => (s === "H" || s === "D" ? "#b8232f" : "#1f1f28");

export function CardFace({ card, className }: { card: Card; className?: string }) {
  const col = suitColor(card.s);
  const r = rankStr(card.r);
  const suit = SUIT_CHAR[card.s];
  const corner = (
    <>
      <text x="5" y="13.5" fontSize={r === "10" ? 8.6 : 10.5} fontWeight="700" fill={col}>
        {r}
      </text>
      <text x="5" y="23" fontSize="8.5" fill={col}>
        {suit}
      </text>
    </>
  );
  return (
    <svg viewBox="0 0 50 70" className={className} role="img" aria-label={`${r} of ${suit}`}>
      <rect x="0.75" y="0.75" width="48.5" height="68.5" rx="5" fill="#faf6ec" stroke="#d8cfb8" strokeWidth="1.5" />
      {corner}
      <g transform="rotate(180 25 35)">{corner}</g>
      <text x="25" y="37" fontSize="25" fill={col} textAnchor="middle" dominantBaseline="central">
        {suit}
      </text>
    </svg>
  );
}

export function CardBack({ className, dim }: { className?: string; dim?: boolean }) {
  return (
    <div
      aria-hidden
      className={`aspect-[5/7] w-full rounded-[9%] border border-[#3f101b] bg-[#6e1f2e] p-[7%] shadow-[0_1px_3px_rgba(0,0,0,0.45)] ${
        dim ? "opacity-50 saturate-0" : ""
      } ${className ?? ""}`}
    >
      <div
        className="flex h-full w-full items-center justify-center rounded-[7%] border border-[#c9a961]/75"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent 0 3px, rgba(201,169,97,0.20) 3px 4px), repeating-linear-gradient(-45deg, transparent 0 3px, rgba(201,169,97,0.14) 3px 4px)",
        }}
      >
        <div className="aspect-square w-[30%] rotate-45 border border-[#c9a961]/80 bg-[#5a1826]" />
      </div>
    </div>
  );
}

/** 3D flip between back and face. Give the wrapper a width via className. */
export function FlipCard({
  card,
  faceUp,
  delay = 0,
  className,
  dim,
}: {
  card: Card | null;
  faceUp: boolean;
  delay?: number;
  className?: string;
  dim?: boolean;
}) {
  return (
    <div className={`relative aspect-[5/7] ${className ?? ""}`} style={{ perspective: 600 }}>
      <motion.div
        className="relative h-full w-full"
        initial={false}
        animate={{ rotateY: faceUp && card ? 180 : 0 }}
        transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <div className="absolute inset-0" style={{ backfaceVisibility: "hidden" }}>
          <CardBack dim={dim} />
        </div>
        <div
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
        >
          {card && (
            <CardFace card={card} className={`h-full w-full ${dim ? "opacity-60 saturate-50" : ""}`} />
          )}
        </div>
      </motion.div>
    </div>
  );
}
