"use client";

/* Overlays: wild color picker, drawn-card prompt, rules modal, game-over. */

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import type { PartyView } from "@/lib/party/types";
import { UNO_COLORS, type UnoCard, type UnoColor, type UnoView } from "@/lib/games/uno/types";
import { CardFace, UNO_HEX } from "./cards";
import { EASE, seatHex } from "./table";

function hashN(s: string, mod: number): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % mod;
}

function Backdrop({ children, onClose, z = "z-40" }: { children: ReactNode; onClose?: () => void; z?: string }) {
  return (
    <motion.div
      className={`fixed inset-0 ${z} flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      {children}
    </motion.div>
  );
}

const COLOR_LABEL: Record<UnoColor, string> = { red: "Red", yellow: "Yellow", green: "Green", blue: "Blue" };

export function ColorPicker({
  open,
  onPick,
  onCancel,
}: {
  open: boolean;
  onPick: (c: UnoColor) => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <Backdrop onClose={onCancel}>
          <motion.div
            className="w-full max-w-xs rounded-3xl border-4 border-white/10 bg-[#1b1b22] p-5"
            initial={{ scale: 0.85, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 text-center text-sm font-extrabold uppercase tracking-[0.2em] text-white/80">
              Pick a color
            </div>
            <div className="grid grid-cols-2 gap-3">
              {UNO_COLORS.map((c) => (
                <motion.button
                  key={c}
                  type="button"
                  whileTap={{ scale: 0.93 }}
                  onClick={() => onPick(c)}
                  className="flex h-20 items-end justify-start rounded-2xl border-4 border-white/25 p-2 text-[13px] font-extrabold text-[#141418]"
                  style={{ background: UNO_HEX[c], boxShadow: `0 0 26px ${UNO_HEX[c]}55` }}
                >
                  {COLOR_LABEL[c]}
                </motion.button>
              ))}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="mt-4 w-full rounded-xl border-2 border-white/10 py-2 text-xs font-bold uppercase tracking-widest text-white/60 transition-colors hover:text-white"
            >
              Cancel
            </button>
          </motion.div>
        </Backdrop>
      )}
    </AnimatePresence>
  );
}

export function DrawnPrompt({
  card,
  onPlay,
  onKeep,
}: {
  card: UnoCard;
  onPlay: () => void;
  onKeep: () => void;
}) {
  return (
    <motion.div
      className="mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl border-[3px] border-white/15 bg-[#1d1d25] py-2 pl-2 pr-3"
      initial={{ y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 16, opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
    >
      <CardFace card={card} w={40} className="shrink-0" />
      <div className="text-[13px] font-bold leading-snug text-white/85">
        You drew this —<br />
        play it now?
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onPlay}
          className="rounded-xl bg-[#66bb6a] px-4 py-1.5 text-[13px] font-extrabold text-[#10241a]"
        >
          Play it
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.94 }}
          onClick={onKeep}
          className="rounded-xl border-2 border-white/15 px-4 py-1 text-[13px] font-bold text-white/70"
        >
          Keep
        </motion.button>
      </div>
    </motion.div>
  );
}

const RULES: [string, string][] = [
  ["Match it", "Play a card matching the top card's color or symbol. Wilds play on anything."],
  ["Or draw", "Draw one card instead. If it's playable you may play it right away, else your turn ends."],
  ["Skip / Reverse", "Skip jumps the next player. Reverse flips direction (with 2 players it acts as a skip)."],
  ["+2 / Wild +4", "The next player draws and loses their turn. Wilds let you pick the new color."],
  ["UNO!", "Press UNO! with the play that leaves you 1 card. Forget it and anyone can catch you: +2 cards."],
  ["Win", "First player with an empty hand wins the round."],
];

export function RulesModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <Backdrop onClose={onClose} z="z-50">
          <motion.div
            className="max-h-[80dvh] w-full max-w-sm overflow-y-auto rounded-3xl border-4 border-white/10 bg-[#1b1b22] p-5"
            initial={{ scale: 0.9, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-baseline justify-between">
              <h2 className="text-lg font-extrabold tracking-wide text-white">How to play</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-xs font-bold uppercase tracking-widest text-white/50 transition-colors hover:text-white"
              >
                Close
              </button>
            </div>
            <div className="mb-3 flex gap-1">
              {UNO_COLORS.map((c) => (
                <span key={c} className="h-1.5 flex-1 rounded-full" style={{ background: UNO_HEX[c] }} />
              ))}
            </div>
            <ul className="space-y-3">
              {RULES.map(([title, body]) => (
                <li key={title}>
                  <div className="text-[13px] font-extrabold text-white/90">{title}</div>
                  <div className="text-[13px] leading-snug text-white/60">{body}</div>
                </li>
              ))}
            </ul>
            <div className="mt-4 rounded-xl border-2 border-white/10 bg-white/5 p-2.5 text-[12px] leading-snug text-white/50">
              Turns auto-resolve after 45 seconds: the game draws a card for you (or passes if you already drew).
            </div>
          </motion.div>
        </Backdrop>
      )}
    </AnimatePresence>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 64 }, (_, i) => ({
    left: hashN(`l${i}`, 96) + 2,
    delay: hashN(`d${i}`, 26) / 10,
    dur: 3 + hashN(`r${i}`, 22) / 8,
    size: 6 + hashN(`s${i}`, 8),
    drift: hashN(`x${i}`, 60) - 30,
    color: Object.values(UNO_HEX)[i % 4],
    round: hashN(`o${i}`, 2) === 0,
  }));
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.round ? p.size : p.size * 1.8,
            borderRadius: p.round ? "50%" : 2,
            background: p.color,
          }}
          initial={{ y: "-6vh", opacity: 0 }}
          animate={{ y: "106vh", x: p.drift, rotate: 620, opacity: [0, 1, 1, 0.7] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

export function GameOverOverlay({
  view,
  party,
  youId,
  isHost,
  playAgain,
  exitToLobby,
}: {
  view: UnoView;
  party: PartyView;
  youId: string;
  isHost: boolean;
  playAgain: () => void;
  exitToLobby: () => void;
}) {
  const winner = view.players.find((p) => p.id === view.winner);
  const youWon = view.winner === youId;
  const tallies = party.tallies.uno ?? {};
  const rows = [...view.players]
    .map((p) => ({ ...p, wins: tallies[p.id] ?? 0 }))
    .sort((a, b) => b.wins - a.wins || a.seat - b.seat);
  return (
    <Backdrop z="z-50">
      <Confetti />
      <motion.div
        className="relative w-full max-w-sm rounded-3xl border-4 border-white/10 bg-[#1b1b22] p-6 text-center"
        initial={{ scale: 0.8, y: 30, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <motion.div
          initial={{ scale: 0.5, rotate: -8 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 0.6, ease: EASE, delay: 0.15 }}
          className="mx-auto mb-2 grid h-16 w-16 place-items-center rounded-full text-2xl font-extrabold text-[#141418]"
          style={{
            background: winner ? seatHex(winner.seat) : "#fff",
            boxShadow: `0 0 34px ${winner ? seatHex(winner.seat) : "#fff"}66`,
          }}
        >
          {winner?.name.slice(0, 1).toUpperCase() ?? "?"}
        </motion.div>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.3em] text-white/50">
          {youWon ? "Victory" : "Winner"}
        </div>
        <div className="mb-4 text-2xl font-extrabold text-white">
          {youWon ? "You won!" : (winner?.name ?? "Unknown")}
        </div>

        <div className="mb-5 overflow-hidden rounded-2xl border-2 border-white/10">
          <div className="bg-white/5 px-3 py-1.5 text-left text-[10px] font-extrabold uppercase tracking-[0.22em] text-white/45">
            UNO wins
          </div>
          {rows.map((p) => (
            <div
              key={p.id}
              className={`flex items-center gap-2 border-t border-white/5 px-3 py-1.5 text-left ${p.left ? "opacity-45 grayscale" : ""}`}
            >
              <span
                className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold text-[#141418]"
                style={{ background: seatHex(p.seat) }}
              >
                {p.name.slice(0, 1).toUpperCase()}
              </span>
              <span className={`flex-1 truncate text-[13px] font-bold ${p.id === view.winner ? "text-white" : "text-white/65"}`}>
                {p.name}
                {p.id === youId ? " (you)" : ""}
                {p.left ? " · left" : ""}
              </span>
              <span className="text-[13px] font-extrabold tabular-nums text-white/85">{p.wins}</span>
            </div>
          ))}
        </div>

        {isHost ? (
          <div className="flex flex-col gap-2">
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={playAgain}
              className="w-full rounded-2xl bg-[#66bb6a] py-3 text-[15px] font-extrabold text-[#10241a]"
              style={{ boxShadow: "0 0 26px #66bb6a44" }}
            >
              Play again
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={exitToLobby}
              className="w-full rounded-2xl border-2 border-white/15 py-2.5 text-[13px] font-bold text-white/70 transition-colors hover:text-white"
            >
              Back to lobby
            </motion.button>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-white/15 py-3 text-[13px] font-bold text-white/50">
            Waiting for the host…
          </div>
        )}
      </motion.div>
    </Backdrop>
  );
}
