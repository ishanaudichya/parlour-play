"use client";

/* A gold-rimmed avatar puck: initials medallion, chip count, BLIND/SEEN badge,
   dealer button, mini card fan, and a countdown arc while on turn. */

import { motion } from "framer-motion";
import type { TPViewPlayer } from "@/lib/games/teenpatti/types";
import { CardBack } from "./PlayingCard";
import { ChipSvg } from "./Chips";

const GOLD = "#c9a961";

/** Deterministic hue from the player's identity (no Math.random in render). */
function hueOf(str: string): number {
  let h = 7;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) % 360;
  return h;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  const s = parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2);
  return s.toUpperCase();
}

const ARC_R = 35;
const ARC_C = 2 * Math.PI * ARC_R;

export function PlayerPuck({
  p,
  isDealer,
  isTurn,
  frac,
  isWinner,
  isYou,
}: {
  p: TPViewPlayer;
  isDealer: boolean;
  isTurn: boolean;
  /** remaining fraction of the turn timer, 0..1 (null = no arc) */
  frac: number | null;
  isWinner: boolean;
  isYou?: boolean;
}) {
  const out = p.left || p.busted || !p.inHand;
  const hue = hueOf(p.id + p.name);
  const badge = p.left
    ? { text: "LEFT", cls: "border-[#3a4a42] bg-[#0a1410] text-[#5c6e64]" }
    : p.busted
      ? { text: "BUSTED", cls: "border-[#5c1a26] bg-[#2a0d13] text-[#c96a6a]" }
      : !p.inHand
        ? { text: "SITTING", cls: "border-[#4a5a50]/60 bg-[#0a1f18] text-[#8fa396]" }
      : p.folded
        ? { text: "FOLDED", cls: "border-[#4a5a50]/60 bg-[#0a1f18] text-[#8fa396]" }
        : p.allIn
          ? { text: "ALL-IN", cls: "border-[#c9a961] bg-[#3a2c10] text-[#e9cf8e]" }
          : p.seen
            ? { text: "SEEN", cls: "border-[#c9a961]/50 bg-[#123328] text-[#c9a961]" }
            : { text: "BLIND", cls: "border-[#7ea0c2]/50 bg-[#101c2a] text-[#9fc0e0]" };

  return (
    <div className="relative flex w-[86px] select-none flex-col items-center">
      <div className="relative h-[62px] w-[62px]">
        {/* countdown arc */}
        {isTurn && frac !== null && (
          <svg
            viewBox="0 0 78 78"
            className="pointer-events-none absolute -inset-[8px] h-[78px] w-[78px]"
            aria-hidden
          >
            <circle cx="39" cy="39" r={ARC_R} fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="3.5" />
            <circle
              cx="39"
              cy="39"
              r={ARC_R}
              fill="none"
              stroke={frac < 0.25 ? "#e0483e" : GOLD}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={String(ARC_C)}
              strokeDashoffset={String(ARC_C * (1 - Math.max(0, Math.min(1, frac))))}
              transform="rotate(-90 39 39)"
              className="transition-[stroke-dashoffset,stroke] duration-300 ease-linear"
            />
          </svg>
        )}

        {/* medallion */}
        <motion.div
          className={`flex h-full w-full items-center justify-center rounded-full border-2 text-[19px] tracking-wide ${
            p.folded || out ? "opacity-55 saturate-50" : ""
          }`}
          style={{
            borderColor: isTurn ? GOLD : `${GOLD}${out ? "33" : "88"}`,
            background: `radial-gradient(circle at 35% 28%, hsl(${hue} 38% 42%), hsl(${hue} 44% 15%))`,
            color: "#f4ecd8",
            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}
          animate={
            isWinner
              ? { boxShadow: ["0 0 0px rgba(201,169,97,0)", "0 0 26px rgba(201,169,97,0.75)", "0 0 8px rgba(201,169,97,0.35)"] }
              : { boxShadow: "0 3px 12px rgba(0,0,0,0.55)" }
          }
          transition={isWinner ? { duration: 1.1, repeat: Infinity, repeatType: "mirror" } : { duration: 0.3 }}
        >
          {initialsOf(p.name)}
        </motion.div>

        {/* dealer button */}
        {isDealer && (
          <span
            className="absolute -right-1.5 -top-1 flex h-[19px] w-[19px] items-center justify-center rounded-full border border-[#8a7333] bg-[#e9d9ae] text-[10px] font-bold text-[#4a3a10] shadow"
            title="Dealer"
          >
            D
          </span>
        )}

        {/* mini card fan */}
        {p.inHand && (
          <motion.div
            className="absolute -bottom-3.5 left-1/2 flex -translate-x-1/2"
            initial={false}
            animate={p.folded ? { opacity: 0.4, y: 8, scale: 0.9 } : { opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4 }}
          >
            {[-16, 0, 16].map((rot) => (
              <div key={rot} className="-mx-[4px] w-[15px]" style={{ transform: `rotate(${rot}deg)` }}>
                <CardBack dim={p.folded} />
              </div>
            ))}
          </motion.div>
        )}
      </div>

      {/* name + chips */}
      <div
        className={`mt-3.5 max-w-full truncate text-[11px] tracking-[0.08em] ${
          isTurn ? "text-[#e9cf8e]" : out ? "text-[#748a7e]" : "text-[#d9cfae]"
        }`}
      >
        {p.name}
        {isYou ? " (you)" : ""}
      </div>
      <div className="flex items-center gap-1 text-[11px] text-[#c9a961]">
        <ChipSvg denom={5} className="w-[11px]" />
        <span>{p.chips}</span>
      </div>

      {/* status badge */}
      <span
        className={`mt-0.5 rounded-full border px-1.5 py-px text-[8px] font-semibold tracking-[0.18em] ${badge.cls}`}
      >
        {badge.text}
      </span>
    </div>
  );
}
