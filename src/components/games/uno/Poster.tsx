"use client";

/* UNO poster tile for the game picker — neon arcade, self-contained. */

import { Baloo_2 } from "next/font/google";
import type { UnoCard } from "@/lib/games/uno/types";
import { CardFace, UNO_HEX } from "./cards";

const baloo = Baloo_2({ subsets: ["latin"], weight: ["700", "800"] });

const FAN: { card: UnoCard; rot: number; x: number; y: number }[] = [
  { card: { id: "poster-r7", color: "red", symbol: "7" }, rot: -18, x: -44, y: 8 },
  { card: { id: "poster-wild", color: null, symbol: "wild" }, rot: 0, x: 0, y: -2 },
  { card: { id: "poster-b2", color: "blue", symbol: "draw2" }, rot: 18, x: 44, y: 8 },
];

export function UnoPoster() {
  return (
    <div
      className={`${baloo.className} relative h-full min-h-[150px] w-full select-none overflow-hidden rounded-2xl border-[3px] border-white/10 bg-[#141418]`}
    >
      {/* corner glows */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `radial-gradient(70% 60% at 12% 0%, ${UNO_HEX.red}33, transparent 60%), radial-gradient(70% 60% at 88% 100%, ${UNO_HEX.blue}30, transparent 60%), radial-gradient(50% 45% at 90% 5%, ${UNO_HEX.yellow}22, transparent 60%)`,
        }}
      />

      {/* fanned cards */}
      <div className="absolute left-1/2 top-[46%] -translate-x-1/2 -translate-y-1/2">
        {FAN.map(({ card, rot, x, y }) => (
          <div
            key={card.id}
            className="absolute left-1/2 top-1/2"
            style={{
              transform: `translate(-50%, -50%) translate(${x}px, ${y}px) rotate(${rot}deg)`,
              filter: "drop-shadow(0 6px 14px rgba(0,0,0,.5))",
            }}
          >
            <CardFace card={card} w={62} />
          </div>
        ))}
      </div>

      {/* wordmark */}
      <div className="absolute inset-x-0 bottom-2.5 flex flex-col items-center gap-0.5">
        <div className="flex items-baseline text-2xl font-extrabold tracking-tight" style={{ textShadow: "0 2px 10px rgba(0,0,0,.8)" }}>
          <span style={{ color: UNO_HEX.red }}>U</span>
          <span style={{ color: UNO_HEX.yellow }}>N</span>
          <span style={{ color: UNO_HEX.blue }}>O</span>
        </div>
        <div className="text-[9px] font-bold uppercase tracking-[0.34em] text-white/45">
          Match &middot; Shout &middot; Win
        </div>
      </div>
    </div>
  );
}
