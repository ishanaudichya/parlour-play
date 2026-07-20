/* Game-picker poster for Teen Patti — midnight casino felt with a fanned
   pure sequence. Purely decorative and deterministic (no randomness). */

import { Marcellus } from "next/font/google";
import type { Card } from "@/lib/games/teenpatti/types";
import { CardFace } from "./PlayingCard";

const marcellus = Marcellus({ weight: "400", subsets: ["latin"], display: "swap" });

const POSTER_PATTERN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='48' height='48'%3E%3Cpath d='M24 4 L44 24 L24 44 L4 24 Z' fill='none' stroke='%23c9a961' stroke-opacity='0.07'/%3E%3Cpath d='M24 14 L34 24 L24 34 L14 24 Z' fill='none' stroke='%23c9a961' stroke-opacity='0.05'/%3E%3C/svg%3E\")";

const FAN: { card: Card; rot: number; y: number }[] = [
  { card: { r: 14, s: "S" }, rot: -16, y: 6 },
  { card: { r: 13, s: "S" }, rot: 0, y: 0 },
  { card: { r: 12, s: "S" }, rot: 16, y: 6 },
];

export function TeenPattiPoster() {
  return (
    <div
      className={`${marcellus.className} relative flex h-full min-h-[190px] w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-[#c9a961]/45`}
      style={{
        background: "radial-gradient(ellipse at 50% 30%, #11543f 0%, #0d4a37 45%, #06251c 100%)",
      }}
    >
      <div className="absolute inset-0" style={{ backgroundImage: POSTER_PATTERN }} />
      <div
        className="pointer-events-none absolute inset-[7px] rounded-md border border-[#c9a961]/35"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-[11px] rounded border border-[#c9a961]/20"
        aria-hidden
      />
      {/* vignette */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ boxShadow: "inset 0 0 60px rgba(2,16,11,0.85)" }}
      />

      {/* fanned pure sequence */}
      <div className="relative flex items-end">
        {FAN.map(({ card, rot, y }) => (
          <div
            key={card.r}
            className="-mx-2 w-12 drop-shadow-[0_4px_6px_rgba(0,0,0,0.5)]"
            style={{ transform: `rotate(${rot}deg) translateY(${y}px)` }}
          >
            <CardFace card={card} className="w-full" />
          </div>
        ))}
      </div>

      <div className="relative mt-4 text-center">
        <div className="text-[17px] tracking-[0.42em] text-[#e9cf8e]">TEEN PATTI</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.3em] text-[#9db8a8]">
          Blind · Chaal · Show
        </div>
      </div>
    </div>
  );
}
