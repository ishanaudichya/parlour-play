"use client";

/* Table furniture: opponent chips, draw pile, discard stack, direction ring. */

import { motion } from "framer-motion";
import type { UnoCard, UnoColor, UnoLogEntry, UnoViewPlayer } from "@/lib/games/uno/types";
import { UNO_TURN_MS } from "@/lib/games/uno/types";
import { CardBack, CardFace, cardJitter, UNO_HEX } from "./cards";

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

const SEAT_HEX = ["#ef5350", "#42a5f5", "#66bb6a", "#ffca28", "#ab47bc", "#ff7043", "#26c6da", "#ec407a"];

export const seatHex = (seat: number) => SEAT_HEX[seat % SEAT_HEX.length];

export interface ChipFx {
  skip: UnoLogEntry | null;
  burst: UnoLogEntry | null;
  uno: UnoLogEntry | null;
}

export function OpponentChip({
  p,
  isTurn,
  turnPct,
  activeHex,
  fx,
}: {
  p: UnoViewPlayer;
  isTurn: boolean;
  /** 0..1 of the turn clock remaining (only used while it's their turn) */
  turnPct: number;
  activeHex: string;
  fx: ChipFx;
}) {
  const fan = Math.min(3, Math.max(1, p.cardCount));
  return (
    <motion.div
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="relative w-[88px] shrink-0"
    >
      <div
        className="relative flex flex-col items-center gap-1 overflow-hidden rounded-2xl border-[3px] bg-[#1c1c23] px-1.5 pb-2 pt-2 transition-[border-color,box-shadow,opacity,filter] duration-300"
        style={{
          borderColor: p.left ? "#26262e" : p.catchable ? "#ef5350" : isTurn ? activeHex : "#2b2b34",
          boxShadow: isTurn ? `0 0 18px ${activeHex}59` : undefined,
          animation: p.catchable && !p.left ? "uno-flash 0.9s ease-in-out infinite" : undefined,
          opacity: p.left ? 0.45 : 1,
          filter: p.left ? "grayscale(1)" : undefined,
        }}
      >
        <div
          className="grid h-9 w-9 place-items-center rounded-full text-[15px] font-extrabold text-[#141418]"
          style={{ background: seatHex(p.seat) }}
        >
          {p.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="w-full truncate text-center text-[11px] font-bold leading-tight text-white/85">{p.name}</div>
        {/* fanned mini card backs */}
        <div className="relative h-[38px] w-[52px]">
          {!p.left &&
            Array.from({ length: fan }, (_, i) => {
              const off = i - (fan - 1) / 2;
              return (
                <CardBack
                  key={i}
                  w={24}
                  className="absolute left-1/2 top-0"
                  style={{ transform: `translateX(-50%) translateX(${off * 10}px) rotate(${off * 14}deg)` }}
                />
              );
            })}
        </div>
        {/* their turn countdown sliver */}
        {isTurn && (
          <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.round(turnPct * 100)}%`,
                background: turnPct < 0.22 ? "#ef5350" : activeHex,
                transition: "width .2s linear",
              }}
            />
          </div>
        )}
      </div>

      {/* card count badge */}
      {!p.left && (
        <span
          className="absolute -right-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full border-2 border-[#141418] bg-white px-1 text-[11px] font-extrabold tabular-nums text-[#141418]"
          aria-label={`${p.cardCount} cards`}
        >
          {p.cardCount}
        </span>
      )}

      {/* left the table */}
      {p.left && (
        <span className="pointer-events-none absolute inset-0 z-10 grid place-items-center">
          <span className="-rotate-12 rounded-md border-2 border-white/25 bg-black/75 px-2 py-px text-[9px] font-extrabold uppercase tracking-[0.24em] text-white/70">
            Left
          </span>
        </span>
      )}

      {/* forgot to call UNO */}
      {p.catchable && !p.left && (
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#ef5350] px-2 py-px text-[9px] font-extrabold tracking-wider text-white">
          NO UNO!
        </span>
      )}

      {/* skip stamp bounce */}
      {fx.skip && !p.left && (
        <motion.div
          key={`skip-${fx.skip.i}`}
          className="pointer-events-none absolute inset-0 grid place-items-center"
          initial={{ scale: 2.2, opacity: 0, rotate: -20 }}
          animate={{ scale: [2.2, 0.9, 1.05, 1], opacity: [0, 1, 1, 0], rotate: -14 }}
          transition={{ duration: 1.6, times: [0, 0.25, 0.4, 1] }}
        >
          <svg viewBox="-20 -20 40 40" width={52} height={52}>
            <circle r={15} fill="none" stroke="#ef5350" strokeWidth={6} />
            <line x1={-10.5} y1={-10.5} x2={10.5} y2={10.5} stroke="#ef5350" strokeWidth={6} strokeLinecap="round" />
          </svg>
        </motion.div>
      )}

      {/* +2 / +4 / caught penalty burst */}
      {fx.burst && !p.left && (
        <motion.div
          key={`burst-${fx.burst.i}`}
          className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 text-xl font-extrabold"
          style={{ color: "#ef5350", textShadow: "0 2px 8px rgba(0,0,0,.8)" }}
          initial={{ scale: 0.4, opacity: 0, y: 6 }}
          animate={{ scale: [0.4, 1.6, 1.2], opacity: [0, 1, 0], y: -18 }}
          transition={{ duration: 1.5 }}
        >
          +{fx.burst.n ?? 2}
        </motion.div>
      )}

      {/* declared UNO */}
      {fx.uno && !fx.burst && !p.left && (
        <motion.div
          key={`uno-${fx.uno.i}`}
          className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-[#ffca28] px-2 py-px text-[11px] font-extrabold text-[#141418]"
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: [0.4, 1.3, 1], opacity: [0, 1, 0] }}
          transition={{ duration: 1.8 }}
        >
          UNO!
        </motion.div>
      )}
    </motion.div>
  );
}

export function DrawPile({
  count,
  canDraw,
  urge,
  onDraw,
  w,
}: {
  count: number;
  canDraw: boolean;
  /** drawing is the player's only option — pulse */
  urge: boolean;
  onDraw: () => void;
  w: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onDraw}
      disabled={!canDraw}
      whileTap={canDraw ? { scale: 0.94 } : undefined}
      className="relative select-none disabled:cursor-default"
      style={{ width: w + 10, height: w * 1.5 + 10 }}
      aria-label={`Draw pile, ${count} cards`}
    >
      {urge && (
        <span
          className="absolute -inset-1.5 rounded-2xl border-2 border-white/70"
          style={{ animation: "uno-flash 0.9s ease-in-out infinite" }}
        />
      )}
      <CardBack w={w} className="absolute left-0 top-2" style={{ transform: "rotate(-5deg)" }} />
      <CardBack w={w} className="absolute left-2 top-0" style={{ transform: "rotate(2deg)" }} />
      <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-white/15 bg-[#1c1c23] px-2 py-px text-[11px] font-bold tabular-nums text-white/80">
        {count}
      </span>
      {canDraw && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white px-2 py-px text-[9px] font-extrabold tracking-wider text-[#141418]">
          DRAW
        </span>
      )}
    </motion.button>
  );
}

export function DiscardStack({
  tail,
  activeColor,
  flyFrom,
  w,
}: {
  /** oldest→newest public discards (top last) */
  tail: UnoCard[];
  activeColor: UnoColor;
  /** where the top card animates in from */
  flyFrom: "you" | "them";
  w: number;
}) {
  const hex = UNO_HEX[activeColor];
  const top = tail[tail.length - 1];
  const under = tail.slice(0, -1);
  return (
    <div className="relative" style={{ width: w + 10, height: w * 1.5 + 10 }}>
      {/* active color glow */}
      <div
        className="pointer-events-none absolute inset-2 rounded-2xl transition-shadow duration-500"
        style={{ boxShadow: `0 0 44px 12px ${hex}66` }}
      />
      {/* color-change ripple */}
      <motion.div
        key={`ripple-${activeColor}-${top.id}`}
        className="pointer-events-none absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: hex }}
        initial={{ scale: 0.2, opacity: 0.55 }}
        animate={{ scale: 3.4, opacity: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      {under.map((c) => (
        <div key={c.id} className="absolute left-1 top-1" style={{ transform: `rotate(${cardJitter(c.id)}deg)` }}>
          <CardFace card={c} w={w} />
        </div>
      ))}
      <motion.div
        key={top.id}
        className="absolute left-1 top-1"
        initial={{
          y: flyFrom === "you" ? 150 : -150,
          rotate: flyFrom === "you" ? 32 : -32,
          scale: 0.65,
          opacity: 0,
        }}
        animate={{ y: 0, rotate: cardJitter(top.id), scale: 1, opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE }}
      >
        <CardFace card={top} w={w} />
      </motion.div>
    </div>
  );
}

export function DirectionRing({ direction, hex }: { direction: 1 | -1; hex: string }) {
  return (
    <div
      className="h-11 w-11"
      style={{
        animation: "uno-rot 7s linear infinite",
        animationDirection: direction === 1 ? "normal" : "reverse",
      }}
      aria-label={direction === 1 ? "play direction: forward" : "play direction: reversed"}
    >
      {/* keyed flip pop when direction changes */}
      <motion.div
        key={direction}
        initial={{ scale: 1.7, opacity: 0.4 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: EASE }}
      >
        <svg viewBox="-26 -26 52 52" width={44} height={44}>
          <path d="M -17 -7 A 18 18 0 0 1 15 -10" fill="none" stroke={hex} strokeWidth={5} strokeLinecap="round" />
          <polygon points="10,-20 24,-8 8,-2" fill={hex} />
          <path d="M 17 7 A 18 18 0 0 1 -15 10" fill="none" stroke={hex} strokeWidth={5} strokeLinecap="round" />
          <polygon points="-10,20 -24,8 -8,2" fill={hex} />
        </svg>
      </motion.div>
    </div>
  );
}

/** Countdown bar for the current turn. */
export function TurnClock({ deadline, serverNow, hex }: { deadline: number; serverNow: number; hex: string }) {
  const remaining = Math.max(0, Math.min(UNO_TURN_MS, deadline - serverNow));
  const pct = remaining / UNO_TURN_MS;
  const danger = remaining < 10_000;
  return (
    <div className="h-1.5 w-44 overflow-hidden rounded-full bg-white/10 sm:w-56">
      <div
        className="h-full rounded-full"
        style={{
          width: `${pct * 100}%`,
          background: danger ? "#ef5350" : hex,
          transition: "width .2s linear, background .4s",
          animation: danger ? "uno-flash 0.8s ease-in-out infinite" : undefined,
        }}
      />
    </div>
  );
}

export function turnPctOf(deadline: number, serverNow: number): number {
  return Math.max(0, Math.min(1, (deadline - serverNow) / UNO_TURN_MS));
}
